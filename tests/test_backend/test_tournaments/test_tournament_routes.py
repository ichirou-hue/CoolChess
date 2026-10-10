import pytest
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock

from auth.models import UserRole
from tournaments.models import Tournament, TournamentParticipant


@pytest.mark.asyncio
async def test_student_cannot_create_tournament(authorized_client):
    client, user, _db = authorized_client
    user.role = UserRole.STUDENT

    response = await client.post(
        "/api/tournaments",
        json={
            "name": "Кубок школы",
            "format": "round_robin",
            "time_control": 300,
            "increment": 2,
            "max_players": 24,
        },
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_tournament_config_validation(authorized_client):
    client, user, _db = authorized_client
    user.role = UserRole.COACH

    response = await client.post(
        "/api/tournaments",
        json={
            "name": "x",
            "format": "unknown",
            "time_control": 10,
            "increment": -1,
            "max_players": 1,
        },
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_coach_can_create_configured_tournament(authorized_client):
    client, user, db = authorized_client
    user.role = UserRole.COACH
    tournament = Tournament(
        id=uuid.uuid4(),
        name="Кубок школы",
        description="Для учеников",
        format="swiss",
        time_control=600,
        increment=5,
        max_players=16,
        status="registration",
        created_at=datetime.now(timezone.utc),
        created_by_id=user.id,
        participants=[],
    )
    result = MagicMock()
    result.scalar_one_or_none.return_value = tournament
    db.execute.return_value = result

    response = await client.post(
        "/api/tournaments",
        json={
            "name": "Кубок школы",
            "description": "Для учеников",
            "format": "swiss",
            "time_control": 600,
            "increment": 5,
            "max_players": 16,
        },
    )

    assert response.status_code == 201
    assert response.json()["format"] == "swiss"
    assert response.json()["time_control"] == 600
    assert response.json()["increment"] == 5
    assert response.json()["max_players"] == 16


@pytest.mark.asyncio
async def test_player_can_choose_tournament_side(authorized_client):
    client, user, db = authorized_client
    tournament_id = uuid.uuid4()
    participant = TournamentParticipant(
        id=uuid.uuid4(),
        tournament_id=tournament_id,
        user_id=user.id,
        joined_at=datetime.now(timezone.utc),
        user=user,
    )
    tournament = Tournament(
        id=tournament_id,
        name="Кубок школы",
        format="round_robin",
        time_control=300,
        increment=0,
        max_players=16,
        status="registration",
        created_at=datetime.now(timezone.utc),
        created_by_id=uuid.uuid4(),
        participants=[participant],
    )
    result = MagicMock()
    result.scalar_one_or_none.return_value = tournament
    db.execute.return_value = result

    response = await client.patch(
        f"/api/tournaments/{tournament_id}/me/side",
        json={"preferred_color": "black"},
    )

    assert response.status_code == 200
    assert response.json()["participants"][0]["preferred_color"] == "black"
