import enum
import random
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, ConfigDict

from database import get_async_session
from auth.models import Puzzle, User, user_solved_puzzles
from auth.manager import current_active_user
from puzzles.rewards import get_fixed_puzzle_rewards, calculate_level

puzzle_router = APIRouter(prefix="/api/puzzles", tags=["Шахматные задачи Lichess"])

class DifficultyLevel(str, enum.Enum):
    BEGINNER = "beginner"          # 600 - 1199
    INTERMEDIATE = "intermediate"  # 1200 - 1599
    ADVANCED = "advanced"          # 1600 - 1999
    MASTER = "master"              # 2000 - 2399
    GRANDMASTER = "grandmaster"    # 2400+

DIFFICULTY_RANGES = {
    DifficultyLevel.BEGINNER: (600, 1199),
    DifficultyLevel.INTERMEDIATE: (1200, 1599),
    DifficultyLevel.ADVANCED: (1600, 1999),
    DifficultyLevel.MASTER: (2000, 2399),
    DifficultyLevel.GRANDMASTER: (2400, 3200),
}

class PuzzleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    fen: str
    initial_move: str        # Первый ход оппонента, после которого ходит игрок
    rating: int
    popularity: int
    themes: List[str]
    game_url: Optional[str]

class SolveRequest(BaseModel):
    user_moves: str          # Ход игрока в UCI (например: "e2e4" или "d8d1")

class SolveResponse(BaseModel):
    is_correct: bool
    message: str
    already_solved: bool
    xp_earned: int = 0
    coins_earned: int = 0
    elo_change: int = 0
    new_level: Optional[int] = None


def _apply_progress_filters(
    query,
    progress: Optional[str],
    exclude_solved: bool,
    solved_only: bool,
    user: User,
):
    if progress is not None:
        normalized_progress = progress.strip().lower()
        if normalized_progress == "solved":
            solved_only = True
            exclude_solved = False
        elif normalized_progress == "unsolved":
            solved_only = False
            exclude_solved = True
        elif normalized_progress == "all":
            solved_only = False
            exclude_solved = False

    if solved_only:
        solved_subquery = (
            select(user_solved_puzzles.c.puzzle_id)
            .where(user_solved_puzzles.c.user_id == user.id)
        )
        query = query.where(Puzzle.id.in_(solved_subquery))
    elif exclude_solved:
        solved_subquery = (
            select(user_solved_puzzles.c.puzzle_id)
            .where(user_solved_puzzles.c.user_id == user.id)
        )
        query = query.where(Puzzle.id.not_in(solved_subquery))

    return query


def _build_puzzle_query(
    difficulty: Optional[DifficultyLevel],
    min_rating: Optional[int],
    max_rating: Optional[int],
    theme: Optional[str],
    exclude_solved: bool,
    solved_only: bool,
    progress: Optional[str],
    user: User,
):
    query = select(Puzzle)

    if difficulty:
        low, high = DIFFICULTY_RANGES[difficulty]
        query = query.where(Puzzle.rating.between(low, high))

    if min_rating is not None:
        query = query.where(Puzzle.rating >= min_rating)
    if max_rating is not None:
        query = query.where(Puzzle.rating <= max_rating)

    if theme:
        query = query.where(Puzzle.themes.ilike(f"%{theme.strip()}%"))

    query = _apply_progress_filters(query, progress, exclude_solved, solved_only, user)
    return query


def _serialize_puzzle_response(puzzle: Puzzle) -> PuzzleResponse:
    moves_list = puzzle.moves.split()
    initial_opponent_move = moves_list[0] if moves_list else ""

    return PuzzleResponse(
        id=puzzle.id,
        fen=puzzle.fen,
        initial_move=initial_opponent_move,
        rating=puzzle.rating,
        popularity=puzzle.popularity,
        themes=puzzle.themes.split(),
        game_url=puzzle.game_url,
    )


@puzzle_router.get("/random", response_model=PuzzleResponse)
async def get_random_puzzle(
    difficulty: Optional[DifficultyLevel] = Query(None, description="Фиксированный уровень сложности"),
    min_rating: Optional[int] = Query(None, description="Точный минимальный Elo"),
    max_rating: Optional[int] = Query(None, description="Точный максимальный Elo"),
    theme: Optional[str] = Query(None, description="Концепция/тема (mateIn1, fork, pin, defensiveMove...)"),
    progress: Optional[str] = Query(None, description="Статус решения: all, solved, unsolved"),
    exclude_solved: bool = Query(True, description="Исключить уже решенные пользователем задачи"),
    solved_only: bool = Query(False, description="Показывать только уже решенные пользователем задачи"),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    query = _build_puzzle_query(
        difficulty=difficulty,
        min_rating=min_rating,
        max_rating=max_rating,
        theme=theme,
        exclude_solved=exclude_solved,
        solved_only=solved_only,
        progress=progress,
        user=user,
    )
    query = query.order_by(func.random()).limit(1)
    result = await db.execute(query)
    puzzle = result.scalar_one_or_none()

    if not puzzle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Подходящая задача с указанными фильтрами не найдена."
        )

    return _serialize_puzzle_response(puzzle)


