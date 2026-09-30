import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum as SQLEnum, Text
from fastapi_users_db_sqlalchemy.generics import GUID
from sqlalchemy.orm import relationship
import chess

from database import Base


def _utcnow_naive() -> datetime:
    # Колонки DateTime наивные (без tz), поэтому срезаем tzinfo.
    return datetime.now(timezone.utc).replace(tzinfo=None)


class GameStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    PLAYER_WON = "player_won"
    BOT_WON = "bot_won"
    DRAW = "draw"
    RESIGNED = "resigned"


class PlayerColor(str, enum.Enum):
    WHITE = "white"
    BLACK = "black"


class Game(Base):
    __tablename__ = "games"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    status = Column(SQLEnum(GameStatus), default=GameStatus.IN_PROGRESS, nullable=False, index=True)
    player_color = Column(SQLEnum(PlayerColor), default=PlayerColor.WHITE, nullable=False)
    bot_difficulty = Column(Integer, default=1500, nullable=False)

    current_fen = Column(String, default=chess.STARTING_FEN, nullable=False)
    moves_uci = Column(Text, default="", nullable=False)  # Список ходов UCI через пробел: "e2e4 e7e5 g1f3"
    
    created_at = Column(DateTime, default=_utcnow_naive, nullable=False)
    updated_at = Column(DateTime, default=_utcnow_naive, onupdate=_utcnow_naive, nullable=False)

    user = relationship("User", backref="games")