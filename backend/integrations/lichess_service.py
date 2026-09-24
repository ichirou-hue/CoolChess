from typing import Optional, Dict, Any
import httpx
from fastapi import HTTPException, status

LICHESS_API_BASE = "https://lichess.org/api"


class LichessService:
    def __init__(self, timeout: float = 8.0):
        self.timeout = timeout

    async def fetch_user_profile(self, username: str) -> Dict[str, Any]:
        """
        Запрашивает публичный профиль пользователя с Lichess API.
        Возвращает распарсенный JSON с рейтингами.
        """
        clean_username = username.strip().lower()
        if not clean_username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Имя пользователя Lichess не может быть пустым"
            )

        url = f"{LICHESS_API_BASE}/user/{clean_username}"
        headers = {
            "Accept": "application/json",
            "User-Agent": "CoolChess-App/1.0"
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(url, headers=headers)

                if response.status_code == 404:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Пользователь Lichess '{clean_username}' не найден"
                    )
                elif response.status_code == 429:
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail="Превышен лимит запросов к Lichess API, повторите позже"
                    )
                elif response.status_code != 200:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail="Ошибка при обращении к серверу Lichess"
                    )

                data = response.json()
                return self._parse_ratings(data)

        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Сервис Lichess временно недоступен: {str(exc)}"
            )

    def _parse_ratings(self, data: Dict[str, Any]) -> Dict[str, Any]:
        perfs = data.get("perfs", {})
        
        blitz = perfs.get("blitz", {}).get("rating")
        rapid = perfs.get("rapid", {}).get("rating")
        puzzle = perfs.get("puzzle", {}).get("rating")

        return {
            "username": data.get("username", ""),
            "blitz_rating": blitz,
            "rapid_rating": rapid,
            "puzzle_rating": puzzle,
        }


lichess_service = LichessService()