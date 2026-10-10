import uuid
import pytest
import chess
from unittest.mock import MagicMock
from datetime import datetime

from games.models import Game, GameStatus, PlayerColor
from games.game_routes import _board_for_game, _terminal_game_status


def make_fake_game(
    game_id=None,
    user_id=None,
    status=GameStatus.IN_PROGRESS,
    player_color=PlayerColor.WHITE,
    bot_difficulty=1500,
    current_fen=chess.STARTING_FEN,
    moves_uci=""
):
    game = MagicMock(spec=Game)
    game.id = game_id or uuid.uuid4()
    game.user_id = user_id or uuid.uuid4()
    game.status = status
    game.player_color = player_color
    game.bot_difficulty = bot_difficulty
    game.current_fen = current_fen
    game.moves_uci = moves_uci
    game.created_at = datetime(2026, 1, 1, 12, 0, 0)
    game.updated_at = datetime(2026, 1, 1, 12, 0, 0)
    return game


def test_repeated_position_is_drawn_only_at_fivefold_repetition():
    knight_cycle = "g1f3 g8f6 f3g1 f6g8"
    claimable_game = make_fake_game(moves_uci=" ".join([knight_cycle] * 2))
    automatic_draw_game = make_fake_game(moves_uci=" ".join([knight_cycle] * 4))

    claimable_board = _board_for_game(claimable_game)
    automatic_draw_board = _board_for_game(automatic_draw_game)

    assert claimable_board.can_claim_threefold_repetition()
    assert _terminal_game_status(claimable_board, PlayerColor.WHITE) is None
    assert _terminal_game_status(automatic_draw_board, PlayerColor.WHITE) == GameStatus.DRAW


def test_stalemate_is_a_draw():
    board = chess.Board("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")

    assert board.is_stalemate()
    assert _terminal_game_status(board, PlayerColor.WHITE) == GameStatus.DRAW


# --- 1. ПРОВЕРКА АВТОРИЗАЦИИ (401) ---

@pytest.mark.asyncio
async def test_games_unauthorized(anonymous_client):
    res_start = await anonymous_client.post("/api/games/start", json={})
    assert res_start.status_code == 401

    res_active = await anonymous_client.get("/api/games/active")
    assert res_active.status_code == 401

    res_move = await anonymous_client.post(f"/api/games/{uuid.uuid4()}/move", json={"move_uci": "e2e4"})
    assert res_move.status_code == 401

    res_history = await anonymous_client.get("/api/games/my")
    assert res_history.status_code == 401


# --- 2. СТАРТ ПАРТИИ (POST /api/games/start) ---

