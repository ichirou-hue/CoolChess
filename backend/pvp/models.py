import time
import uuid
import chess
from dataclasses import dataclass
from typing import Optional, Dict
from fastapi import WebSocket


ROOM_TTL_FINISHED_SECONDS = 15 * 60      # завершённые партии держим 15 минут
ROOM_TTL_ABANDONED_SECONDS = 30 * 60     # несобранные комнаты без игроков — 30 минут


def calculate_pvp_elo_delta(user_elo: int, opponent_elo: int, actual: float, k: int = 32) -> int:
    """Симметричная дельта Elo FIDE для PvP: actual 1.0/0.5/0.0."""
    expected = 1.0 / (1.0 + 10.0 ** ((opponent_elo - user_elo) / 400.0))
    return int(round(k * (actual - expected)))


@dataclass
class PlayerConnection:
    user_id: Optional[uuid.UUID]  # None = открытое место (ждём соперника)
    email: str = ""
    display_name: str = ""
    elo: int = 1000
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
        requires_opponent_acceptance: bool = False,
    ):
        self.game_id = game_id
        self.white = white_player
        self.black = black_player
        self.requires_opponent_acceptance = requires_opponent_acceptance
        self.accepted_player_ids: set[uuid.UUID] = set()
        self.base_time = base_time_seconds
        self.increment = increment_seconds

        self.board = chess.Board()
        self.white_time_left: float = float(base_time_seconds)
        self.black_time_left: float = float(base_time_seconds)

        # Часы идут по loop.time(); TTL/активность — по wall-clock.
        self.created_wall = time.time()
        self.last_activity_wall = time.time()

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

    @property
    def black_seat_open(self) -> bool:
        """Место чёрных ждёт соперника (создано через POST /api/pvp/create)."""
        return self.black.user_id is None

    @property
    def both_players_accepted(self) -> bool:
        player_ids = {self.white.user_id, self.black.user_id}
        return (
            not self.requires_opponent_acceptance
            or (
                None not in player_ids
                and player_ids.issubset(self.accepted_player_ids)
            )
        )

    def touch(self) -> None:
        self.last_activity_wall = time.time()

    @staticmethod
    def _player_dict(player: PlayerConnection) -> dict:
        return {
            "user_id": str(player.user_id) if player.user_id else None,
            "email": player.email,
            "display_name": player.display_name,
            "elo": player.elo,
            "connected": player.connected,
        }

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
            "waiting_opponent": self.black_seat_open or not self.both_players_accepted,
            "white_player": self._player_dict(self.white),
            "black_player": self._player_dict(self.black),
        }