"""Replication between branches through RabbitMQ.

How it works
------------
1. When this branch creates/changes/deletes an item (or a user signs up), the code calls
   `record_event(...)`. That only ADDS a row to the `outbox_events` table, inside the same
   transaction as the change itself.
2. The PUBLISHER thread reads unsent outbox rows (oldest first), sends them to the RabbitMQ
   exchange "lostfound.events", and marks them sent once RabbitMQ confirms it received them.
3. Every branch has its own durable queue ("branch-A", "branch-B", "branch-C") bound to that
   exchange, so every event is delivered to every branch. Durable queues keep messages while a
   branch is offline: when it comes back, it receives everything it missed.
4. The CONSUMER thread reads this branch's queue and calls `apply_event(...)`:
     - events from this branch itself are ignored;
     - an item is inserted if it is new, replaced only if the incoming `version` is HIGHER
       than the stored one (older or duplicate messages are ignored);
     - a deleted item is removed.

Only the item's home branch ever changes an item, so there are no conflicting writes:
other branches just keep read-only copies.
"""
import json
import logging
import threading
import time
import uuid
from datetime import date, datetime, timezone

import pika
from sqlalchemy import event as sa_event
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import KNOWN_BRANCHES, settings
from .database import SessionLocal
from .notifier import notifier as _notifier
from .models import Claim, ClaimStatus, Item, ItemStatus, ItemType, OutboxEvent, Role, User

log = logging.getLogger("replication")

EXCHANGE = "lostfound.events"


def queue_name(branch_id: str) -> str:
    return f"branch-{branch_id}"


