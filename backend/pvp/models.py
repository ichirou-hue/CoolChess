import asyncio
import uuid
import chess
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional, Dict
from fastapi import WebSocket


@dataclass
class PlayerConnection:
    user_id: uuid.UUID
    email: str
    elo: int
    websocket: Optional[WebSocket] = None
    connected: bool = False


class ChessGameRoom:
    """Управление состоянием одной PvP-партии и таймерами на сервере."""

    def __init__(
        self,
        game_id: str,
        white_player: PlayerConnection,
        black_player: PlayerConnection,
        base_time_seconds: int = 180,  # 3 минуты по умолчанию
        increment_seconds: int = 2,    # +2 сек инкремент
    ):
        self.game_id = game_id
        self.white = white_player
        self.black = black_player
        self.base_time = base_time_seconds
        self.increment = increment_seconds

        self.board = chess.Board()
        self.white_time_left: float = float(base_time_seconds)
        self.black_time_left: float = float(base_time_seconds)
        
        self.last_move_time: Optional[float] = None
        self.is_active: bool = False
        self.game_over: bool = False
        self.result: Optional[str] = None  # "1-0", "0-1", "1/2-1/2"
        self.termination_reason: Optional[str] = None  # "checkmate", "timeout", "resignation", "draw"
        
        self.draw_offered_by: Optional[uuid.UUID] = None
        self.spectators: Dict[uuid.UUID, WebSocket] = {}

    def start_clock_if_needed(self, current_loop_time: float):
        """Часы запускаются после первого хода белых."""
        if not self.is_active:
            self.is_active = True
            self.last_move_time = current_loop_time

    def update_clock(self, current_loop_time: float) -> Optional[str]:
        """
        Списывает время с активного игрока.
        Возвращает 'timeout_white' или 'timeout_black', если время вышло.
        """
        if not self.is_active or self.game_over or self.last_move_time is None:
            return None

        elapsed = current_loop_time - self.last_move_time
        self.last_move_time = current_loop_time

        if self.board.turn == chess.WHITE:
            self.white_time_left -= elapsed
            if self.white_time_left <= 0:
                self.white_time_left = 0
                self.end_game("0-1", "timeout")
                return "timeout_white"
        else:
            self.black_time_left -= elapsed
            if self.black_time_left <= 0:
                self.black_time_left = 0
                self.end_game("1-0", "timeout")
                return "timeout_black"

        return None

    def apply_move(self, uci_move: str, current_loop_time: float) -> tuple[bool, Optional[str]]:
        """
        Валидирует и выполняет ход.
        Возвращает (success: bool, error_message: Optional[str]).
        """
        if self.game_over:
            return False, "Партия уже завершена"

        # 1. Проверяем таймаут перед ходом
        timeout = self.update_clock(current_loop_time)
        if timeout:
            return False, f"Время вышло: {timeout}"

        # 2. Проверяем валидность хода в python-chess
        try:
            move = chess.Move.from_uci(uci_move)
        except ValueError:
            return False, "Некорректный синтаксис хода UCI"

        if move not in self.board.legal_moves:
            return False, "Недопустимый ход по правилам шахмат"

        # 3. Применяем ход
        self.board.push(move)

        # 4. Добавляем инкремент сделавшему ход
        # Если ход сделали белые, сейчас turn == chess.BLACK
        if self.board.turn == chess.BLACK:
            self.white_time_left += self.increment
        else:
            self.black_time_left += self.increment

        self.last_move_time = current_loop_time
        self.is_active = True
        self.draw_offered_by = None  # Любой ход сбрасывает предложение ничьей

        # 5. Проверяем окончание партии по правилам шахмат
        if self.board.is_checkmate():
            result = "1-0" if self.board.turn == chess.BLACK else "0-1"
            self.end_game(result, "checkmate")
        elif self.board.is_stalemate():
            self.end_game("1/2-1/2", "stalemate")
        elif self.board.is_insufficient_material():
            self.end_game("1/2-1/2", "insufficient_material")
        elif self.board.can_claim_fifty_moves():
            self.end_game("1/2-1/2", "fifty_moves")
        elif self.board.can_claim_threefold_repetition():
            self.end_game("1/2-1/2", "threefold_repetition")

        return True, None

    def end_game(self, result: str, reason: str):
        self.game_over = True
        self.is_active = False
        self.result = result
        self.termination_reason = reason

    def to_dict(self) -> dict:
        return {
            "game_id": self.game_id,
            "fen": self.board.fen(),
            "turn": "white" if self.board.turn == chess.WHITE else "black",
            "is_check": self.board.is_check(),
            "white_time": round(self.white_time_left, 1),
            "black_time": round(self.black_time_left, 1),
            "game_over": self.game_over,
            "result": self.result,
            "reason": self.termination_reason,
            "white_player": {
                "user_id": str(self.white.user_id),
                "email": self.white.email,
                "elo": self.white.elo,
                "connected": self.white.connected,
            },
            "black_player": {
                "user_id": str(self.black.user_id),
                "email": self.black.email,
                "elo": self.black.elo,
                "connected": self.black.connected,
            },
        }