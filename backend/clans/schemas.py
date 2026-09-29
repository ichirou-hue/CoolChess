import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict

from clans.models import ClanRole


class ClanCreateRequest(BaseModel):
    name: str = Field(..., min_length=3, max_length=50, description="Название клана")
    tag: str = Field(..., min_length=2, max_length=6, description="Тег клана (например, COOL)")
    description: Optional[str] = Field(None, max_length=255)


class ClanTransferRequest(BaseModel):
    new_leader_user_id: uuid.UUID = Field(..., description="Участник, которому передаётся лидерство")


class ClanMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    email: str
    role: ClanRole
    elo_rating: int
    joined_at: datetime


class ClanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    tag: str
    description: Optional[str]
    created_at: datetime
    leader_id: uuid.UUID
    members_count: int = 0
    total_elo: int = 0


class ClanDetailResponse(ClanResponse):
    members: List[ClanMemberResponse] = []