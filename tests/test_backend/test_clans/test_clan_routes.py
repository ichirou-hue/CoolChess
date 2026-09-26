import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, AsyncMock
import pytest

from auth.models import User, UserRole
from auth.manager import current_active_user
from database import get_async_session
from clans.models import Clan, ClanMember, ClanRole
from server import app


def make_fake_user(email="player@coolchess.com", elo=1400):
    user = MagicMock(spec=User)
    user.id = uuid.uuid4()
    user.email = email
    user.is_active = True
    user.is_verified = True
    user.is_superuser = False
    user.role = UserRole.STUDENT
    user.elo_rating = elo
    return user


def make_fake_clan(leader_id, name="Grandmasters", tag="GM"):
    clan = MagicMock(spec=Clan)
    clan.id = uuid.uuid4()
    clan.name = name
    clan.tag = tag
    clan.description = "Elite chess club"
    clan.created_at = datetime.now(timezone.utc)
    clan.leader_id = leader_id

    member = MagicMock(spec=ClanMember)
    member.id = uuid.uuid4()
    member.clan_id = clan.id
    member.user_id = leader_id
    member.role = ClanRole.LEADER
    member.joined_at = datetime.now(timezone.utc)
    
    leader_user = make_fake_user(elo=1500)
    leader_user.id = leader_id
    member.user = leader_user

    clan.members = [member]
    return clan


# --- 1. Список кланов ---

@pytest.mark.asyncio
async def test_list_clans_empty(anonymous_client, mock_db_session):
    app.dependency_overrides[get_async_session] = lambda: mock_db_session
    mock_res = MagicMock()
    mock_res.scalars.return_value.all.return_value = []
    mock_db_session.execute.return_value = mock_res

    try:
        response = await anonymous_client.get("/api/clans")
        assert response.status_code == 200
        assert response.json() == []
    finally:
        app.dependency_overrides.pop(get_async_session, None)


@pytest.mark.asyncio
async def test_list_clans_with_data(anonymous_client, mock_db_session):
    app.dependency_overrides[get_async_session] = lambda: mock_db_session
    clan = make_fake_clan(leader_id=uuid.uuid4())

    mock_res = MagicMock()
    mock_res.scalars.return_value.all.return_value = [clan]
    mock_db_session.execute.return_value = mock_res

    try:
        response = await anonymous_client.get("/api/clans")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "Grandmasters"
        assert data[0]["tag"] == "GM"
        assert data[0]["members_count"] == 1
        assert data[0]["total_elo"] == 1500
    finally:
        app.dependency_overrides.pop(get_async_session, None)


# --- 2. Создание клана ---

@pytest.mark.asyncio
async def test_create_clan_unauthorized(anonymous_client):
    response = await anonymous_client.post(
        "/api/clans/create",
        json={"name": "Knights", "tag": "KNT"}
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_clan_success(anonymous_client, mock_db_session):
    user = make_fake_user()
    app.dependency_overrides[current_active_user] = lambda: user
    app.dependency_overrides[get_async_session] = lambda: mock_db_session

    mock_res_empty = MagicMock()
    mock_res_empty.scalar_one_or_none.return_value = None
    mock_db_session.execute.return_value = mock_res_empty

    try:
        response = await anonymous_client.post(
            "/api/clans/create",
            json={"name": "Knights", "tag": "KNT", "description": "We play e4"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Knights"
        assert data["tag"] == "KNT"
        assert data["leader_id"] == str(user.id)
        assert data["members_count"] == 1
        assert len(data["members"]) == 1
        assert data["members"][0]["role"] == ClanRole.LEADER.value
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)


@pytest.mark.asyncio
async def test_create_clan_already_in_clan_fails(anonymous_client, mock_db_session):
    user = make_fake_user()
    app.dependency_overrides[current_active_user] = lambda: user
    app.dependency_overrides[get_async_session] = lambda: mock_db_session

    existing_membership = MagicMock(spec=ClanMember)
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = existing_membership
    mock_db_session.execute.return_value = mock_res

    try:
        response = await anonymous_client.post(
            "/api/clans/create",
            json={"name": "Knights", "tag": "KNT"}
        )
        assert response.status_code == 400
        assert "уже состоите в клане" in response.json()["detail"]
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)


@pytest.mark.asyncio
async def test_create_clan_duplicate_name_or_tag_fails(anonymous_client, mock_db_session):
    user = make_fake_user()
    app.dependency_overrides[current_active_user] = lambda: user
    app.dependency_overrides[get_async_session] = lambda: mock_db_session

    mock_res_no_membership = MagicMock()
    mock_res_no_membership.scalar_one_or_none.return_value = None

    existing_clan = MagicMock(spec=Clan)
    mock_res_clan_exists = MagicMock()
    mock_res_clan_exists.scalar_one_or_none.return_value = existing_clan

    # 1й вызов — проверка членства (None), 2й вызов — поиск существующего клана (Found)
    mock_db_session.execute.side_effect = [mock_res_no_membership, mock_res_clan_exists]

    try:
        response = await anonymous_client.post(
            "/api/clans/create",
            json={"name": "Knights", "tag": "KNT"}
        )
        assert response.status_code == 400
        assert "уже существует" in response.json()["detail"]
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)


