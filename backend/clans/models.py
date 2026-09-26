import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    Enum as SQLEnum,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from database import Base


class ClanRole(str, enum.Enum):
    LEADER = "leader"
    OFFICER = "officer"
    MEMBER = "member"


class Clan(Base):
    __tablename__ = "clans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(50), unique=True, nullable=False, index=True)
    tag = Column(String(6), unique=True, nullable=False, index=True)
    description = Column(String(255), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    leader_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    # Связи
    leader = relationship("User", foreign_keys=[leader_id])
    members = relationship(
        "ClanMember",
        back_populates="clan",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class ClanMember(Base):
    __tablename__ = "clan_members"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clan_id = Column(
        UUID(as_uuid=True),
        ForeignKey("clans.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,  # 1 игрок = максимум 1 клан
        nullable=False,
    )
    role = Column(SQLEnum(ClanRole), default=ClanRole.MEMBER, nullable=False)
    joined_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    clan = relationship("Clan", back_populates="members")
    user = relationship("User", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("clan_id", "user_id", name="uq_clan_member"),
    )