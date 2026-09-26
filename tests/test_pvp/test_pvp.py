import uuid
import pytest
from starlette.testclient import TestClient

from auth.manager import JWT_SECRET
from fastapi_users.jwt import generate_jwt
from pvp.models import ChessGameRoom, PlayerConnection
from pvp.manager import pvp_manager
from server import app


def create_token_for_user(user_id: uuid.UUID) -> str:
    return generate_jwt(
        data={"sub": str(user_id), "aud": ["fastapi-users:auth"]},
        secret=JWT_SECRET,
        lifetime_seconds=3600,
    )


# --- 1. Тесты логики комнаты и шахматных часов ---

def test_chess_game_room_move_and_increment():
    white_id = uuid.uuid4()
    black_id = uuid.uuid4()
    white = PlayerConnection(user_id=white_id, email="w@test.com", elo=1500)
    black = PlayerConnection(user_id=black_id, email="b@test.com", elo=1500)

    room = ChessGameRoom(
        game_id="room-1",
        white_player=white,
        black_player=black,
        base_time_seconds=60,
        increment_seconds=2,
    )

    current_time = 1000.0
    room.start_clock_if_needed(current_time)

    # 1. Белые делают легальный ход e2e4 спустя 5 секунд
    current_time += 5.0
    success, err = room.apply_move("e2e4", current_time)
    assert success is True
    assert err is None
    # 60 - 5 + 2 инкремент = 57 сек
    assert round(room.white_time_left, 1) == 57.0

    # 2. Нелегальный ход за чёрных
    current_time += 1.0
    success, err = room.apply_move("e2e5", current_time)
    assert success is False
    assert "Недопустимый ход" in err

    # 3. Легальный ответ чёрных e7e5 спустя 2 секунды
    current_time += 2.0
    success, err = room.apply_move("e7e5", current_time)
    assert success is True
    # 60 - (1+2) + 2 инкремент = 59 сек
    assert round(room.black_time_left, 1) == 59.0


def test_chess_game_room_timeout():
    white = PlayerConnection(user_id=uuid.uuid4(), email="w@test.com", elo=1500)
    black = PlayerConnection(user_id=uuid.uuid4(), email="b@test.com", elo=1500)

    room = ChessGameRoom(
        game_id="room-timeout",
        white_player=white,
        black_player=black,
        base_time_seconds=10,
        increment_seconds=0,
    )

    current_time = 100.0
    room.start_clock_if_needed(current_time)

    # Прошло 15 секунд при базовых 10 сек
    current_time += 15.0
    timeout = room.update_clock(current_time)
    assert timeout == "timeout_white"
    assert room.game_over is True
    assert room.result == "0-1"
    assert room.termination_reason == "timeout"


# --- 2. Тесты WebSocket эндпоинта ---

def test_pvp_ws_unauthorized():
    client = TestClient(app)
    # Попытка подключиться без токена
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/pvp/game-123"):
            pass


def test_pvp_ws_gameplay_flow():
    client = TestClient(app)
    white_id = uuid.uuid4()
    black_id = uuid.uuid4()

    white = PlayerConnection(user_id=white_id, email="white@test.com", elo=1500)
    black = PlayerConnection(user_id=black_id, email="black@test.com", elo=1500)
    pvp_manager.create_room("game-test-flow", white, black, time_control=300, increment=2)

    token_white = create_token_for_user(white_id)
    token_black = create_token_for_user(black_id)

    # 1. Подключение белых
    with client.websocket_connect(f"/ws/pvp/game-test-flow?token={token_white}") as ws_w:
        init_msg = ws_w.receive_json()
        assert init_msg["type"] == "game_state"

        # Пинг-понг
        ws_w.send_json({"action": "ping"})
        pong = ws_w.receive_json()
        assert pong["type"] == "pong"

        # 2. Подключение чёрных во втором клиенте
        with client.websocket_connect(f"/ws/pvp/game-test-flow?token={token_black}") as ws_b:
            init_b = ws_b.receive_json()
            assert init_b["type"] == "game_state"

            # Белые получают broadcast о статусе подключения черных
            status_msg = ws_w.receive_json()
            assert status_msg["type"] == "player_status"
            assert status_msg["connected"] is True

            # 3. Белые делают ход 1. e4
            ws_w.send_json({"action": "move", "move": "e2e4"})

            # Оба игрока получают broadcast с ходом
            w_move_event = ws_w.receive_json()
            b_move_event = ws_b.receive_json()
            assert w_move_event["type"] == "move_made"
            assert b_move_event["type"] == "move_made"
            assert w_move_event["move"] == "e2e4"

            # 4. Чёрные сдаются
            ws_b.send_json({"action": "resign"})

            w_resign_event = ws_w.receive_json()
            b_resign_event = ws_b.receive_json()
            assert w_resign_event["type"] == "game_over"
            assert b_resign_event["type"] == "game_over"
            assert w_resign_event["result"] == "1-0"
            assert w_resign_event["reason"] == "resignation"