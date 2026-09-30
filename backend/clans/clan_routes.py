import uuid
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.exc import IntegrityError

from database import get_async_session
from auth.models import User
from auth.manager import current_active_user
from clans.models import Clan, ClanMember, ClanRole
from clans.schemas import (
    ClanCreateRequest,
    ClanResponse,
    ClanDetailResponse,
    ClanMemberResponse,
    ClanTransferRequest,
)

clan_router = APIRouter(prefix="/api/clans", tags=["Кланы"])


async def _get_clan_stats(clan: Clan) -> tuple[int, int]:
    members_count = len(clan.members)
    total_elo = sum(m.user.elo_rating for m in clan.members if m.user)
    return members_count, total_elo


@clan_router.get("", response_model=List[ClanResponse])
async def list_clans(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
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

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Клан с таким именем или тегом уже существует.",
        )

    # Ответ строим явно из известных объектов: clan.members после commit
    # может быть не загружен (lazy-load в async-контексте), а у ClanMember
    # нет полей email/elo_rating — model_validate(clan) упал бы с 500.
    member_response = [
        ClanMemberResponse(
            user_id=user.id,
            email=user.email,
            role=ClanRole.LEADER,
            elo_rating=user.elo_rating,
            joined_at=membership.joined_at,
        )
    ]

    return ClanDetailResponse(
        id=clan.id,
        name=clan.name,
        tag=clan.tag,
        description=clan.description,
        created_at=clan.created_at,
        leader_id=clan.leader_id,
        members_count=1,
        total_elo=user.elo_rating,
        members=member_response,
    )


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
    try:
        await db.commit()
    except IntegrityError:
        # Гонка двух параллельных join: уникальный ключ (user_id) сработал.
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Вы уже состоите в клане."
        )
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


def _build_detail(clan: Clan) -> ClanDetailResponse:
    # Строим явно, а не model_validate(clan): у ClanMember нет полей
    # email/elo_rating (они лежат в связанном User), валидация бы упала.
    members = [
        ClanMemberResponse(
            user_id=m.user_id,
            email=m.user.email if m.user else "",
            role=m.role,
            elo_rating=m.user.elo_rating if m.user else 0,
            joined_at=m.joined_at,
        )
        for m in clan.members
    ]
    return ClanDetailResponse(
        id=clan.id,
        name=clan.name,
        tag=clan.tag,
        description=clan.description,
        created_at=clan.created_at,
        leader_id=clan.leader_id,
        members_count=len(clan.members),
        total_elo=sum(m.user.elo_rating for m in clan.members if m.user),
        members=members,
    )


@clan_router.get("/{clan_id}", response_model=ClanDetailResponse)
async def get_clan(
    clan_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_session),
):
    """Карточка клана с составом."""
    clan = (await db.execute(select(Clan).where(Clan.id == clan_id))).scalar_one_or_none()
    if not clan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Клан не найден.")
    return _build_detail(clan)


@clan_router.post("/disband", status_code=status.HTTP_200_OK)
async def disband_clan(
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Роспуск клана. Только лидер."""
    member_stmt = select(ClanMember).where(ClanMember.user_id == user.id)
    membership = (await db.execute(member_stmt)).scalar_one_or_none()
    if not membership or membership.role != ClanRole.LEADER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только лидер клана может его распустить."
        )
    clan = (
        await db.execute(select(Clan).where(Clan.id == membership.clan_id))
    ).scalar_one_or_none()
    if not clan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Клан не найден.")
    await db.delete(clan)  # участники удаляются каскадом
    await db.commit()
    return {"message": "Клан распущен."}


@clan_router.post("/transfer", response_model=ClanDetailResponse)
async def transfer_leadership(
    payload: ClanTransferRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Передача лидерства участнику того же клана. Только лидер."""
    member_stmt = select(ClanMember).where(ClanMember.user_id == user.id)
    membership = (await db.execute(member_stmt)).scalar_one_or_none()
    if not membership or membership.role != ClanRole.LEADER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только лидер клана может передать права."
        )
    if payload.new_leader_user_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Вы уже являетесь лидером клана."
        )
    new_leader_stmt = select(ClanMember).where(
        ClanMember.clan_id == membership.clan_id,
        ClanMember.user_id == payload.new_leader_user_id,
    )
    new_leader = (await db.execute(new_leader_stmt)).scalar_one_or_none()
    if not new_leader:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Новый лидер должен состоять в этом клане."
        )
    clan = (
        await db.execute(select(Clan).where(Clan.id == membership.clan_id))
    ).scalar_one_or_none()
    if not clan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Клан не найден.")

    membership.role = ClanRole.OFFICER
    new_leader.role = ClanRole.LEADER
    clan.leader_id = payload.new_leader_user_id
    await db.commit()
    await db.refresh(clan)
    return _build_detail(clan)