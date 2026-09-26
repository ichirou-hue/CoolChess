import asyncio
import uuid
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from fastapi_users.jwt import decode_jwt

from auth.manager import JWT_SECRET
from pvp.manager import pvp_manager

pvp_router = APIRouter(prefix="/ws/pvp", tags=["PvP WebSockets"])


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

            current_time = loop.time()

            # 1. Сделать ход
            if action == "move":
                # Проверяем очередность
                is_white = room.white.user_id == user_id
                is_black = room.black.user_id == user_id

                if not (is_white or is_black):
                    await websocket.send_json({"type": "error", "message": "Зрители не могут ходить."})
                    continue

                if (is_white and room.board.turn != True) or (is_black and room.board.turn != False):
                    await websocket.send_json({"type": "error", "message": "Сейчас не ваш ход."})
                    continue

                uci_move = data.get("move")
                success, error = room.apply_move(uci_move, current_time)
                if not success:
                    await websocket.send_json({"type": "error", "message": error})
                    continue

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
                if room.white.user_id == user_id:
                    room.end_game("0-1", "resignation")
                elif room.black.user_id == user_id:
                    room.end_game("1-0", "resignation")
                else:
                    continue

                await pvp_manager.broadcast_to_room(
                    game_id,
                    {
                        "type": "game_over",
                        "result": room.result,
                        "reason": room.termination_reason,
                        "data": room.to_dict(),
                    },
                )

            # 3. Предложение ничьей
            elif action == "draw_offer":
                opponent_id = room.black.user_id if room.white.user_id == user_id else room.white.user_id
                room.draw_offered_by = user_id
                await pvp_manager.broadcast_to_room(
                    game_id,
                    {"type": "draw_offered", "by": str(user_id)},
                )

            # 4. Согласие на ничью
            elif action == "draw_accept":
                if room.draw_offered_by and room.draw_offered_by != user_id:
                    room.end_game("1/2-1/2", "draw_agreement")
                    await pvp_manager.broadcast_to_room(
                        game_id,
                        {
                            "type": "game_over",
                            "result": "1/2-1/2",
                            "reason": "draw_agreement",
                            "data": room.to_dict(),
                        },
                    )

    except WebSocketDisconnect:
        await pvp_manager.disconnect(game_id, user_id)
    except Exception as e:
        await pvp_manager.disconnect(game_id, user_id)