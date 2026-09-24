from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func

from database import get_async_session
from auth.models import User, user_solved_puzzles
from auth.manager import current_optional_user
from leaderboard.schemas import (
    LeaderboardCategory,
    LeaderboardResponse,
    LeaderboardUserItem,
    MyRankInfo,
)

leaderboard_router = APIRouter(prefix="/api/leaderboard", tags=["Таблица лидеров"])


@leaderboard_router.get("", response_model=LeaderboardResponse)
async def get_leaderboard(
    category: LeaderboardCategory = Query(
        default=LeaderboardCategory.ELO,
        description="Критерий сортировки: elo, level или puzzles"
    ),
    limit: int = Query(default=20, ge=1, le=100, description="Количество игроков в выборке"),
    db: AsyncSession = Depends(get_async_session),
    current_user: Optional[User] = Depends(current_optional_user),
):
    """
    Возвращает таблицу лидеров по выбранной категории и позицию текущего пользователя.
    """
    # Подзапрос подсчёта решенных задач для каждого пользователя
    puzzles_count_subq = (
        select(
            user_solved_puzzles.c.user_id.label("user_id"),
            func.count(user_solved_puzzles.c.puzzle_id).label("solved_count"),
        )
        .group_by(user_solved_puzzles.c.user_id)
        .subquery()
    )

    # Базовый запрос
    query = (
        select(
            User,
            func.coalesce(puzzles_count_subq.c.solved_count, 0).label("puzzles_solved"),
        )
        .outerjoin(puzzles_count_subq, User.id == puzzles_count_subq.c.user_id)
        .where(User.is_active == True)
    )

    # Критерии сортировки
    if category == LeaderboardCategory.ELO:
        query = query.order_by(desc(User.elo_rating), desc(User.xp))
    elif category == LeaderboardCategory.LEVEL:
        query = query.order_by(desc(User.level), desc(User.xp), desc(User.elo_rating))
    elif category == LeaderboardCategory.PUZZLES:
        query = query.order_by(
            desc(func.coalesce(puzzles_count_subq.c.solved_count, 0)),
            desc(User.elo_rating),
        )

    # 1. Запрашиваем топ игроков
    top_res = await db.execute(query.limit(limit))
    top_rows = top_res.all()

    top_players: list[LeaderboardUserItem] = []
    current_user_found_in_top = False
    my_rank_info: Optional[MyRankInfo] = None

    for idx, (user, solved_cnt) in enumerate(top_rows, start=1):
        item = LeaderboardUserItem(
            rank=idx,
            user_id=user.id,
            email=user.email,
            elo_rating=user.elo_rating,
            level=user.level,
            xp=user.xp,
            puzzles_solved=int(solved_cnt),
        )
        top_players.append(item)

        if current_user and user.id == current_user.id:
            current_user_found_in_top = True
            my_rank_info = MyRankInfo(
                rank=idx,
                elo_rating=user.elo_rating,
                level=user.level,
                xp=user.xp,
                puzzles_solved=int(solved_cnt),
            )

    # 2. Если авторизованный игрок не попал в limit, считаем его позицию
    if current_user and not current_user_found_in_top:
        user_puzzles_stmt = select(func.count(user_solved_puzzles.c.puzzle_id)).where(
            user_solved_puzzles.c.user_id == current_user.id
        )
        user_puzzles_res = await db.execute(user_puzzles_stmt)
        my_solved_cnt = user_puzzles_res.scalar_one_or_none() or 0

        if category == LeaderboardCategory.ELO:
            rank_stmt = select(func.count(User.id)).where(
                User.is_active == True,
                User.elo_rating > current_user.elo_rating,
            )
        elif category == LeaderboardCategory.LEVEL:
            rank_stmt = select(func.count(User.id)).where(
                User.is_active == True,
                (User.level > current_user.level)
                | ((User.level == current_user.level) & (User.xp > current_user.xp)),
            )
        else:  # PUZZLES
            better_puzzles_subq = (
                select(user_solved_puzzles.c.user_id)
                .group_by(user_solved_puzzles.c.user_id)
                .having(func.count(user_solved_puzzles.c.puzzle_id) > my_solved_cnt)
                .subquery()
            )
            rank_stmt = select(func.count()).select_from(better_puzzles_subq)

        rank_res = await db.execute(rank_stmt)
        higher_count = rank_res.scalar_one_or_none() or 0
        computed_rank = higher_count + 1

        my_rank_info = MyRankInfo(
            rank=computed_rank,
            elo_rating=current_user.elo_rating,
            level=current_user.level,
            xp=current_user.xp,
            puzzles_solved=int(my_solved_cnt),
        )

    return LeaderboardResponse(
        category=category,
        top_players=top_players,
        my_rank=my_rank_info,
    )