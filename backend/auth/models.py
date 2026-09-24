import enum
import uuid
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Table, Enum as SQLEnum, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from database import Base

class UserRole(str, enum.Enum):
    STUDENT = "student"
    COACH = "coach"
    ADMIN = "admin"

user_solved_puzzles = Table(
    "user_solved_puzzles",
    Base.metadata,
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("puzzle_id", String, ForeignKey("puzzles.id", ondelete="CASCADE"), primary_key=True),
    Column("solved_at", DateTime, default=datetime.utcnow, nullable=False),
)

class User(SQLAlchemyBaseUserTableUUID, Base):
    __tablename__ = "users"

    role = Column(SQLEnum(UserRole), default=UserRole.STUDENT, nullable=False)
    elo_rating = Column(Integer, default=1200, nullable=False)

    # Геймификация и статистика
    xp = Column(Integer, default=0, nullable=False)
    level = Column(Integer, default=1, nullable=False)
    coins = Column(Integer, default=0, nullable=False)
    games_played = Column(Integer, default=0, nullable=False)
    tournaments_played = Column(Integer, default=0, nullable=False)
    tournaments_won = Column(Integer, default=0, nullable=False)
    tournaments_podium = Column(Integer, default=0, nullable=False)

    # Решенные задачи
    solved_puzzles = relationship("Puzzle", secondary=user_solved_puzzles, back_populates="solvers")

    # Lichess интеграция
    lichess_username = Column(String(50), nullable=True, index=True)
    lichess_blitz_rating = Column(Integer, nullable=True)
    lichess_rapid_rating = Column(Integer, nullable=True)
    lichess_puzzle_rating = Column(Integer, nullable=True)
    __tablename__ = "users"

    role = Column(SQLEnum(UserRole), default=UserRole.STUDENT, nullable=False)
    elo_rating = Column(Integer, default=1200, nullable=False)
    games_played = Column(Integer, default=0, nullable=False)
    tournaments_played = Column(Integer, default=0, nullable=False)
    tournaments_won = Column(Integer, default=0, nullable=False)
    tournaments_podium = Column(Integer, default=0, nullable=False)

    solved_puzzles = relationship("Puzzle", secondary=user_solved_puzzles, back_populates="solvers")
    # Геймификация и статистика
    xp = Column(Integer, default=0, nullable=False)
    level = Column(Integer, default=1, nullable=False)
    coins = Column(Integer, default=0, nullable=False)
    games_played = Column(Integer, default=0, nullable=False)
    tournaments_played = Column(Integer, default=0, nullable=False)
    tournaments_won = Column(Integer, default=0, nullable=False)
    tournaments_podium = Column(Integer, default=0, nullable=False)

    # Lichess интеграция
    lichess_username = Column(String(50), nullable=True, index=True)
    lichess_blitz_rating = Column(Integer, nullable=True)
    lichess_rapid_rating = Column(Integer, nullable=True)
    lichess_puzzle_rating = Column(Integer, nullable=True)
    
class Puzzle(Base):
    __tablename__ = "puzzles"

    id = Column(String, primary_key=True)            # Lichess PuzzleId (например, '00008')
    fen = Column(String, nullable=False)
    moves = Column(String, nullable=False)          # Ходы через пробел
    rating = Column(Integer, nullable=False)        # Рейтинг Elo
    rating_deviation = Column(Integer, default=0)
    popularity = Column(Integer, default=0)
    themes = Column(String, nullable=False)         # Теги через пробел
    game_url = Column(String, nullable=True)

    solvers = relationship("User", secondary=user_solved_puzzles, back_populates="solved_puzzles")

    __table_args__ = (
        Index("idx_puzzle_rating", "rating"),
    )