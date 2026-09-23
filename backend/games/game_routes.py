import uuid
from datetime import datetime
from typing import Optional, List
import chess
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, and_

from database import get_async_session
from auth.models import User
from auth.manager import current_active_user
from bot.bot_service import maia_engine
from puzzles.rewards import calculate_level
from games.models import Game, GameStatus, PlayerColor
from games.schemas import GameCreateRequest, PlayerMoveRequest, GameResponse, GameHistoryItem

game_router = APIRouter(prefix="/api/games", tags=["Партии с Maia Bot"])


def _build_game_response(game: Game, last_bot_move: Optional[str] = None, xp: int = 0, coins: int = 0) -> GameResponse:
    board = chess.Board(game.current_fen)
    moves = game.moves_uci.split() if game.moves_uci else []
    
    winner = None
    if game.status == GameStatus.PLAYER_WON:
        winner = "player"
    elif game.status in (GameStatus.BOT_WON, GameStatus.RESIGNED):
        winner = "bot"
    elif game.status == GameStatus.DRAW:
        winner = "draw"

    return GameResponse(
        id=game.id,
        status=game.status,
        player_color=game.player_color,
        bot_difficulty=game.bot_difficulty,
        current_fen=game.current_fen,
        moves_uci=moves,
        is_check=board.is_check(),
        is_game_over=game.status != GameStatus.IN_PROGRESS,
        winner=winner,
        last_bot_move=last_bot_move,
        xp_earned=xp,
        coins_earned=coins
    )


@game_router.get("/active", response_model=Optional[GameResponse])
async def get_active_game(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user)
):
    """Возвращает текущую незавершенную партию пользователя, если она есть."""
    stmt = select(Game).where(
        and_(Game.user_id == user.id, Game.status == GameStatus.IN_PROGRESS)
    ).order_by(desc(Game.updated_at)).limit(1)
    
    res = await db.execute(stmt)
    game = res.scalar_one_or_none()
    if not game:
        return None
    return _build_game_response(game)


@game_router.post("/start", response_model=GameResponse)
async def start_game(
    payload: GameCreateRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user)
):
    """Начинает новую партию. Если была активная — автоматически помечает её как сданную."""
    stmt = select(Game).where(
        and_(Game.user_id == user.id, Game.status == GameStatus.IN_PROGRESS)
    )
    res = await db.execute(stmt)
    active_games = res.scalars().all()
    for ag in active_games:
        ag.status = GameStatus.RESIGNED
        ag.updated_at = datetime.utcnow()

    new_game = Game(
        id=uuid.uuid4(),
        user_id=user.id,
        player_color=payload.player_color,
        bot_difficulty=payload.difficulty,
        current_fen=chess.STARTING_FEN,
        moves_uci="",
        status=GameStatus.IN_PROGRESS
    )

    last_bot_move = None
    # Если игрок выбрал черных, Maia делает первый ход белыми
    if payload.player_color == PlayerColor.BLACK:
        bot_res = maia_engine.predict_move(chess.STARTING_FEN, target_rating=payload.difficulty)
        last_bot_move = bot_res["move_uci"]
        new_game.current_fen = bot_res["new_fen"]
        new_game.moves_uci = last_bot_move

    db.add(new_game)
    await db.commit()
    await db.refresh(new_game)

    return _build_game_response(new_game, last_bot_move=last_bot_move)


@game_router.post("/{game_id}/move", response_model=GameResponse)
async def make_move(
    game_id: uuid.UUID,
    payload: PlayerMoveRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user)
):
    """Игрок отправляет свой ход. Сервер валидирует его и делает ответный ход ботом."""
    stmt = select(Game).where(and_(Game.id == game_id, Game.user_id == user.id))
    res = await db.execute(stmt)
    game = res.scalar_one_or_none()

    if not game:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Партия не найдена.")
    if game.status != GameStatus.IN_PROGRESS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Партия уже завершена.")

    board = chess.Board(game.current_fen)

    # 1. Валидация хода игрока
    try:
        player_move = chess.Move.from_uci(payload.move_uci.strip())
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Некорректный синтаксис UCI.")

    if player_move not in board.legal_moves:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нелегальный ход для текущей позиции.")

    board.push(player_move)
    moves_list = game.moves_uci.split() if game.moves_uci else []
    moves_list.append(payload.move_uci.strip())

    xp_earned = 0
    coins_earned = 0

    # 2. Проверка: не поставил ли игрок мат / пат
    if board.is_game_over():
        if board.is_checkmate():
            game.status = GameStatus.PLAYER_WON
            # Награды за победу над ботом в зависимости от его сложности
            xp_earned = int(game.bot_difficulty / 15)  # например, 1500 Elo -> 100 XP
            coins_earned = int(game.bot_difficulty / 50)
            user.xp += xp_earned
            user.coins += coins_earned
            user.games_played += 1
            user.level = calculate_level(user.xp)
        else:
            game.status = GameStatus.DRAW
            user.games_played += 1

        game.current_fen = board.fen()
        game.moves_uci = " ".join(moves_list)
        await db.commit()
        return _build_game_response(game, xp=xp_earned, coins=coins_earned)

    # 3. Ответный ход Maia
    bot_res = maia_engine.predict_move(board.fen(), target_rating=game.bot_difficulty)
    bot_move_uci = bot_res.get("move_uci")
    
    if bot_move_uci:
        moves_list.append(bot_move_uci)
        board_after_bot = chess.Board(bot_res["new_fen"])
        game.current_fen = bot_res["new_fen"]

        if board_after_bot.is_game_over():
            if board_after_bot.is_checkmate():
                game.status = GameStatus.BOT_WON
            else:
                game.status = GameStatus.DRAW
            user.games_played += 1
    
    game.moves_uci = " ".join(moves_list)
    await db.commit()

    return _build_game_response(game, last_bot_move=bot_move_uci)


@game_router.post("/{game_id}/resign", response_model=GameResponse)
async def resign_game(
    game_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user)
):
    """Сдача текущей партии."""
    stmt = select(Game).where(and_(Game.id == game_id, Game.user_id == user.id))
    res = await db.execute(stmt)
    game = res.scalar_one_or_none()

    if not game:
        raise HTTPException(status_code=404, detail="Партия не найдена.")
    if game.status != GameStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Партия уже завершена.")

    game.status = GameStatus.RESIGNED
    user.games_played += 1
    await db.commit()

    return _build_game_response(game)


@game_router.get("/my", response_model=List[GameHistoryItem])
async def get_my_games(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user)
):
    """Список последних 20 сыгранных партий игрока."""
    stmt = (
        select(Game)
        .where(Game.user_id == user.id)
        .order_by(desc(Game.created_at))
        .limit(20)
    )
    res = await db.execute(stmt)
    games = res.scalars().all()

    return [
        GameHistoryItem(
            id=g.id,
            status=g.status,
            player_color=g.player_color,
            bot_difficulty=g.bot_difficulty,
            moves_count=len(g.moves_uci.split()) if g.moves_uci else 0,
            created_at=g.created_at.strftime("%Y-%m-%d %H:%M")
        )
        for g in games
    ]