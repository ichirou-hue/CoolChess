import enum
import uuid
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum as SQLEnum, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import chess

from database import Base


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

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    status = Column(SQLEnum(GameStatus), default=GameStatus.IN_PROGRESS, nullable=False, index=True)
    player_color = Column(SQLEnum(PlayerColor), default=PlayerColor.WHITE, nullable=False)
    bot_difficulty = Column(Integer, default=1500, nullable=False)

    current_fen = Column(String, default=chess.STARTING_FEN, nullable=False)
    moves_uci = Column(Text, default="", nullable=False)  # Список ходов UCI через пробел: "e2e4 e7e5 g1f3"
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", backref="games")