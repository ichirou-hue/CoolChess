import uuid
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from database import get_async_session
from auth.models import User
from auth.manager import current_active_user
from clans.models import Clan, ClanMember, ClanRole
from clans.schemas import (
    ClanCreateRequest,
    ClanResponse,
    ClanDetailResponse,
    ClanMemberResponse,
)

clan_router = APIRouter(prefix="/api/clans", tags=["Кланы"])


async def _get_clan_stats(clan: Clan) -> tuple[int, int]:
    members_count = len(clan.members)
    total_elo = sum(m.user.elo_rating for m in clan.members if m.user)
    return members_count, total_elo


@clan_router.get("", response_model=List[ClanResponse])
async def list_clans(
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_async_session),
):
    """Список всех кланов."""
    stmt = select(Clan).order_by(desc(Clan.created_at)).offset(offset).limit(limit)
    res = await db.execute(stmt)
    clans = res.scalars().all()

    result = []
    for clan in clans:
        count, elo = await _get_clan_stats(clan)
        data = ClanResponse.model_validate(clan)
        data.members_count = count
        data.total_elo = elo
        result.append(data)
    return result


@clan_router.post("/create", response_model=ClanDetailResponse)
async def create_clan(
    payload: ClanCreateRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Создание нового клана. Создатель становится лидером."""
    # 1. Проверяем, не состоит ли пользователь уже в клане
    member_stmt = select(ClanMember).where(ClanMember.user_id == user.id)
    existing_membership = (await db.execute(member_stmt)).scalar_one_or_none()
    if existing_membership:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Вы уже состоите в клане. Сначала покиньте текущий клан."
        )

    # 2. Проверяем уникальность названия и тега
    clean_tag = payload.tag.strip().upper()
    clan_stmt = select(Clan).where(
        (Clan.name == payload.name.strip()) | (Clan.tag == clean_tag)
    )
    if (await db.execute(clan_stmt)).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Клан с таким именем или тегом уже существует."
        )

    now_utc = datetime.now(timezone.utc)

    clan = Clan(
        id=uuid.uuid4(),
        name=payload.name.strip(),
        tag=clean_tag,
        description=payload.description,
        leader_id=user.id,
        created_at=now_utc,
    )
    db.add(clan)

    membership = ClanMember(
        id=uuid.uuid4(),
        clan_id=clan.id,
        user_id=user.id,
        role=ClanRole.LEADER,
        joined_at=now_utc,
    )
    db.add(membership)

    await db.commit()
    await db.refresh(clan)

    member_response = [
        ClanMemberResponse(
            user_id=user.id,
            email=user.email,
            role=ClanRole.LEADER,
            elo_rating=user.elo_rating,
            joined_at=membership.joined_at,
        )
    ]

    response = ClanDetailResponse.model_validate(clan)
    response.members_count = 1
    response.total_elo = user.elo_rating
    response.members = member_response
    return response


@clan_router.post("/{clan_id}/join", response_model=ClanResponse)
async def join_clan(
    clan_id: uuid.UUID,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Вступление в открытый клан."""
    # 1. Проверяем членство пользователя
    member_stmt = select(ClanMember).where(ClanMember.user_id == user.id)
    if (await db.execute(member_stmt)).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Вы уже состоите в клане."
        )

    clan = (await db.execute(select(Clan).where(Clan.id == clan_id))).scalar_one_or_none()
    if not clan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Клан не найден.")

    new_member = ClanMember(
        id=uuid.uuid4(),
        clan_id=clan.id,
        user_id=user.id,
        role=ClanRole.MEMBER,
        joined_at=datetime.now(timezone.utc),
    )
    db.add(new_member)
    await db.commit()
    await db.refresh(clan)

    count, elo = await _get_clan_stats(clan)
    resp = ClanResponse.model_validate(clan)
    resp.members_count = count
    resp.total_elo = elo
    return resp


@clan_router.post("/leave", status_code=status.HTTP_200_OK)
async def leave_clan(
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Выход из клана."""
    member_stmt = select(ClanMember).where(ClanMember.user_id == user.id)
    membership = (await db.execute(member_stmt)).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Вы не состоите в клане.")

    if membership.role == ClanRole.LEADER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Лидер не может покинуть клан без роспуска или передачи прав."
        )

    await db.delete(membership)
    await db.commit()
    return {"message": "Вы успешно вышли из клана."}