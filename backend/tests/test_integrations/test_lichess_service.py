import pytest
import httpx
from unittest.mock import patch, AsyncMock
from fastapi import HTTPException
from integrations.lichess_service import LichessService


@pytest.mark.asyncio
async def test_fetch_user_profile_empty_username():
    service = LichessService()
    with pytest.raises(HTTPException) as exc_info:
        await service.fetch_user_profile("   ")
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_fetch_user_profile_success():
    service = LichessService()
    mock_payload = {
        "username": "drnykterstein",
        "profile": {"bio": "hello lichess"},
        "perfs": {
            "blitz": {"rating": 2800},
            "rapid": {"rating": 2750},
            "puzzle": {"rating": 2600},
        },
    }

    mock_resp = httpx.Response(
        200,
        json=mock_payload,
        request=httpx.Request("GET", "https://lichess.org/api/user/drnykterstein")
    )

    with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        result = await service.fetch_user_profile("drnykterstein")

        assert result["username"] == "drnykterstein"
        assert result["bio"] == "hello lichess"
        assert result["blitz_rating"] == 2800
        assert result["rapid_rating"] == 2750
        assert result["puzzle_rating"] == 2600


@pytest.mark.asyncio
async def test_fetch_user_profile_not_found_404():
    service = LichessService()
    mock_resp = httpx.Response(404, request=httpx.Request("GET", "https://lichess.org/api/user/unknown"))

    with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        with pytest.raises(HTTPException) as exc_info:
            await service.fetch_user_profile("unknown")
        assert exc_info.value.status_code == 404
        assert "не найден" in exc_info.value.detail


@pytest.mark.asyncio
async def test_fetch_user_profile_rate_limit_429():
    service = LichessService()
    mock_resp = httpx.Response(429, request=httpx.Request("GET", "https://lichess.org/api/user/spam"))

    with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        with pytest.raises(HTTPException) as exc_info:
            await service.fetch_user_profile("spam")
        assert exc_info.value.status_code == 429
        assert "Превышен лимит" in exc_info.value.detail


@pytest.mark.asyncio
async def test_fetch_user_profile_bad_gateway_500():
    service = LichessService()
    mock_resp = httpx.Response(500, request=httpx.Request("GET", "https://lichess.org/api/user/error"))

    with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        with pytest.raises(HTTPException) as exc_info:
            await service.fetch_user_profile("error")
        assert exc_info.value.status_code == 502


@pytest.mark.asyncio
async def test_fetch_user_profile_network_error():
    service = LichessService()

    with patch.object(httpx.AsyncClient, "get", side_effect=httpx.ConnectTimeout("Timeout")):
        with pytest.raises(HTTPException) as exc_info:
            await service.fetch_user_profile("timeout_user")
        assert exc_info.value.status_code == 503
        assert "временно недоступен" in exc_info.value.detail