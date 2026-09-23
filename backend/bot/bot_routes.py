from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
import chess
from bot.bot_service import maia_engine

bot_router = APIRouter(prefix="/api/bot", tags=["Шахматный бот Maia"])

class BotMoveRequest(BaseModel):
    fen: str = Field(default=chess.STARTING_FEN, description="Текущая позиция партии в FEN")
    difficulty: int = Field(default=1500, description="Уровень сложности (Elo): 1100, 1300, 1500, 1700, 1900")

@bot_router.post("/move")
async def get_bot_move(payload: BotMoveRequest):
    try:
        chess.Board(payload.fen)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Некорректная нотация FEN"
        )

    return maia_engine.predict_move(fen=payload.fen, target_rating=payload.difficulty)