# ----------------------------------------------------------------------------
# Turning rows into event payloads
# ----------------------------------------------------------------------------
def item_payload(item: Item) -> dict:
    return {
        "id": str(item.id),
        "type": item.type.value,
        "category": item.category,
        "colour": item.colour,
        "title": item.title,
        "description": item.description,
        "location": item.location,
        "event_date": item.event_date.isoformat(),
        "photo_hash": item.photo_hash,
        "verification_question": item.verification_question,
        "status": item.status.value,
        "home_branch": item.home_branch,
        "version": item.version,
        "reported_by": str(item.reported_by) if item.reported_by else None,
        "created_at": item.created_at.isoformat(),
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


def user_payload(user: User) -> dict:
    # The password HASH is shared so a user can log in at any branch.
    # Branches talk over a private Docker network; never expose RabbitMQ to the internet.
    return {
        "id": str(user.id),
        "full_name": user.full_name,
        "email": user.email,
        "phone": user.phone,
        "password_hash": user.password_hash,
        "role": user.role.value,
        "branch_id": user.branch_id,
        "created_at": user.created_at.isoformat(),
    }


def claim_payload(claim: Claim) -> dict:
    return {
        "id": str(claim.id),
        "item_id": str(claim.item_id),
        "claimant_id": str(claim.claimant_id),
        "answer": claim.answer,
        "status": claim.status.value,
        "handled_by": str(claim.handled_by) if claim.handled_by else None,
        "staff_note": claim.staff_note,
        "home_branch": claim.home_branch,
        "version": claim.version,
        "created_at": claim.created_at.isoformat(),
        "decided_at": claim.decided_at.isoformat() if claim.decided_at else None,
        "handed_over_at": claim.handed_over_at.isoformat() if claim.handed_over_at else None,
    }


def _claim_fields(d: dict) -> dict:
    return {
        "item_id": uuid.UUID(d["item_id"]),
        "claimant_id": uuid.UUID(d["claimant_id"]),
        "answer": d["answer"],
        "status": ClaimStatus(d["status"]),
        "handled_by": uuid.UUID(d["handled_by"]) if d.get("handled_by") else None,
        "staff_note": d.get("staff_note"),
        "home_branch": d["home_branch"],
        "version": int(d["version"]),
        "created_at": _dt(d.get("created_at")),
        "decided_at": _dt(d.get("decided_at")),
        "handed_over_at": _dt(d.get("handed_over_at")),
    }


def record_event(db: Session, event_type: str, data: dict) -> None:
    """Add an event to the outbox. Call BEFORE db.commit() so both are saved together."""
    db.add(OutboxEvent(event_type=event_type, payload={"origin": settings.branch_id, "data": data}))
    db.info["has_outbox_events"] = True  # wake the publisher as soon as this transaction commits


# ----------------------------------------------------------------------------
# Applying events received from other branches
# ----------------------------------------------------------------------------
def _dt(value: str | None) -> datetime | None:
    if not value:
        return None
    dt = datetime.fromisoformat(value)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _item_fields(d: dict) -> dict:
    return {
        "type": ItemType(d["type"]),
        "category": d["category"],
        "colour": d.get("colour"),
        "title": d["title"],
        "description": d.get("description", ""),
        "location": d.get("location", ""),
        "event_date": date.fromisoformat(d["event_date"]),
        "photo_hash": d.get("photo_hash"),
        "verification_question": d.get("verification_question"),
        "status": ItemStatus(d["status"]),
        "home_branch": d["home_branch"],
        "version": int(d["version"]),
        "reported_by": uuid.UUID(d["reported_by"]) if d.get("reported_by") else None,
        "created_at": _dt(d.get("created_at")),
        "updated_at": _dt(d.get("updated_at")) or _dt(d.get("created_at")),
    }


def _without_missing_times(fields: dict) -> dict:
    """Leave out timestamps that weren't sent, so the database defaults fill them in."""
    return {k: v for k, v in fields.items() if not (k in ("created_at", "updated_at") and v is None)}


def apply_event(db: Session, event_type: str, envelope: dict) -> str:
    """Apply one event to this branch's database. Returns what happened (for logs and tests).
    The caller commits."""
    origin = envelope.get("origin")
    data = envelope.get("data") or {}
    if origin == settings.branch_id:
        return "ignored: own event"

    if event_type in ("item.created", "item.updated"):
        item_id = uuid.UUID(data["id"])
        existing = db.get(Item, item_id)
        if existing is None:
            db.add(Item(id=item_id, **_without_missing_times(_item_fields(data))))
            return "inserted"
        if int(data["version"]) > existing.version:
            for field, value in _without_missing_times(_item_fields(data)).items():
                setattr(existing, field, value)
            return "updated"
        return "ignored: not newer"

    if event_type == "item.deleted":
        existing = db.get(Item, uuid.UUID(data["id"]))
        if existing is None:
            return "ignored: not found"
        db.delete(existing)
        return "deleted"

    if event_type in ("claim.created", "claim.updated"):
        claim_id = uuid.UUID(data["id"])
        existing = db.get(Claim, claim_id)
        if existing is None:
            db.add(Claim(id=claim_id, **_without_missing_times(_claim_fields(data))))
            return "inserted"
        if int(data["version"]) > existing.version:
            for field, value in _claim_fields(data).items():
                setattr(existing, field, value)
            return "updated"
        return "ignored: not newer"

    if event_type == "user.created":
        user_id = uuid.UUID(data["id"])
        if db.get(User, user_id) is not None:
            return "ignored: already exists"
        if db.scalar(select(User).where(User.email == data["email"])) is not None:
            # Same email signed up at two branches before they synced. Keep the local one.
            log.warning("user.created conflict: email %s already used here", data["email"])
            return "ignored: email conflict"
        db.add(User(
            id=user_id,
            full_name=data["full_name"],
            email=data["email"],
            phone=data.get("phone"),
            password_hash=data["password_hash"],
            role=Role(data["role"]),
            branch_id=data.get("branch_id"),
            created_at=_dt(data.get("created_at")),
        ))
        return "inserted"

    return f"ignored: unknown event {event_type}"


# ----------------------------------------------------------------------------
# RabbitMQ background threads
# ----------------------------------------------------------------------------
class ReplicationStatus:
    def __init__(self):
        self.publisher_connected = False
        self.consumer_connected = False
        self.events_sent = 0
        self.events_received = 0
        self.last_error: str | None = None

    def as_dict(self) -> dict:
        return dict(self.__dict__)


status = ReplicationStatus()
_stop = threading.Event()
_wake_publisher = threading.Event()


@sa_event.listens_for(Session, "after_commit")
def _after_commit(session) -> None:
    """A transaction that added outbox events was committed: tell the publisher immediately,
    instead of letting the events wait for its next check (Phase 5 latency improvement)."""
    if session.info.pop("has_outbox_events", False):
        _wake_publisher.set()


def _connect() -> pika.BlockingConnection:
    params = pika.URLParameters(settings.rabbitmq_url)
    params.heartbeat = 30
    params.connection_attempts = 1
    return pika.BlockingConnection(params)


def _declare_topology(channel) -> None:
    """Create the exchange and ALL branches' queues (safe to repeat).
    Declaring every branch's queue here means messages are kept even for a branch
    that has never started yet."""
    channel.exchange_declare(exchange=EXCHANGE, exchange_type="topic", durable=True)
    for branch in KNOWN_BRANCHES:
        q = queue_name(branch["id"])
        channel.queue_declare(queue=q, durable=True)
        channel.queue_bind(queue=q, exchange=EXCHANGE, routing_key="#")


def _publisher_loop() -> None:
    while not _stop.is_set():
        try:
            conn = _connect()
            channel = conn.channel()
            _declare_topology(channel)
            channel.confirm_delivery()  # RabbitMQ confirms each message was stored
            status.publisher_connected = True
            log.info("publisher connected to RabbitMQ")
            while not _stop.is_set():
                with SessionLocal() as db:
                    pending = db.scalars(
                        select(OutboxEvent).where(OutboxEvent.sent_at.is_(None))
                        .order_by(OutboxEvent.id).limit(100)
                    ).all()
                    for ev in pending:
                        body = json.dumps({
                            "event_id": str(ev.event_id),
                            "event_type": ev.event_type,
                            **ev.payload,
                        })
                        channel.basic_publish(
                            exchange=EXCHANGE,
                            routing_key=ev.event_type,
                            body=body,
                            properties=pika.BasicProperties(
                                delivery_mode=pika.DeliveryMode.Persistent,
                                content_type="application/json",
                            ),
                        )
                        ev.sent_at = datetime.now(timezone.utc)
                        db.commit()
                        status.events_sent += 1
                if not pending:
                    conn.process_data_events(time_limit=0)   # keeps the connection alive
                    _wake_publisher.wait(0.5)                 # sleep until a new event is committed
                    _wake_publisher.clear()
        except Exception as exc:  # RabbitMQ down, network error, database down...
            status.publisher_connected = False
            status.last_error = f"publisher: {exc!r}"
            log.warning("publisher problem, retrying in 3s: %r", exc)
            _stop.wait(3)


def _on_message(channel, method, properties, body) -> None:
    try:
        message = json.loads(body)
        event_type = message.get("event_type") or method.routing_key
    except ValueError:
        log.error("dropping unreadable message: %r", body[:200])
        channel.basic_ack(method.delivery_tag)
        return
    try:
        with SessionLocal() as db:
            result = apply_event(db, event_type, message)
            db.commit()
            if result in ("inserted", "updated"):
                after_remote_change(db, event_type, message.get("data") or {})
        if not result.startswith("ignored: own"):
            status.events_received += 1
            log.info("%s from branch %s -> %s", event_type, message.get("origin"), result)
        channel.basic_ack(method.delivery_tag)
    except Exception as exc:
        # Probably our database is unavailable: put the message back and try again later.
        status.last_error = f"consumer: {exc!r}"
        log.warning("could not apply %s, will retry: %r", event_type, exc)
        time.sleep(2)
        channel.basic_nack(method.delivery_tag, requeue=True)


def after_remote_change(db: Session, event_type: str, data: dict) -> None:
    """React to another branch's change once it is saved here: look for new matches,
    and notify people connected to THIS branch."""
    from .announce import announce_claim
    from .matching import safe_run_for_item

    try:
        if event_type in ("item.created", "item.updated"):
            safe_run_for_item(uuid.UUID(data["id"]))
        elif event_type in ("claim.created", "claim.updated"):
            claim = db.get(Claim, uuid.UUID(data["id"]))
            if claim:
                announce_claim(db, claim, event_type)
    except Exception:
        log.exception("after_remote_change failed for %s", event_type)


def _consumer_loop() -> None:
    while not _stop.is_set():
        try:
            conn = _connect()
            channel = conn.channel()
            _declare_topology(channel)
            channel.basic_qos(prefetch_count=20)
            channel.basic_consume(queue=queue_name(settings.branch_id), on_message_callback=_on_message)
            status.consumer_connected = True
            log.info("consumer listening on %s", queue_name(settings.branch_id))
            while not _stop.is_set():
                conn.process_data_events(time_limit=1)
            conn.close()
        except Exception as exc:
            status.consumer_connected = False
            status.last_error = f"consumer: {exc!r}"
            log.warning("consumer problem, retrying in 3s: %r", exc)
            _stop.wait(3)
    status.consumer_connected = False


def start() -> None:
    if not settings.rabbitmq_url:
        log.info("RABBITMQ_URL not set: replication is OFF")
        return
    _stop.clear()
    threading.Thread(target=_publisher_loop, name="publisher", daemon=True).start()
    threading.Thread(target=_consumer_loop, name="consumer", daemon=True).start()


def stop() -> None:
    _stop.set()


def summary(db: Session) -> dict:
    """Numbers for GET /replication/status."""
    by_branch = dict(db.execute(select(Item.home_branch, func.count()).group_by(Item.home_branch)).all())
    pending = db.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.sent_at.is_(None)))
    return {
        "branch": settings.branch_id,
        "replication_enabled": bool(settings.rabbitmq_url),
        **status.as_dict(),
        "outbox_pending": pending,
        "items_by_home_branch": by_branch,
        "users": db.scalar(select(func.count()).select_from(User)),
        "websocket_clients": _notifier.connected_count,
    }