# --- 3. Вступление в клан ---

@pytest.mark.asyncio
async def test_join_clan_success(anonymous_client, mock_db_session):
    user = make_fake_user(elo=1600)
    clan_id = uuid.uuid4()
    clan = make_fake_clan(leader_id=uuid.uuid4())
    clan.id = clan_id

    app.dependency_overrides[current_active_user] = lambda: user
    app.dependency_overrides[get_async_session] = lambda: mock_db_session

    mock_res_no_membership = MagicMock()
    mock_res_no_membership.scalar_one_or_none.return_value = None

    mock_res_clan = MagicMock()
    mock_res_clan.scalar_one_or_none.return_value = clan

    mock_db_session.execute.side_effect = [mock_res_no_membership, mock_res_clan]

    try:
        response = await anonymous_client.post(f"/api/clans/{clan_id}/join")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(clan_id)
        assert mock_db_session.commit.called
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)


@pytest.mark.asyncio
async def test_join_clan_already_member_fails(anonymous_client, mock_db_session):
    user = make_fake_user()
    app.dependency_overrides[current_active_user] = lambda: user
    app.dependency_overrides[get_async_session] = lambda: mock_db_session

    existing_membership = MagicMock(spec=ClanMember)
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = existing_membership
    mock_db_session.execute.return_value = mock_res

    try:
        response = await anonymous_client.post(f"/api/clans/{uuid.uuid4()}/join")
        assert response.status_code == 400
        assert "уже состоите в клане" in response.json()["detail"]
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)


@pytest.mark.asyncio
async def test_join_clan_not_found_fails(anonymous_client, mock_db_session):
    user = make_fake_user()
    app.dependency_overrides[current_active_user] = lambda: user
    app.dependency_overrides[get_async_session] = lambda: mock_db_session

    mock_res_no_membership = MagicMock()
    mock_res_no_membership.scalar_one_or_none.return_value = None

    mock_res_no_clan = MagicMock()
    mock_res_no_clan.scalar_one_or_none.return_value = None

    mock_db_session.execute.side_effect = [mock_res_no_membership, mock_res_no_clan]

    try:
        response = await anonymous_client.post(f"/api/clans/{uuid.uuid4()}/join")
        assert response.status_code == 404
        assert "не найден" in response.json()["detail"]
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)


# --- 4. Выход из клана ---

@pytest.mark.asyncio
async def test_leave_clan_not_in_clan_fails(anonymous_client, mock_db_session):
    user = make_fake_user()
    app.dependency_overrides[current_active_user] = lambda: user
    app.dependency_overrides[get_async_session] = lambda: mock_db_session

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = None
    mock_db_session.execute.return_value = mock_res

    try:
        response = await anonymous_client.post("/api/clans/leave")
        assert response.status_code == 400
        assert "не состоите в клане" in response.json()["detail"]
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)


@pytest.mark.asyncio
async def test_leave_clan_leader_cannot_leave_fails(anonymous_client, mock_db_session):
    user = make_fake_user()
    app.dependency_overrides[current_active_user] = lambda: user
    app.dependency_overrides[get_async_session] = lambda: mock_db_session

    leader_membership = MagicMock(spec=ClanMember)
    leader_membership.role = ClanRole.LEADER

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = leader_membership
    mock_db_session.execute.return_value = mock_res

    try:
        response = await anonymous_client.post("/api/clans/leave")
        assert response.status_code == 400
        assert "Лидер не может покинуть клан" in response.json()["detail"]
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)


@pytest.mark.asyncio
async def test_leave_clan_regular_member_success(anonymous_client, mock_db_session):
    user = make_fake_user()
    app.dependency_overrides[current_active_user] = lambda: user
    app.dependency_overrides[get_async_session] = lambda: mock_db_session

    member_membership = MagicMock(spec=ClanMember)
    member_membership.role = ClanRole.MEMBER

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = member_membership
    mock_db_session.execute.return_value = mock_res

    try:
        response = await anonymous_client.post("/api/clans/leave")
        assert response.status_code == 200
        assert "успешно вышли" in response.json()["message"]
        assert mock_db_session.delete.called
        assert mock_db_session.commit.called
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)