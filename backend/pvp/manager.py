import asyncio
import json
import logging
from typing import Dict, Optional
import uuid
from fastapi import WebSocket

from pvp.models import ChessGameRoom, PlayerConnection

logger = logging.getLogger(__name__)


class PVPConnectionManager:
    """Менеджер комнат и WebSocket-соединений PvP."""

    def __init__(self):
        self.active_rooms: Dict[str, ChessGameRoom] = {}
        self.time_check_task: Optional[asyncio.Task] = None

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
        elif room.black.user_id == user_id:
            room.black.websocket = websocket
            room.black.connected = True
        else:
            # Зритель (Spectator)
            room.spectators[user_id] = websocket

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
        elif room.black.user_id == user_id:
            room.black.connected = False
            room.black.websocket = None
        elif user_id in room.spectators:
            del room.spectators[user_id]

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


# Глобальный синглтон менеджера
pvp_manager = PVPConnectionManager()