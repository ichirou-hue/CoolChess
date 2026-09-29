import asyncio
import json
import logging
import time
import uuid
from typing import Dict, Optional
from fastapi import WebSocket
from sqlalchemy import select

from pvp.models import (
    ChessGameRoom,
    PlayerConnection,
    calculate_pvp_elo_delta,
    ROOM_TTL_FINISHED_SECONDS,
    ROOM_TTL_ABANDONED_SECONDS,
)

logger = logging.getLogger(__name__)


class PVPConnectionManager:
    """Менеджер комнат и WebSocket-соединений PvP.

    Комнаты живут в памяти процесса: нужен ровно 1 воркер uvicorn
    (см. backend/entrypoint.sh) и TTL-чистка завершённых/брошенных комнат.
    """

    def __init__(self):
        self.active_rooms: Dict[str, ChessGameRoom] = {}
        self.time_check_task: Optional[asyncio.Task] = None
        self._settle_failures = 0

    def get_room(self, game_id: str) -> Optional[ChessGameRoom]:
        return self.active_rooms.get(game_id)

    def create_room(
        self,
        game_id: str,
        white_player: PlayerConnection,
        black_player: PlayerConnection,
        time_control: int = 180,
        increment: int = 2,
    ) -> ChessGameRoom:
        room = ChessGameRoom(
            game_id=game_id,
            white_player=white_player,
            black_player=black_player,
            base_time_seconds=time_control,
            increment_seconds=increment,
        )
        self.active_rooms[game_id] = room
        return room

    def claim_black_seat(
        self, game_id: str, user_id: uuid.UUID, email: str = "", elo: int = 1200
    ) -> bool:
        """Первый подключившийся чужак занимает открытое место чёрных."""
        room = self.get_room(game_id)
        if not room or not room.black_seat_open:
            return False
        if room.white.user_id == user_id:
            return False
        room.black.user_id = user_id
        room.black.email = email
        room.black.elo = elo
        room.touch()
        return True

    async def connect_player(self, game_id: str, user_id: uuid.UUID, websocket: WebSocket) -> bool:
        await websocket.accept()
        room = self.get_room(game_id)
        if not room:
            await websocket.send_json({"type": "error", "message": "Комната матча не найдена."})
            await websocket.close()
            return False

        if room.white.user_id == user_id:
            room.white.websocket = websocket
            room.white.connected = True
        elif room.black.user_id is not None and room.black.user_id == user_id:
            room.black.websocket = websocket
            room.black.connected = True
        else:
            # Зритель (Spectator)
            room.spectators[user_id] = websocket

        room.touch()
        # Отправляем текущее состояние подключившемуся
        await websocket.send_json({"type": "game_state", "data": room.to_dict()})
        # Оповещаем остальных об обновлении статуса подключения
        await self.broadcast_to_room(
            game_id,
            {"type": "player_status", "user_id": str(user_id), "connected": True},
            exclude=websocket,
        )
        return True

    async def disconnect(self, game_id: str, user_id: uuid.UUID):
        room = self.get_room(game_id)
        if not room:
            return

        if room.white.user_id == user_id:
            room.white.connected = False
            room.white.websocket = None
        elif room.black.user_id is not None and room.black.user_id == user_id:
            room.black.connected = False
            room.black.websocket = None
        elif user_id in room.spectators:
            del room.spectators[user_id]

        room.touch()
        await self.broadcast_to_room(
            game_id,
            {"type": "player_status", "user_id": str(user_id), "connected": False},
        )

    async def broadcast_to_room(self, game_id: str, message: dict, exclude: Optional[WebSocket] = None):
        room = self.get_room(game_id)
        if not room:
            return

        targets = []
        if room.white.websocket and room.white.websocket != exclude:
            targets.append(room.white.websocket)
        if room.black.websocket and room.black.websocket != exclude:
            targets.append(room.black.websocket)
        for ws in room.spectators.values():
            if ws != exclude:
                targets.append(ws)

        for ws in targets:
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.warning(f"Ошибка отправки WS сообщения: {e}")

    # --- Фоновые задачи: таймауты и TTL ---

    async def start_background_tasks(self, check_interval: float = 1.0):
        """Периодическая проверка шахматных часов и чистка комнат."""
        if self.time_check_task and not self.time_check_task.done():
            return
        self.time_check_task = asyncio.create_task(self._time_check_loop(check_interval))
        logger.info("[PvP] Фоновый таймер шахматных часов запущен.")

    async def stop_background_tasks(self):
        if self.time_check_task:
            self.time_check_task.cancel()
            try:
                await self.time_check_task
            except asyncio.CancelledError:
                pass
            self.time_check_task = None
            logger.info("[PvP] Фоновый таймер остановлен.")

    async def _time_check_loop(self, check_interval: float):
        try:
            while True:
                await asyncio.sleep(check_interval)
                await self.check_timeouts_once()
                self.cleanup_rooms()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"[PvP] Ошибка фонового таймера: {e}")

    async def check_timeouts_once(self):
        """Одна итерация: списать время, завершить партии с флагом, разослать итог."""
        loop = asyncio.get_event_loop()
        now = loop.time()
        for game_id, room in list(self.active_rooms.items()):
            if not room.is_active or room.game_over:
                continue
            timeout = room.update_clock(now)
            if timeout:
                room.touch()
                await self.broadcast_to_room(
                    game_id,
                    {
                        "type": "game_over",
                        "result": room.result,
                        "reason": room.termination_reason,
                        "data": room.to_dict(),
                    },
                )
                self.schedule_settle(room)

    def cleanup_rooms(self):
        """Удаляет завершённые (старше TTL) и брошенные комнаты."""
        now_wall = time.time()
        for game_id, room in list(self.active_rooms.items()):
            age = now_wall - room.last_activity_wall
            nobody_connected = not room.white.connected and not room.black.connected
            if room.game_over and age > ROOM_TTL_FINISHED_SECONDS:
                del self.active_rooms[game_id]
                logger.info(f"[PvP] Комната {game_id} удалена (завершена, TTL).")
            elif not room.game_over and nobody_connected and age > ROOM_TTL_ABANDONED_SECONDS:
                del self.active_rooms[game_id]
                logger.info(f"[PvP] Комната {game_id} удалена (брошена, TTL).")

    # --- Рейтинг по итогам PvP ---

    def schedule_settle(self, room: ChessGameRoom):
        """Запланировать начисление Elo в фоне (не блокирует WS-цикл)."""
        try:
            loop = asyncio.get_event_loop()
            loop.create_task(self.settle_ratings(room))
        except RuntimeError as e:
            logger.warning(f"[PvP] Нет event loop для settle {room.game_id}: {e}")

    async def settle_ratings(self, room: ChessGameRoom):
        """Симметричный пересчёт Elo обоим участникам (K=32, пол 100)."""
        if room.black_seat_open or room.white.user_id is None:
            return
        if room.white.user_id == room.black.user_id:
            return
        try:
            # Локальный импорт: избежать циклов и тяжёлого импорта на старту.
            from database import async_session_maker
            from auth.models import User

            if room.result == "1-0":
                white_actual, black_actual = 1.0, 0.0
            elif room.result == "0-1":
                white_actual, black_actual = 0.0, 1.0
            else:
                white_actual = black_actual = 0.5

            async with async_session_maker() as session:
                white = (
                    await session.execute(select(User).where(User.id == room.white.user_id))
                ).scalar_one_or_none()
                black = (
                    await session.execute(select(User).where(User.id == room.black.user_id))
                ).scalar_one_or_none()
                if not white or not black:
                    return
                white_delta = calculate_pvp_elo_delta(white.elo_rating, black.elo_rating, white_actual)
                black_delta = calculate_pvp_elo_delta(black.elo_rating, white.elo_rating, black_actual)
                white.elo_rating = max(100, white.elo_rating + white_delta)
                black.elo_rating = max(100, black.elo_rating + black_delta)
                white.games_played += 1
                black.games_played += 1
                await session.commit()
                logger.info(
                    f"[PvP] Рейтинг засчитан {room.game_id}: "
                    f"white {white_delta:+d}, black {black_delta:+d}."
                )
        except Exception as e:
            # БД может быть недоступна в тестах/dev — партия уже завершена,
            # рейтинг просто не запишется. Не роняем WS-цикл.
            self._settle_failures += 1
            logger.warning(f"[PvP] Не удалось записать рейтинг {room.game_id}: {e}")


# Глобальный синглтон менеджера
pvp_manager = PVPConnectionManager()
