import asyncio
import logging
import secrets
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query, status
from fastapi_users.jwt import decode_jwt
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.manager import JWT_SECRET, current_active_user
from auth.models import User
from database import async_session_maker, get_async_session
from pvp.manager import pvp_manager
from pvp.models import PlayerConnection

logger = logging.getLogger(__name__)

pvp_router = APIRouter(prefix="/ws/pvp", tags=["PvP WebSockets"])
pvp_http_router = APIRouter(prefix="/api/pvp", tags=["PvP"])
# Роутер прямого матча (контракт фронтенда: pvpApi.ts). Оба роутера живут
# на префиксе /api/pvp: /create + /{game_id} (открытое место) и
# /rooms + /rooms/{game_id} (матч против конкретного соперника).
pvp_api_router = APIRouter(prefix="/api/pvp", tags=["PvP"])


class PvpCreateRequest(BaseModel):
    time_control: int = Field(default=180, ge=60, le=1800, description="Базовое время в секундах")
    increment: int = Field(default=2, ge=0, le=30, description="Инкремент за ход в секундах")


class PvpCreateResponse(BaseModel):
    game_id: str
    room_code: str
    color: str = "white"
    ws_url: str
    time_control: int
    increment: int


class CreateRoomRequest(BaseModel):
    opponent_id: uuid.UUID
    time_control: int = Field(default=180, ge=30, le=3600)
    increment: int = Field(default=2, ge=0, le=60)


