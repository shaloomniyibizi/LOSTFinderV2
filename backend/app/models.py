"""Database tables.

The same tables exist in every branch's database.
Two columns make the system distributable (used from Phase 2 on):
  - items.home_branch : which branch OWNS the item and is allowed to change it
  - items.version     : goes up by 1 on every change, so branches can tell which copy is newer
IDs are UUIDs so that two branches can never create the same id.
"""
import enum
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, enum.Enum):
    owner = "owner"    # lost something
    finder = "finder"  # found something
    staff = "staff"    # works at a branch office
    admin = "admin"    # manages the whole system


class ItemType(str, enum.Enum):
    LOST = "LOST"
    FOUND = "FOUND"


class ItemStatus(str, enum.Enum):
    OPEN = "OPEN"          # reported, waiting for a match
    MATCHED = "MATCHED"    # a likely match was found (Phase 4)
    CLAIMED = "CLAIMED"    # an owner's claim was accepted (Phase 4)
    RETURNED = "RETURNED"  # handed over, case closed


class ClaimStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


def _enum(e):
    # Stored as plain text with a check, so it works the same on PostgreSQL and SQLite
    return Enum(e, native_enum=False, length=20)


class Branch(Base):
    __tablename__ = "branches"

    id: Mapped[str] = mapped_column(String(5), primary_key=True)  # "A", "B", "C"
    name: Mapped[str] = mapped_column(String(100))
    api_url: Mapped[str] = mapped_column(String(200))


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[Role] = mapped_column(_enum(Role), default=Role.owner)
    branch_id: Mapped[str | None] = mapped_column(ForeignKey("branches.id"), nullable=True)  # staff only
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Item(Base):
    __tablename__ = "items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    type: Mapped[ItemType] = mapped_column(_enum(ItemType), index=True)
    category: Mapped[str] = mapped_column(String(60), index=True)  # phone, laptop, bag, ID card...
    colour: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    location: Mapped[str] = mapped_column(String(200), default="")  # where it was lost / found
    event_date: Mapped[date] = mapped_column(Date)                   # when it was lost / found
    photo_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)  # Phase 3
    status: Mapped[ItemStatus] = mapped_column(_enum(ItemStatus), default=ItemStatus.OPEN, index=True)

    # Distribution fields
    home_branch: Mapped[str] = mapped_column(String(5), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)

    reported_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Claim(Base):
    """Used in Phase 4. Created now so the schema is complete."""
    __tablename__ = "claims"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("items.id"), index=True)
    claimant_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    answer: Mapped[str] = mapped_column(Text)  # answer to the verification question
    status: Mapped[ClaimStatus] = mapped_column(_enum(ClaimStatus), default=ClaimStatus.PENDING)
    handled_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)  # staff member
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Match(Base):
    """Used in Phase 4. Created now so the schema is complete."""
    __tablename__ = "matches"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    lost_item_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    found_item_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    score: Mapped[int] = mapped_column(Integer)
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
