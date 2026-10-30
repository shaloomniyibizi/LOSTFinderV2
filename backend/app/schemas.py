"""Shapes of the data the API accepts and returns (validated by Pydantic)."""
import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from .models import ItemStatus, ItemType, Role


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


class ItemUpdate(BaseModel):
    """Every field optional: send only what changes."""
    category: str | None = Field(default=None, min_length=2, max_length=60)
    colour: str | None = Field(default=None, max_length=40)
    title: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    location: str | None = Field(default=None, max_length=200)
    event_date: date | None = None
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
    status: ItemStatus
    home_branch: str
    version: int
    reported_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class ItemPage(BaseModel):
    total: int
    items: list[ItemOut]