@pytest.mark.asyncio
async def test_start_game_as_white(authorized_client):
    client, user, db = authorized_client

    # 1-й select: поиск уже активных игр
    mock_active_res = MagicMock()
    mock_active_res.scalars.return_value.all.return_value = []
    db.execute.return_value = mock_active_res

    response = await client.post(
        "/api/games/start",
        json={"player_color": "white", "difficulty": 1500}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["player_color"] == "white"
    assert data["status"] == "in_progress"
    assert data["current_fen"] == chess.STARTING_FEN
    assert data["moves_uci"] == []
    assert data["last_bot_move"] is None
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_start_game_as_black_bot_moves_first(authorized_client):
    client, user, db = authorized_client

    mock_active_res = MagicMock()
    mock_active_res.scalars.return_value.all.return_value = []
    db.execute.return_value = mock_active_res

    response = await client.post(
        "/api/games/start",
        json={"player_color": "black", "difficulty": 1500}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["player_color"] == "black"
    assert data["status"] == "in_progress"
    # Бот сходил белыми первым ходом
    assert data["last_bot_move"] is not None
    assert len(data["moves_uci"]) == 1
    assert data["current_fen"] != chess.STARTING_FEN


# --- 3. ВОССТАНОВЛЕНИЕ ПАРТИИ (GET /api/games/active) ---

@pytest.mark.asyncio
async def test_get_active_game_found(authorized_client):
    client, user, db = authorized_client
    fake_game = make_fake_game(
        user_id=user.id,
        current_fen="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        moves_uci="e2e4"
    )

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = fake_game
    db.execute.return_value = mock_res

    response = await client.get("/api/games/active")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(fake_game.id)
    assert data["moves_uci"] == ["e2e4"]
    assert data["status"] == "in_progress"


@pytest.mark.asyncio
async def test_get_active_game_none(authorized_client):
    client, user, db = authorized_client

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = None
    db.execute.return_value = mock_res

    response = await client.get("/api/games/active")
    assert response.status_code == 200
    assert response.json() is None


# --- 4. ХОД В ПАРТИИ (POST /api/games/{id}/move) ---

@pytest.mark.asyncio
async def test_make_move_invalid_syntax(authorized_client):
    client, user, db = authorized_client
    fake_game = make_fake_game(user_id=user.id)

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = fake_game
    db.execute.return_value = mock_res

    response = await client.post(
        f"/api/games/{fake_game.id}/move",
        json={"move_uci": "not_a_move"}
    )
    assert response.status_code == 400
    assert "UCI" in response.json()["detail"]


@pytest.mark.asyncio
async def test_make_move_illegal(authorized_client):
    client, user, db = authorized_client
    fake_game = make_fake_game(user_id=user.id)

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = fake_game
    db.execute.return_value = mock_res

    # e2e5 невозможен из начальной позиции
    response = await client.post(
        f"/api/games/{fake_game.id}/move",
        json={"move_uci": "e2e5"}
    )
    assert response.status_code == 400
    assert "Нелегальный ход" in response.json()["detail"]


@pytest.mark.asyncio
async def test_make_move_success_bot_responds(authorized_client):
    client, user, db = authorized_client
    fake_game = make_fake_game(user_id=user.id, current_fen=chess.STARTING_FEN, moves_uci="")

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = fake_game
    db.execute.return_value = mock_res

    response = await client.post(
        f"/api/games/{fake_game.id}/move",
        json={"move_uci": "e2e4"}
    )
    assert response.status_code == 200
    data = response.json()
    # Сходил игрок (e2e4) + ответил бот
    assert len(data["moves_uci"]) == 2
    assert data["moves_uci"][0] == "e2e4"
    assert data["last_bot_move"] is not None
    assert data["status"] == "in_progress"
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_make_move_player_checkmates_bot(authorized_client):
    client, user, db = authorized_client
    # Позиция перед матом черных белым (дурацкий мат): 1. f3 e5 2. g4 -> ход черных Qh4#
    fen_before_mate = "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2"
    fake_game = make_fake_game(
        user_id=user.id,
        player_color=PlayerColor.BLACK,
        bot_difficulty=1500,
        current_fen=fen_before_mate,
        moves_uci="f2f3 e7e5 g2g4"
    )

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = fake_game
    db.execute.return_value = mock_res

    response = await client.post(
        f"/api/games/{fake_game.id}/move",
        json={"move_uci": "d8h4"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "player_won"
    assert data["winner"] == "player"
    assert data["is_game_over"] is True
    assert data["xp_earned"] == 100
    assert data["coins_earned"] == 30
    assert user.xp == 100
    assert user.games_played == 1


@pytest.mark.asyncio
async def test_make_move_bot_checkmates_player_is_not_reported_as_draw(authorized_client, monkeypatch):
    client, user, db = authorized_client
    fen_before_player_move = "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2"
    fake_game = make_fake_game(
        user_id=user.id,
        player_color=PlayerColor.WHITE,
        current_fen=fen_before_player_move,
        moves_uci="f2f3 e7e5",
    )
    board_after_bot = chess.Board(fen_before_player_move)
    board_after_bot.push_uci("g2g4")
    board_after_bot.push_uci("d8h4")

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = fake_game
    db.execute.return_value = mock_res
    monkeypatch.setattr(
        "games.game_routes.maia_engine.predict_move",
        lambda fen, target_rating: {"move_uci": "d8h4", "new_fen": board_after_bot.fen()},
    )

    response = await client.post(
        f"/api/games/{fake_game.id}/move",
        json={"move_uci": "g2g4"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "bot_won"
    assert response.json()["winner"] == "bot"


@pytest.mark.asyncio
async def test_make_move_rejects_illegal_maia_reply_without_changing_game(authorized_client, monkeypatch):
    client, user, db = authorized_client
    fake_game = make_fake_game(user_id=user.id)
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = fake_game
    db.execute.return_value = mock_res
    monkeypatch.setattr(
        "games.game_routes.maia_engine.predict_move",
        lambda fen, target_rating: {
            "move_uci": "e2e4",
            "new_fen": chess.STARTING_FEN,
        },
    )

    response = await client.post(
        f"/api/games/{fake_game.id}/move",
        json={"move_uci": "e2e4"},
    )

    assert response.status_code == 502
    assert "Maia вернула некорректный ход" in response.json()["detail"]
    assert fake_game.current_fen == chess.STARTING_FEN
    db.commit.assert_not_awaited()


# --- 5. СДАЧА ПАРТИИ (POST /api/games/{id}/resign) ---

@pytest.mark.asyncio
async def test_resign_game_success(authorized_client):
    client, user, db = authorized_client
    fake_game = make_fake_game(user_id=user.id)

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = fake_game
    db.execute.return_value = mock_res

    response = await client.post(f"/api/games/{fake_game.id}/resign")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "resigned"
    assert data["winner"] == "bot"
    assert user.games_played == 1
    # Сдача не приносит опыт и монеты (защита от фарма start -> resign),
    # но засчитывается как поражение для Elo.
    assert data["xp_earned"] == 0
    assert data["coins_earned"] == 0
    assert user.xp == 0
    assert user.coins == 0


# --- 6. ИСТОРИЯ ПАРТИЙ (GET /api/games/my) ---

@pytest.mark.asyncio
async def test_get_my_games_history(authorized_client):
    client, user, db = authorized_client
    fake_game = make_fake_game(user_id=user.id, status=GameStatus.PLAYER_WON, moves_uci="e2e4 e7e5")

    mock_res = MagicMock()
    mock_res.scalars.return_value.all.return_value = [fake_game]
    db.execute.return_value = mock_res

    response = await client.get("/api/games/my")
    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1
    assert items[0]["id"] == str(fake_game.id)
    assert items[0]["moves_count"] == 2
    assert items[0]["status"] == "player_won"

# --- СТАРТ С АКТИВНОЙ ПАРТИЕЙ: ШТРАФ КАК ЗА СДАЧУ ---

@pytest.mark.asyncio
async def test_start_game_penalizes_abandoned_active_game(authorized_client):
    client, user, db = authorized_client
    assert user.elo_rating == 1200

    old_game = make_fake_game(user_id=user.id, bot_difficulty=1500)
    mock_active_res = MagicMock()
    mock_active_res.scalars.return_value.all.return_value = [old_game]
    db.execute.return_value = mock_active_res

    response = await client.post(
        "/api/games/start",
        json={"player_color": "white", "difficulty": 1500}
    )
    assert response.status_code == 200
    # Старая партия закрыта как сданная, Elo снят как за поражение, XP не начислен
    assert old_game.status == GameStatus.RESIGNED
    assert user.elo_rating < 1200
    assert user.xp == 0
    assert user.games_played == 1