@pvp_api_router.post("/rooms")
async def create_pvp_room_direct(
    payload: CreateRoomRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Прямой матч против конкретного соперника (оба места заняты сразу)."""
    if payload.opponent_id == user.id:
        raise HTTPException(status_code=400, detail="Нельзя создать матч против самого себя.")

    opponent = (await db.execute(select(User).where(User.id == payload.opponent_id))).scalar_one_or_none()
    if not opponent:
        raise HTTPException(status_code=404, detail="Соперник не найден.")

    game_id = str(uuid.uuid4())
    room = pvp_manager.create_room(
        game_id,
        PlayerConnection(user_id=user.id, email=user.email, display_name=user.display_name, elo=user.elo_rating),
        PlayerConnection(user_id=opponent.id, email=opponent.email, display_name=opponent.display_name, elo=opponent.elo_rating),
        time_control=payload.time_control,
        increment=payload.increment,
    )
    return {"game_id": game_id, "status": "waiting", "data": room.to_dict()}


@pvp_api_router.get("/rooms/{game_id}")
async def get_pvp_room(game_id: str):
    room = pvp_manager.get_room(game_id)
    if not room:
        raise HTTPException(status_code=404, detail="Комната матча не найдена.")
    return room.to_dict()


async def get_user_id_from_token(token: Optional[str]) -> Optional[uuid.UUID]:
    """Декодирует JWT токен из query параметра для аутентификации в WebSocket."""
    if not token:
        return None
    try:
        data = decode_jwt(
            token,
            JWT_SECRET,
            audience=["fastapi-users:auth"],
            algorithms=["HS256"],
        )
        user_id_str = data.get("sub")
        return uuid.UUID(user_id_str) if user_id_str else None
    except Exception:
        return None


def _is_player(room, user_id: uuid.UUID) -> bool:
    return room.white.user_id == user_id or (
        room.black.user_id is not None and room.black.user_id == user_id
    )


@pvp_http_router.post("/create", response_model=PvpCreateResponse)
async def create_pvp_room(
    payload: PvpCreateRequest,
    user: User = Depends(current_active_user),
):
    """Создать PvP-комнату. Создатель играет белыми, место чёрных открыто.

    Соперник занимает место чёрных первым подключением к WS.
    """
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    game_id = "".join(secrets.choice(alphabet) for _ in range(5))
    while pvp_manager.get_room(game_id) is not None:
        game_id = "".join(secrets.choice(alphabet) for _ in range(5))
    white = PlayerConnection(user_id=user.id, email=user.email, display_name=user.display_name, elo=user.elo_rating)
    black = PlayerConnection(user_id=None)  # открытое место
    pvp_manager.create_room(
        game_id,
        white,
        black,
        time_control=payload.time_control,
        increment=payload.increment,
    )
    return PvpCreateResponse(
        game_id=game_id,
        room_code=game_id,
        color="white",
        ws_url=f"/ws/pvp/{game_id}",
        time_control=payload.time_control,
        increment=payload.increment,
    )


@pvp_http_router.get("/{game_id}")
async def get_pvp_state(game_id: str, user: User = Depends(current_active_user)):
    """Состояние комнаты по HTTP (тот же снапшот, что и `game_state` в WS)."""
    room = pvp_manager.get_room(game_id)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Комната матча не найдена.")
    return room.to_dict()


@pvp_router.websocket("/{game_id}")
async def pvp_websocket_endpoint(
    websocket: WebSocket,
    game_id: str,
    token: Optional[str] = Query(None),
):
    user_id = await get_user_id_from_token(token)
    if not user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    room = pvp_manager.get_room(game_id)
    if room is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Открытое место чёрных занимает первый подключившийся чужак.
    if (
        not _is_player(room, user_id)
        and user_id not in room.spectators
        and room.black_seat_open
    ):
        email, display_name, elo = "", "", 1200
        try:
            async with async_session_maker() as session:
                db_user = (
                    await session.execute(select(User).where(User.id == user_id))
                ).scalar_one_or_none()
                if db_user:
                    email, display_name, elo = db_user.email, db_user.display_name, db_user.elo_rating
        except Exception as e:
            logger.warning(f"[PvP] Не удалось загрузить пользователя {user_id}: {e}")
        pvp_manager.claim_black_seat(
            game_id, user_id, email=email, display_name=display_name, elo=elo
        )

    connected = await pvp_manager.connect_player(game_id, user_id, websocket)
    if not connected:
        return

    room = pvp_manager.get_room(game_id)
    loop = asyncio.get_event_loop()

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if not room:
                break

            room.touch()
            current_time = loop.time()

            # 1. Сделать ход
            if action == "move":
                # Проверяем очередность
                is_white = room.white.user_id == user_id
                is_black = (
                    room.black.user_id is not None and room.black.user_id == user_id
                )

                if not (is_white or is_black):
                    await websocket.send_json({"type": "error", "message": "Зрители не могут ходить."})
                    continue

                if (is_white and room.board.turn != True) or (is_black and room.board.turn != False):
                    await websocket.send_json({"type": "error", "message": "Сейчас не ваш ход."})
                    continue

                uci_move = data.get("move")
                was_over = room.game_over
                success, error = room.apply_move(uci_move, current_time)
                if not success:
                    await websocket.send_json({"type": "error", "message": error})
                    continue

                room.touch()
                if room.game_over and not was_over:
                    await pvp_manager.broadcast_to_room(
                        game_id,
                        {
                            "type": "game_over",
                            "result": room.result,
                            "reason": room.termination_reason,
                            "move": uci_move,
                            "data": room.to_dict(),
                        },
                    )
                    pvp_manager.schedule_settle(room)
                else:
                    await pvp_manager.broadcast_to_room(
                        game_id,
                        {
                            "type": "move_made",
                            "move": uci_move,
                            "data": room.to_dict(),
                        },
                    )

            # 2. Сдача
            elif action == "resign":
                if not _is_player(room, user_id):
                    await websocket.send_json({"type": "error", "message": "Зрители не могут сдаваться."})
                    continue
                if room.white.user_id == user_id:
                    room.end_game("0-1", "resignation")
                elif room.black.user_id == user_id:
                    room.end_game("1-0", "resignation")
                else:
                    continue

                room.touch()
                await pvp_manager.broadcast_to_room(
                    game_id,
                    {
                        "type": "game_over",
                        "result": room.result,
                        "reason": room.termination_reason,
                        "data": room.to_dict(),
                    },
                )
                pvp_manager.schedule_settle(room)

            # 3. Предложение ничьей (только игроки)
            elif action == "draw_offer":
                if not _is_player(room, user_id):
                    await websocket.send_json({"type": "error", "message": "Зрители не могут предлагать ничью."})
                    continue
                room.draw_offered_by = user_id
                await pvp_manager.broadcast_to_room(
                    game_id,
                    {"type": "draw_offered", "by": str(user_id)},
                )

            # 4. Согласие на ничью (только второй игрок)
            elif action == "draw_accept":
                if not _is_player(room, user_id):
                    await websocket.send_json({"type": "error", "message": "Зрители не могут принимать ничью."})
                    continue
                if room.draw_offered_by and room.draw_offered_by != user_id:
                    room.end_game("1/2-1/2", "draw_agreement")
                    room.touch()
                    await pvp_manager.broadcast_to_room(
                        game_id,
                        {
                            "type": "game_over",
                            "result": "1/2-1/2",
                            "reason": "draw_agreement",
                            "data": room.to_dict(),
                        },
                    )
                    pvp_manager.schedule_settle(room)

    except WebSocketDisconnect:
        await pvp_manager.disconnect(game_id, user_id)
    except Exception:
        logger.exception(f"[PvP] Ошибка WS-цикла {game_id}")
        await pvp_manager.disconnect(game_id, user_id)
