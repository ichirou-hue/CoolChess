import uuid
import enum
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field


class LeaderboardCategory(str, enum.Enum):
    ELO = "elo"
    LEVEL = "level"
    PUZZLES = "puzzles"


class LeaderboardUserItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rank: int = Field(..., description="Место в рейтинге (1, 2, 3...)")
    user_id: uuid.UUID
    email: str
    elo_rating: int
    level: int
    xp: int
    puzzles_solved: int


class MyRankInfo(BaseModel):
    rank: int = Field(..., description="Текущее место пользователя")
    elo_rating: int
    level: int
    xp: int
    puzzles_solved: int


class LeaderboardResponse(BaseModel):
    category: LeaderboardCategory
    top_players: List[LeaderboardUserItem]
    my_rank: Optional[MyRankInfo] = None