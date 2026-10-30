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

from sqlalchemy import JSON, Date, DateTime, Enum, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, enum.Enum):
    user = "user"      # any member of the public: can report LOST and FOUND items
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
    role: Mapped[Role] = mapped_column(_enum(Role), default=Role.user)
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
    # FOUND items: a question only the real owner can answer, e.g. "What sticker is on the lid?"
    verification_question: Mapped[str | None] = mapped_column(String(300), nullable=True)
    status: Mapped[ItemStatus] = mapped_column(_enum(ItemStatus), default=ItemStatus.OPEN, index=True)

    # Distribution fields
    home_branch: Mapped[str] = mapped_column(String(5), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)

    reported_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Claim(Base):
    """Someone says a FOUND item is theirs. Created and changed ONLY at the item's home branch
    (which locks the item so that only one claim can succeed), then copied to all branches."""
    __tablename__ = "claims"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    item_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    claimant_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    answer: Mapped[str] = mapped_column(Text)  # proof of ownership / answer to the verification question
    status: Mapped[ClaimStatus] = mapped_column(_enum(ClaimStatus), default=ClaimStatus.PENDING, index=True)
    handled_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)  # staff member who decided
    staff_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    home_branch: Mapped[str] = mapped_column(String(5), index=True)  # = the item's home branch
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    handed_over_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class OutboxEvent(Base):
    """Events waiting to be sent to the other branches (the 'outbox pattern').

    An event is saved in the SAME database transaction as the change it describes,
    so a change can never be saved without its event (or the other way round).
    A background thread sends unsent events to RabbitMQ and marks them sent.
    If RabbitMQ is down, events simply wait here and go out when it comes back.
    """
    __tablename__ = "outbox_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)  # keeps send order
    event_id: Mapped[uuid.UUID] = mapped_column(Uuid, default=uuid.uuid4, unique=True)
    event_type: Mapped[str] = mapped_column(String(40))  # item.created, item.updated, item.deleted, user.created
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)


class Match(Base):
    """A likely pair of LOST + FOUND items. Every branch computes matches by itself from its own
    copy of the data; the id is derived from the two item ids, so all branches agree on it."""
    __tablename__ = "matches"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    lost_item_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    found_item_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    score: Mapped[int] = mapped_column(Integer)
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class QueuedRequest(Base):
    """A request that must be handled by ANOTHER branch which is offline right now (Phase 5).

    Example: you claim an item whose home branch (Bus Park) is down. Instead of refusing, this branch
    keeps the claim here and a background thread delivers it as soon as Bus Park is back.
    The final decision is still taken at the home branch, so it stays safe (one claim per item)."""
    __tablename__ = "queued_requests"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(20), default="claim")
    target_branch: Mapped[str] = mapped_column(String(5), index=True)
    item_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    payload: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(12), default="QUEUED", index=True)  # QUEUED, DELIVERED, FAILED
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
