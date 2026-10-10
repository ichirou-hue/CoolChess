import uuid
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth.manager import current_active_user, current_optional_user, require_role
from auth.models import User, UserRole
from database import get_async_session
from tournaments.models import Tournament, TournamentParticipant

tournament_router = APIRouter(prefix="/api/tournaments", tags=["Турниры"])
managers = require_role(UserRole.COACH, UserRole.ADMIN)
ColorChoice = Literal["white", "black", "random"]
TournamentFormat = Literal["round_robin", "swiss", "single_elimination"]


class TournamentCreate(BaseModel):
    name: str = Field(min_length=3, max_length=80)
    description: Optional[str] = Field(default=None, max_length=2000)
    format: TournamentFormat = "round_robin"
    time_control: int = Field(default=300, ge=30, le=7200)
    increment: int = Field(default=0, ge=0, le=60)
    max_players: int = Field(default=32, ge=2, le=128)


class ParticipantAdd(BaseModel):
    user_id: Optional[uuid.UUID] = None


class ParticipantUpdate(BaseModel):
    group_name: Optional[str] = Field(default=None, max_length=24)
    preferred_color: Optional[ColorChoice] = None


def _is_manager(user: User) -> bool:
    return user.is_superuser or user.role in (UserRole.COACH, UserRole.ADMIN)


def _participant_dict(participant: TournamentParticipant) -> dict:
    user = participant.user
    return {
        "user_id": str(user.id),
        "display_name": user.display_name,
        "elo_rating": user.elo_rating,
        "group_name": participant.group_name,
        "preferred_color": participant.preferred_color,
        "joined_at": participant.joined_at.isoformat(),
    }


def _tournament_dict(tournament: Tournament, current_user_id: Optional[uuid.UUID] = None) -> dict:
    participants = tournament.participants
    return {
        "id": str(tournament.id),
        "name": tournament.name,
        "description": tournament.description,
        "format": tournament.format,
        "time_control": tournament.time_control,
        "increment": tournament.increment,
        "max_players": tournament.max_players,
        "status": tournament.status,
        "created_at": tournament.created_at.isoformat(),
        "participants": [_participant_dict(participant) for participant in participants],
        "is_joined": any(item.user_id == current_user_id for item in participants) if current_user_id else False,
    }


async def _load_tournament(db: AsyncSession, tournament_id: uuid.UUID) -> Tournament:
    result = await db.execute(
        select(Tournament)
        .options(selectinload(Tournament.participants).selectinload(TournamentParticipant.user))
        .where(Tournament.id == tournament_id)
    )
    tournament = result.scalar_one_or_none()
    if tournament is None:
        raise HTTPException(status_code=404, detail="Турнир не найден.")
    return tournament


@tournament_router.get("")
async def list_tournaments(
    current_user: Optional[User] = Depends(current_optional_user),
    db: AsyncSession = Depends(get_async_session),
):
    result = await db.execute(
        select(Tournament)
        .options(selectinload(Tournament.participants).selectinload(TournamentParticipant.user))
        .order_by(Tournament.created_at.desc())
    )
    user_id = current_user.id if current_user else None
    return [_tournament_dict(item, user_id) for item in result.scalars().all()]


@tournament_router.post("", status_code=status.HTTP_201_CREATED)
async def create_tournament(
    payload: TournamentCreate,
    user: User = Depends(managers),
    db: AsyncSession = Depends(get_async_session),
):
    tournament = Tournament(
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        format=payload.format,
        time_control=payload.time_control,
        increment=payload.increment,
        max_players=payload.max_players,
        created_by_id=user.id,
    )
    if len(tournament.name) < 3:
        raise HTTPException(status_code=422, detail="Название должно содержать не менее 3 символов.")
    db.add(tournament)
    await db.commit()
    tournament = await _load_tournament(db, tournament.id)
    return _tournament_dict(tournament, user.id)


@tournament_router.get("/players")
async def list_tournament_players(
    _manager: User = Depends(managers),
    db: AsyncSession = Depends(get_async_session),
):
    result = await db.execute(
        select(User).where(User.is_active.is_(True)).order_by(User.display_name.asc())
    )
    return [
        {"id": str(user.id), "display_name": user.display_name, "elo_rating": user.elo_rating}
        for user in result.scalars().all()
    ]


@tournament_router.post("/{tournament_id}/participants")
async def add_tournament_participant(
    tournament_id: uuid.UUID,
    payload: ParticipantAdd,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    tournament = await _load_tournament(db, tournament_id)
    participant_id = payload.user_id or user.id
    if participant_id != user.id and not _is_manager(user):
        raise HTTPException(status_code=403, detail="Добавлять других игроков может только учитель или администратор.")
    if tournament.status != "registration":
        raise HTTPException(status_code=409, detail="Регистрация на турнир закрыта.")
    if len(tournament.participants) >= tournament.max_players:
        raise HTTPException(status_code=409, detail="В турнире уже достигнут лимит участников.")
    result = await db.execute(
        select(User).where(User.id == participant_id, User.is_active.is_(True))
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Активный пользователь не найден.")
    if any(item.user_id == participant_id for item in tournament.participants):
        raise HTTPException(status_code=409, detail="Игрок уже зарегистрирован на этот турнир.")
    participant = TournamentParticipant(tournament_id=tournament.id, user_id=participant_id)
    db.add(participant)
    await db.commit()
    refreshed = await _load_tournament(db, tournament.id)
    return _tournament_dict(refreshed, user.id)


@tournament_router.patch("/{tournament_id}/me/side")
async def choose_tournament_side(
    tournament_id: uuid.UUID,
    payload: ParticipantUpdate,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    tournament = await _load_tournament(db, tournament_id)
    participant = next((item for item in tournament.participants if item.user_id == user.id), None)
    if participant is None:
        raise HTTPException(status_code=404, detail="Сначала зарегистрируйтесь на турнир.")
    participant.preferred_color = payload.preferred_color
    await db.commit()
    return _tournament_dict(await _load_tournament(db, tournament.id), user.id)


@tournament_router.patch("/{tournament_id}/participants/{user_id}")
async def assign_tournament_participant(
    tournament_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: ParticipantUpdate,
    _manager: User = Depends(managers),
    db: AsyncSession = Depends(get_async_session),
):
    tournament = await _load_tournament(db, tournament_id)
    participant = next((item for item in tournament.participants if item.user_id == user_id), None)
    if participant is None:
        raise HTTPException(status_code=404, detail="Игрок не зарегистрирован на турнир.")
    if "group_name" in payload.model_fields_set:
        participant.group_name = payload.group_name.strip() if payload.group_name else None
    if "preferred_color" in payload.model_fields_set:
        participant.preferred_color = payload.preferred_color
    await db.commit()
    return _tournament_dict(await _load_tournament(db, tournament.id))


@tournament_router.delete("/{tournament_id}/participants/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_tournament_participant(
    tournament_id: uuid.UUID,
    user_id: uuid.UUID,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    if user.id != user_id and not _is_manager(user):
        raise HTTPException(status_code=403, detail="Удалить другого игрока может только учитель или администратор.")
    tournament = await _load_tournament(db, tournament_id)
    participant = next((item for item in tournament.participants if item.user_id == user_id), None)
    if participant is None:
        raise HTTPException(status_code=404, detail="Игрок не зарегистрирован на турнир.")
    await db.delete(participant)
    await db.commit()
