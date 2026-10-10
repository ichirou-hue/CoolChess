import httpx
import pytest
from fastapi import HTTPException
from unittest.mock import AsyncMock, patch

from integrations.chesscom_service import ChessComService


@pytest.mark.asyncio
async def test_fetch_player_profile_reads_location_for_verification():
    service = ChessComService()
    response = httpx.Response(
        200,
        json={
            "username": "Player_One",
            "location": "Berlin coolchess-verify-a1b2c3d4",
            "status": "premium",
        },
        request=httpx.Request(
            "GET", "https://api.chess.com/pub/player/Player_One"
        ),
    )

    with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = response
        profile = await service.fetch_player_profile("Player_One")

    assert profile["username"] == "Player_One"
    assert profile["location"] == "Berlin coolchess-verify-a1b2c3d4"
    mock_get.assert_awaited_once()
    assert mock_get.await_args.args[0].endswith("/Player_One")


@pytest.mark.asyncio
async def test_fetch_player_stats_reads_public_ratings():
    service = ChessComService()
    response = httpx.Response(
        200,
        json={
            "chess_rapid": {"last": {"rating": 1900}},
            "chess_blitz": {"last": {"rating": 1800}},
            "chess_bullet": {"last": {"rating": 1700}},
            "chess_daily": {"last": {"rating": 1600}},
        },
        request=httpx.Request(
            "GET", "https://api.chess.com/pub/player/Player_One/stats"
        ),
    )

    with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = response
        stats = await service.fetch_player_stats("Player_One")

    assert stats == {
        "username": "Player_One",
        "rapid_rating": 1900,
        "blitz_rating": 1800,
        "bullet_rating": 1700,
        "daily_rating": 1600,
    }


@pytest.mark.asyncio
async def test_chesscom_rejects_invalid_username_before_request():
    service = ChessComService()

    with pytest.raises(HTTPException) as exc_info:
        await service.fetch_player_profile("../attacker")

    assert exc_info.value.status_code == 422
