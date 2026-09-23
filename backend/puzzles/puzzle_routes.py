import enum
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from pydantic import BaseModel

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
    id: str
    fen: str
    initial_move: str        # Первый ход оппонента, после которого ходит игрок
    rating: int
    popularity: int
    themes: List[str]
    game_url: Optional[str]

    class Config:
        from_attributes = True

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


@puzzle_router.get("/random", response_model=PuzzleResponse)
async def get_random_puzzle(
    difficulty: Optional[DifficultyLevel] = Query(None, description="Фиксированный уровень сложности"),
    min_rating: Optional[int] = Query(None, description="Точный минимальный Elo"),
    max_rating: Optional[int] = Query(None, description="Точный максимальный Elo"),
    theme: Optional[str] = Query(None, description="Концепция/тема (mateIn1, fork, pin, defensiveMove...)"),
    exclude_solved: bool = Query(True, description="Исключить уже решенные пользователем задачи"),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    query = select(Puzzle)

    # Фильтр по сложности
    if difficulty:
        low, high = DIFFICULTY_RANGES[difficulty]
        query = query.where(Puzzle.rating.between(low, high))

    # Фильтр по точным границам рейтинга
    if min_rating is not None:
        query = query.where(Puzzle.rating >= min_rating)
    if max_rating is not None:
        query = query.where(Puzzle.rating <= max_rating)

    # Фильтр по концепции / теме
    if theme:
        query = query.where(Puzzle.themes.ilike(f"%{theme.strip()}%"))

    # Исключение уже решенных
    if exclude_solved:
        solved_subquery = (
            select(user_solved_puzzles.c.puzzle_id)
            .where(user_solved_puzzles.c.user_id == user.id)
        )
        query = query.where(Puzzle.id.not_in(solved_subquery))

    query = query.order_by(func.random()).limit(1)
    result = await db.execute(query)
    puzzle = result.scalar_one_or_none()

    if not puzzle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Подходящая задача с указанными фильтрами не найдена."
        )

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

        # Сохраняем в таблицу решённых
        insert_stmt = user_solved_puzzles.insert().values(
            user_id=user.id,
            puzzle_id=puzzle.id
        )
        await db.execute(insert_stmt)
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