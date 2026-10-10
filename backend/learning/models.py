from datetime import datetime, timezone

from fastapi_users_db_sqlalchemy.generics import GUID
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String

from database import Base


class CourseProgress(Base):
    """Monotonic completion flags for a user's course topic."""

    __tablename__ = "course_progress"

    user_id = Column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    topic_id = Column(String(100), primary_key=True)
    theory_completed = Column(Boolean, nullable=False, default=False)
    quiz_completed = Column(Boolean, nullable=False, default=False)
    practice_completed = Column(Boolean, nullable=False, default=False)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
