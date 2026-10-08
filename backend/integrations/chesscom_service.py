import re
from typing import Any, Dict, Optional
from urllib.parse import quote

import httpx
from fastapi import HTTPException, status

CHESSCOM_API_BASE = "https://api.chess.com/pub/player"
USERNAME_RE = re.compile(r"^[A-Za-z0-9_-]{2,25}$")


class ChessComService:
    def __init__(self, timeout: float = 8.0):
        self.timeout = timeout

    async def fetch_player_stats(self, username: str) -> Dict[str, Any]:
        clean_username = username.strip()
        if not USERNAME_RE.fullmatch(clean_username):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Укажите корректный ник Chess.com (2–25 латинских букв, цифр, _ или -).",
            )

        url = f"{CHESSCOM_API_BASE}/{quote(clean_username, safe='')}/stats"
        headers = {
            "Accept": "application/json",
            "User-Agent": "CoolChess/1.0 (public profile rating sync)",
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(url, headers=headers)
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Chess.com временно недоступен. Попробуйте синхронизировать профиль позже.",
            ) from exc

        if response.status_code == 404:
            raise HTTPException(status_code=404, detail=f"Профиль Chess.com '{clean_username}' не найден.")
        if response.status_code == 429:
            raise HTTPException(status_code=429, detail="Chess.com ограничил частоту запросов. Попробуйте позже.")
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="Не удалось получить публичную статистику Chess.com.")

        try:
            data = response.json()
        except ValueError as exc:
            raise HTTPException(status_code=502, detail="Chess.com вернул некорректный ответ.") from exc

        def rating_for(key: str) -> Optional[int]:
            rating = data.get(key, {}).get("last", {}).get("rating")
            return rating if isinstance(rating, int) and rating >= 0 else None

        return {
            "username": clean_username,
            "rapid_rating": rating_for("chess_rapid"),
            "blitz_rating": rating_for("chess_blitz"),
            "bullet_rating": rating_for("chess_bullet"),
            "daily_rating": rating_for("chess_daily"),
        }


chesscom_service = ChessComService()
