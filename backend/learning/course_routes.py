from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from auth.manager import current_active_user
from auth.models import User
from database import get_async_session
from learning.models import CourseProgress

course_router = APIRouter(prefix="/api/learning", tags=["Learning"])


class CourseProgressUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    theory_completed: bool = False
    quiz_completed: bool = False
    practice_completed: bool = False

    @model_validator(mode="after")
    def require_a_completed_milestone(self):
        if not any(
            (
                self.theory_completed,
                self.quiz_completed,
                self.practice_completed,
            )
        ):
            raise ValueError("Укажите хотя бы один пройденный этап.")
        return self


class CourseProgressState(BaseModel):
    theory_completed: bool
    quiz_completed: bool
    practice_completed: bool


def _serialize_progress(progress: CourseProgress) -> CourseProgressState:
    return CourseProgressState(
        theory_completed=progress.theory_completed,
        quiz_completed=progress.quiz_completed,
        practice_completed=progress.practice_completed,
    )


@course_router.get("/progress", response_model=dict[str, CourseProgressState])
async def get_course_progress(
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    result = await db.execute(
        select(CourseProgress).where(CourseProgress.user_id == user.id)
    )
    return {row.topic_id: _serialize_progress(row) for row in result.scalars()}


@course_router.patch(
    "/progress/{topic_id}", response_model=CourseProgressState
)
async def update_course_progress(
    payload: CourseProgressUpdate,
    topic_id: Annotated[str, Path(min_length=1, max_length=100, pattern=r"^[a-z0-9-]+$")],
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Set completion flags to true without allowing concurrent writes to erase them."""
    values = {
        "user_id": user.id,
        "topic_id": topic_id,
        "theory_completed": payload.theory_completed,
        "quiz_completed": payload.quiz_completed,
        "practice_completed": payload.practice_completed,
    }
    dialect = db.bind.dialect.name if db.bind is not None else ""
    if dialect == "postgresql":
        insert_stmt = pg_insert(CourseProgress).values(**values)
    elif dialect == "sqlite":
        insert_stmt = sqlite_insert(CourseProgress).values(**values)
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Хранилище прогресса не поддерживает атомарное обновление.",
        )

    excluded = insert_stmt.excluded
    statement = insert_stmt.on_conflict_do_update(
        index_elements=[CourseProgress.user_id, CourseProgress.topic_id],
        set_={
            "theory_completed": or_(
                CourseProgress.theory_completed, excluded.theory_completed
            ),
            "quiz_completed": or_(
                CourseProgress.quiz_completed, excluded.quiz_completed
            ),
            "practice_completed": or_(
                CourseProgress.practice_completed, excluded.practice_completed
            ),
        },
    )
    await db.execute(statement)
    await db.commit()
    result = await db.execute(
        select(CourseProgress).where(
            CourseProgress.user_id == user.id,
            CourseProgress.topic_id == topic_id,
        )
    )
    progress = result.scalar_one()
    return _serialize_progress(progress)