@puzzle_router.get("/batch", response_model=List[PuzzleResponse])
async def get_puzzle_batch(
    limit: int = Query(default=10, ge=1, description="Количество задач в выборке (максимум 10)"),
    difficulty: Optional[DifficultyLevel] = Query(None, description="Фиксированный уровень сложности"),
    min_rating: Optional[int] = Query(None, description="Точный минимальный Elo"),
    max_rating: Optional[int] = Query(None, description="Точный максимальный Elo"),
    theme: Optional[str] = Query(None, description="Концепция/тема (mateIn1, fork, pin, defensiveMove...)"),
    progress: Optional[str] = Query(None, description="Статус решения: all, solved, unsolved"),
    exclude_solved: bool = Query(True, description="Исключить уже решенные пользователем задачи"),
    solved_only: bool = Query(False, description="Показывать только уже решенные пользователем задачи"),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    effective_limit = min(limit, 10)
    query = _build_puzzle_query(
        difficulty=difficulty,
        min_rating=min_rating,
        max_rating=max_rating,
        theme=theme,
        exclude_solved=exclude_solved,
        solved_only=solved_only,
        progress=progress,
        user=user,
    )
    query = query.order_by(func.random()).limit(effective_limit)
    result = await db.execute(query)
    puzzles = result.scalars().all()

    if not puzzles:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Подходящая задача с указанными фильтрами не найдена."
        )

    randomized_puzzles = list(puzzles)
    random.shuffle(randomized_puzzles)

    unique_puzzles = []
    seen_ids = set()
    for puzzle in randomized_puzzles:
        if puzzle.id in seen_ids:
            continue
        seen_ids.add(puzzle.id)
        unique_puzzles.append(_serialize_puzzle_response(puzzle))
        if len(unique_puzzles) >= effective_limit:
            break

    return unique_puzzles


@puzzle_router.post("/{puzzle_id}/solve", response_model=SolveResponse)
async def solve_puzzle(
    puzzle_id: str,
    payload: SolveRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    query = select(Puzzle).where(Puzzle.id == puzzle_id)
    result = await db.execute(query)
    puzzle = result.scalar_one_or_none()

    if not puzzle:
        raise HTTPException(status_code=404, detail="Задача не найдена.")

    moves_list = puzzle.moves.split()
    # Правильный ход игрока — второй ход в списке ходов Lichess
    expected_solution = moves_list[1] if len(moves_list) > 1 else ""

    if payload.user_moves.strip() != expected_solution:
        return SolveResponse(
            is_correct=False,
            message="Неверный ход. Попробуйте еще раз!",
            already_solved=False
        )

    # Проверяем, не решал ли игрок эту задачу раньше
    solved_check = await db.execute(
        select(user_solved_puzzles).where(
            and_(
                user_solved_puzzles.c.user_id == user.id,
                user_solved_puzzles.c.puzzle_id == puzzle.id
            )
        )
    )
    already_solved = solved_check.first() is not None

    xp_earned = 0
    coins_earned = 0
    elo_change = 0

    if not already_solved:
        # Вставку делаем ДО начисления наград и ловим IntegrityError:
        # два параллельных запроса могут оба пройти проверку выше,
        # но составной PK (user_id, puzzle_id) пропустит только один.
        # Проигравший получает already_solved=True без повторных наград.
        insert_stmt = user_solved_puzzles.insert().values(
            user_id=user.id,
            puzzle_id=puzzle.id
        )
        try:
            await db.execute(insert_stmt)
        except IntegrityError:
            await db.rollback()
            return SolveResponse(
                is_correct=True,
                message="Отлично! Задача решена верно.",
                already_solved=True,
            )

        # Награды по порогам рейтинга самой задачи
        rewards = get_fixed_puzzle_rewards(puzzle.rating)
        xp_earned = rewards["xp_gain"]
        coins_earned = rewards["coins_gain"]
        elo_change = rewards["elo_gain"]

        # Начисляем пользователю
        user.xp += xp_earned
        user.coins += coins_earned
        user.elo_rating += elo_change
        user.level = calculate_level(user.xp)

        await db.commit()

    return SolveResponse(
        is_correct=True,
        message="Отлично! Задача решена верно.",
        already_solved=already_solved,
        xp_earned=xp_earned,
        coins_earned=coins_earned,
        elo_change=elo_change,
        new_level=user.level if not already_solved else None
    )
