import pytest
import chess
from unittest.mock import patch


@pytest.mark.asyncio
async def test_bot_move_success_default_fen(anonymous_client):
    """Успешный запрос с дефолтными значениями (начальная позиция, difficulty=1500)."""
    response = await anonymous_client.post(
        "/api/bot/move",
        json={}
    )
    assert response.status_code == 200

    data = response.json()
    assert "move_uci" in data
    assert "new_fen" in data
    assert "difficulty" in data
    assert data["difficulty"] == 1500
    assert data["is_game_over"] is False

    # Проверяем, что ход легален для стартовой позиции
    board = chess.Board()
    move = chess.Move.from_uci(data["move_uci"])
    assert move in board.legal_moves


@pytest.mark.asyncio
async def test_bot_move_custom_fen_and_difficulty(anonymous_client):
    """Запрос с кастомным FEN и уровнем сложности 1900."""
    # Позиция после 1. e4 e5
    custom_fen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"
    response = await anonymous_client.post(
        "/api/bot/move",
        json={"fen": custom_fen, "difficulty": 1900}
    )
    assert response.status_code == 200

    data = response.json()
    assert data["difficulty"] == 1900
    assert data["move_uci"] is not None

    board = chess.Board(custom_fen)
    move = chess.Move.from_uci(data["move_uci"])
    assert move in board.legal_moves


@pytest.mark.asyncio
async def test_bot_move_invalid_fen_returns_400(anonymous_client):
    """Некорректная нотация FEN возвращает 400 Bad Request."""
    response = await anonymous_client.post(
        "/api/bot/move",
        json={"fen": "invalid_fen_string", "difficulty": 1500}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Некорректная нотация FEN"


@pytest.mark.asyncio
async def test_bot_move_terminal_game_over_fen(anonymous_client):
    """При передаче позиции с матом возвращается game_over: true и пустой ход."""
    checkmate_fen = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"
    response = await anonymous_client.post(
        "/api/bot/move",
        json={"fen": checkmate_fen}
    )
    assert response.status_code == 200

    data = response.json()
    assert data["game_over"] is True
    assert data["move_uci"] is None