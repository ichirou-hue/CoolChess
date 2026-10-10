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

# --- 3. PvP Elo и открытые места ---

def test_calculate_pvp_elo_delta():
    from pvp.models import calculate_pvp_elo_delta
    # Равные: победа даёт +16
    assert calculate_pvp_elo_delta(1500, 1500, 1.0) == 16
    assert calculate_pvp_elo_delta(1500, 1500, 0.0) == -16
    assert calculate_pvp_elo_delta(1500, 1500, 0.5) == 0
    # Победа слабого над сильным — больше, чем равного над равным
    assert calculate_pvp_elo_delta(1200, 1800, 1.0) > 16
    # Победа сильного над слабым — меньше
    assert calculate_pvp_elo_delta(1800, 1200, 1.0) < 16


def test_claim_black_seat():
    from pvp.models import PlayerConnection
    white_id = uuid.uuid4()
    white = PlayerConnection(user_id=white_id, email="w@test.com", elo=1500)
    black = PlayerConnection(user_id=None)
    pvp_manager.create_room("game-claim-test", white, black)
    room = pvp_manager.get_room("game-claim-test")
    assert room.black_seat_open is True

    newcomer = uuid.uuid4()
    assert pvp_manager.claim_black_seat("game-claim-test", newcomer, email="n@t.com", elo=1300) is True
    assert room.black_seat_open is False
    assert room.black.user_id == newcomer
    # Второе место уже занято
    assert pvp_manager.claim_black_seat("game-claim-test", uuid.uuid4()) is False


@pytest.mark.asyncio
async def test_direct_invite_waits_for_both_players_to_connect():
    from unittest.mock import AsyncMock

    white_id = uuid.uuid4()
    black_id = uuid.uuid4()
    room = pvp_manager.create_room(
        "direct-invite-acceptance",
        PlayerConnection(user_id=white_id),
        PlayerConnection(user_id=black_id),
        requires_opponent_acceptance=True,
    )

    assert room.both_players_accepted is False
    assert room.to_dict()["waiting_opponent"] is True

    white_socket = AsyncMock()
    await pvp_manager.connect_player(room.game_id, white_id, white_socket)
    assert room.both_players_accepted is False

    black_socket = AsyncMock()
    await pvp_manager.connect_player(room.game_id, black_id, black_socket)
    assert room.both_players_accepted is True
    assert room.to_dict()["waiting_opponent"] is False
    updated_state = white_socket.send_json.await_args.args[0]["data"]
    assert updated_state["waiting_opponent"] is False
    assert updated_state["black_player"]["connected"] is True


@pytest.mark.asyncio
async def test_unaccepted_direct_invite_is_not_settled(monkeypatch):
    from unittest.mock import AsyncMock

    white_id = uuid.uuid4()
    black_id = uuid.uuid4()
    room = pvp_manager.create_room(
        "direct-invite-no-settlement",
        PlayerConnection(user_id=white_id),
        PlayerConnection(user_id=black_id),
        requires_opponent_acceptance=True,
    )
    room.end_game("0-1", "resignation")
    session_factory = AsyncMock()
    monkeypatch.setattr("database.async_session_maker", session_factory)

    await pvp_manager.settle_ratings(room)

    session_factory.assert_not_called()


def test_direct_invite_cannot_move_or_start_clock_before_acceptance():
    client = TestClient(app)
    white_id = uuid.uuid4()
    black_id = uuid.uuid4()
    room = pvp_manager.create_room(
        "direct-invite-before-acceptance",
        PlayerConnection(user_id=white_id),
        PlayerConnection(user_id=black_id),
        requires_opponent_acceptance=True,
    )

    token_white = create_token_for_user(white_id)
    with client.websocket_connect(
        f"/ws/pvp/{room.game_id}?token={token_white}"
    ) as websocket:
        assert websocket.receive_json()["type"] == "game_state"
        websocket.send_json({"action": "move", "move": "e2e4"})
        error = websocket.receive_json()

    assert error["type"] == "error"
    assert "не принял приглашение" in error["message"]
    assert room.board.ply() == 0
    assert room.is_active is False


# --- 4. HTTP-создание комнаты ---

import pytest as _pytest


