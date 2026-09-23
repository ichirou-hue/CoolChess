import uuid
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field
from games.models import GameStatus, PlayerColor


class GameCreateRequest(BaseModel):
    player_color: PlayerColor = Field(default=PlayerColor.WHITE, description="Цвет фигур игрока")
    difficulty: int = Field(default=1500, description="Уровень Maia (Elo): 1100, 1300, 1500, 1700, 1900")


class PlayerMoveRequest(BaseModel):
    move_uci: str = Field(..., description="Ход игрока в формате UCI, например 'e2e4' или 'e7e8q'")


class GameResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: GameStatus
    player_color: PlayerColor
    bot_difficulty: int
    current_fen: str
    moves_uci: List[str]
    is_check: bool = False
    is_game_over: bool = False
    winner: Optional[str] = None
    last_bot_move: Optional[str] = None
    xp_earned: int = 0
    coins_earned: int = 0


class GameHistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: GameStatus
    player_color: PlayerColor
    bot_difficulty: int
    moves_count: int
    created_at: str