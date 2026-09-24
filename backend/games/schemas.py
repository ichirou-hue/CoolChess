import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict

from games.models import GameStatus, PlayerColor


class GameCreateRequest(BaseModel):
    player_color: PlayerColor = Field(default=PlayerColor.WHITE, description="Цвет фигур игрока")
    difficulty: int = Field(default=1300, ge=1, le=2500, description="Сложность бота Maia (уровень 1-5 или целевой Elo)")


class PlayerMoveRequest(BaseModel):
    move_uci: str = Field(..., description="Ход в нотации UCI, например 'e2e4'")


class GameResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: GameStatus
    player_color: PlayerColor
    bot_difficulty: int
    current_fen: str
    moves_uci: List[str]
    is_check: bool
    is_game_over: bool
    winner: Optional[str] = None
    last_bot_move: Optional[str] = None
    xp_earned: int = 0
    coins_earned: int = 0
    elo_delta: int = 0


class GameHistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: GameStatus
    player_color: PlayerColor
    bot_difficulty: int
    moves_count: int
    created_at: str