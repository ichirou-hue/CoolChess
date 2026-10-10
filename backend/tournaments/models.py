import uuid
from datetime import datetime, timezone

from fastapi_users_db_sqlalchemy.generics import GUID
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from database import Base


class Tournament(Base):
    __tablename__ = "tournaments"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(80), nullable=False)
    description = Column(Text, nullable=True)
    format = Column(String(24), nullable=False, default="round_robin")
    time_control = Column(Integer, nullable=False, default=300)
    increment = Column(Integer, nullable=False, default=0)
    max_players = Column(Integer, nullable=False, default=32)
    status = Column(String(16), nullable=False, default="registration")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    created_by_id = Column(GUID(), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)

    participants = relationship(
        "TournamentParticipant",
        back_populates="tournament",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="TournamentParticipant.joined_at",
    )


class TournamentParticipant(Base):
    __tablename__ = "tournament_participants"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    tournament_id = Column(GUID(), ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    group_name = Column(String(24), nullable=True)
    preferred_color = Column(String(8), nullable=True)
    joined_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    tournament = relationship("Tournament", back_populates="participants")
    user = relationship("User", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("tournament_id", "user_id", name="uq_tournament_participant"),
    )