@_pytest.mark.asyncio
async def test_pvp_http_create_and_state(authorized_client):
    client, user, _db = authorized_client
    response = await client.post(
        "/api/pvp/create", json={"time_control": 300, "increment": 5}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["game_id"]) == 5
    assert data["room_code"] == data["game_id"]
    assert data["color"] == "white"
    assert data["time_control"] == 300
    assert data["increment"] == 5

    state = await client.get(f"/api/pvp/{data['game_id']}")
    assert state.status_code == 200
    assert state.json()["waiting_opponent"] is True
    assert state.json()["white_player"]["user_id"] == str(user.id)


@_pytest.mark.asyncio
async def test_pvp_http_create_validation(authorized_client):
    client, _user, _db = authorized_client
    response = await client.post(
        "/api/pvp/create", json={"time_control": 10, "increment": 5}
    )
    assert response.status_code == 422


@_pytest.mark.asyncio
async def test_pvp_http_state_not_found(authorized_client):
    client, _user, _db = authorized_client
    response = await client.get("/api/pvp/no-such-room")
    assert response.status_code == 404


# --- 5. Фоновый таймаут и чистка ---

@_pytest.mark.asyncio
async def test_background_timeout_ends_game():
    import asyncio as _asyncio
    white = PlayerConnection(user_id=uuid.uuid4(), email="w@test.com", elo=1500)
    black = PlayerConnection(user_id=uuid.uuid4(), email="b@test.com", elo=1500)
    room = pvp_manager.create_room("game-bg-timeout", white, black, time_control=5, increment=0)
    loop = _asyncio.get_event_loop()
    room.start_clock_if_needed(loop.time())
    room.last_move_time = loop.time() - 10.0  # время белых вышло

    await pvp_manager.check_timeouts_once()
    assert room.game_over is True
    assert room.result == "0-1"
    assert room.termination_reason == "timeout"


def test_cleanup_rooms_removes_finished():
    import time as _time
    white = PlayerConnection(user_id=uuid.uuid4(), email="w@test.com", elo=1500)
    black = PlayerConnection(user_id=uuid.uuid4(), email="b@test.com", elo=1500)
    room = pvp_manager.create_room("game-cleanup-test", white, black)
    room.end_game("1-0", "checkmate")
    room.last_activity_wall = _time.time() - 3600
    pvp_manager.cleanup_rooms()
    assert pvp_manager.get_room("game-cleanup-test") is None


# --- 6. Прямой матч POST /api/pvp/rooms (контракт фронта) ---

@_pytest.mark.asyncio
async def test_pvp_rooms_self_match_rejected(authorized_client):
    from unittest.mock import MagicMock as _MM
    client, user, db = authorized_client
    response = await client.post(
        "/api/pvp/rooms",
        json={"opponent_id": str(user.id), "time_control": 180, "increment": 2},
    )
    assert response.status_code == 400


@_pytest.mark.asyncio
async def test_pvp_rooms_opponent_not_found(authorized_client):
    import uuid as _uuid
    from unittest.mock import MagicMock as _MM
    client, _user, db = authorized_client
    mock_res = _MM()
    mock_res.scalar_one_or_none.return_value = None
    db.execute.return_value = mock_res
    response = await client.post(
        "/api/pvp/rooms",
        json={"opponent_id": str(_uuid.uuid4()), "time_control": 180, "increment": 2},
    )
    assert response.status_code == 404


@_pytest.mark.asyncio
async def test_pvp_rooms_create_and_get(authorized_client):
    import uuid as _uuid
    from unittest.mock import MagicMock as _MM
    client, user, db = authorized_client
    opponent = _MM()
    opponent.id = _uuid.uuid4()
    opponent.email = "opp@test.com"
    opponent.elo_rating = 1400
    mock_res = _MM()
    mock_res.scalar_one_or_none.return_value = opponent
    db.execute.return_value = mock_res

    response = await client.post(
        "/api/pvp/rooms",
        json={"opponent_id": str(opponent.id), "time_control": 180, "increment": 2},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "waiting"
    assert data["data"]["waiting_opponent"] is True
    assert data["data"]["black_player"]["user_id"] == str(opponent.id)

    state = await client.get(f"/api/pvp/rooms/{data['game_id']}")
    assert state.status_code == 200
    assert state.json()["game_id"] == data["game_id"]
