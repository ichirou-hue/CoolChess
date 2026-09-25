import os
import pytest
import chess
from unittest.mock import MagicMock, patch
from bot.bot_service import MaiaBotService, maia_engine


@pytest.fixture
def mock_bot_service():
    """Создает экземпляр сервиса без попытки загрузки тяжелой модели."""
    with patch.object(MaiaBotService, "_load_engine"):
        service = MaiaBotService()
        service.engine = None
        return service


# --- 1. ТЕСТЫ ШАХМАТНОЙ ЛОГИКИ И КРАЕВЫХ СОСТОЯНИЙ ---

def test_predict_move_game_over(mock_bot_service):
    """Позиция с матом: игра окончена, ходы не должны генерироваться."""
    # Дурацкий мат (черные поставили мат белым: 1. f3 e5 2. g4 Qh4#)
    checkmate_fen = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"
    result = mock_bot_service.predict_move(checkmate_fen)

    assert result["game_over"] is True
    assert result["move_uci"] is None
    assert result["move_san"] is None
    assert result["fen"] == checkmate_fen


def test_predict_move_fallback_when_engine_none(mock_bot_service):
    """Если движок не инициализирован, сервис берет первый легальный ход."""
    fen = chess.STARTING_FEN
    result = mock_bot_service.predict_move(fen, target_rating=1500)

    assert "move_uci" in result
    assert result["move_uci"] is not None
    assert "new_fen" in result
    assert result["is_game_over"] is False
    assert result["difficulty"] == 1500

    # Проверяем, что ход действительно легален для начальной позиции
    board = chess.Board(fen)
    move = chess.Move.from_uci(result["move_uci"])
    assert move in board.legal_moves


def test_predict_move_invalid_fen(mock_bot_service):
    """Некорректный FEN должен вызывать ValueError от python-chess."""
    invalid_fen = "invalid_fen_string_123"
    with pytest.raises(ValueError):
        mock_bot_service.predict_move(invalid_fen)


# --- 2. ТЕСТЫ ВЗАИМОДЕЙСТВИЯ С ДВИЖКОМ MAIA (MOCK) ---

def test_predict_move_with_engine_tuple_response(mock_bot_service):
    """Проверка случая, когда score_moves() возвращает кортеж (best_move, ...)."""
    mock_engine = MagicMock()
    mock_engine.cfg = MagicMock()
    # Имитируем, что модель выбирает ход e2e4
    expected_move = chess.Move.from_uci("e2e4")
    mock_engine.score_moves.return_value = (expected_move, [])
    mock_bot_service.engine = mock_engine

    result = mock_bot_service.predict_move(chess.STARTING_FEN, target_rating=1800)

    assert mock_engine.cfg.elo == 1800
    mock_engine.cmd_position.assert_called_once_with(f"position fen {chess.STARTING_FEN}")
    assert result["move_uci"] == "e2e4"
    assert result["move_san"] == "e4"
    assert result["difficulty"] == 1800


def test_predict_move_with_engine_list_response(mock_bot_service):
    """Проверка случая, когда score_moves() возвращает список словарей [{'move': ...}]."""
    mock_engine = MagicMock()
    mock_engine.cfg = MagicMock()
    expected_move = chess.Move.from_uci("d2d4")
    mock_engine.score_moves.return_value = [{"move": expected_move}]
    mock_bot_service.engine = mock_engine

    result = mock_bot_service.predict_move(chess.STARTING_FEN, target_rating=1200)

    assert result["move_uci"] == "d2d4"
    assert result["move_san"] == "d4"


def test_predict_move_engine_exception_fallback(mock_bot_service):
    """Если при инференсе вылетает Exception, сервис должен мягко откатиться к fallback-ходу."""
    mock_engine = MagicMock()
    mock_engine.score_moves.side_effect = RuntimeError("CUDA Out of Memory")
    mock_bot_service.engine = mock_engine

    result = mock_bot_service.predict_move(chess.STARTING_FEN)

    # Проверяем, что запрос не упал, а сработал резервный ход
    assert result["move_uci"] is not None
    board = chess.Board(chess.STARTING_FEN)
    assert chess.Move.from_uci(result["move_uci"]) in board.legal_moves


# --- 3. ИНТЕГРАЦИОННЫЙ ТЕСТ С СИНГЛТОНОМ maia_engine ---

def test_global_maia_engine_instance():
    """Проверка синглтона: он должен быть создан и уметь генерировать легальный ход."""
    assert maia_engine is not None
    result = maia_engine.predict_move(chess.STARTING_FEN, target_rating=1500)

    assert "move_uci" in result
    assert "new_fen" in result
    board = chess.Board(chess.STARTING_FEN)
    assert chess.Move.from_uci(result["move_uci"]) in board.legal_moves