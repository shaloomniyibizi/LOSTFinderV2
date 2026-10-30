"""Shapes of the data the API accepts and returns (validated by Pydantic)."""
import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from .models import ClaimStatus, ItemStatus, ItemType, Role


# ---------- Auth & users ----------
class RegisterIn(BaseModel):
    """Public sign-up. Everyone who signs up is a 'user' and can report both LOST and FOUND items."""
    full_name: str = Field(min_length=2, max_length=120)
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    password: str = Field(min_length=6, max_length=72)


class CreateUserIn(RegisterIn):
    """Admin-only: may create any role, e.g. staff (with a branch) or another admin."""
    role: Role = Role.user
    branch_id: str | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    full_name: str
    email: str
    phone: str | None
    role: Role
    branch_id: str | None
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Branches ----------
class BranchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    api_url: str


# ---------- Items ----------
class ItemIn(BaseModel):
    type: ItemType
    category: str = Field(min_length=2, max_length=60)
    colour: str | None = Field(default=None, max_length=40)
    title: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=2000)
    location: str = Field(default="", max_length=200)
    event_date: date
    # FOUND items only: a question the real owner can answer (e.g. "What sticker is on the lid?")
    verification_question: str | None = Field(default=None, max_length=300)


class ItemUpdate(BaseModel):
    """Every field optional: send only what changes."""
    category: str | None = Field(default=None, min_length=2, max_length=60)
    colour: str | None = Field(default=None, max_length=40)
    title: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    location: str | None = Field(default=None, max_length=200)
    event_date: date | None = None
    verification_question: str | None = Field(default=None, max_length=300)
    status: ItemStatus | None = None


class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    type: ItemType
    category: str
    colour: str | None
    title: str
    description: str
    location: str
    event_date: date
    photo_hash: str | None
    verification_question: str | None = None
    status: ItemStatus
    home_branch: str
    version: int
    reported_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class ItemPage(BaseModel):
    total: int
    items: list[ItemOut]


# ---------- Matches ----------
class MatchOut(BaseModel):
    id: uuid.UUID
    score: int
    created_at: datetime
    item: ItemOut  # the OTHER item of the pair


# ---------- Claims ----------
class ClaimIn(BaseModel):
    answer: str = Field(min_length=5, max_length=2000,
                        description="Answer to the verification question, or details only the owner knows")


class ClaimDecision(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class ClaimOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    item_id: uuid.UUID
    claimant_id: uuid.UUID
    answer: str
    status: ClaimStatus
    staff_note: str | None
    home_branch: str
    version: int
    created_at: datetime
    decided_at: datetime | None
    handed_over_at: datetime | None
    item_title: str | None = None
    item_question: str | None = None
    claimant_name: str | None = None
    claimant_email: str | None = None   # only shown to staff
    claimant_phone: str | None = None   # only shown to staff


# ---------- Activity feed (the bell) ----------
class ActivityOut(BaseModel):
    kind: str          # "match", "claim", "claim_on_my_item"
    title: str
    message: str
    link: str
    at: datetime
