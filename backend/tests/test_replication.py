"""Replication logic tests (no RabbitMQ needed).

These tests run as Branch A. They check that:
  - changes on Branch A put the right events in the outbox, and
  - events "received" from Branch B are applied correctly (insert, newer version wins,
    older/duplicate ignored, delete, users copied so they can log in here).
"""
import uuid
from datetime import date

from sqlalchemy import select

from app.database import SessionLocal
from app.models import Item, OutboxEvent, User
from app.replication import apply_event
from app.security import hash_password
from conftest import login, register

TODAY = date.today().isoformat()


def outbox():
    with SessionLocal() as db:
        return [(e.event_type, e.payload) for e in db.scalars(select(OutboxEvent).order_by(OutboxEvent.id))]


def remote_item(**extra):
    data = {
        "id": str(uuid.uuid4()), "type": "FOUND", "category": "phone", "colour": "blue",
        "title": "Blue Samsung phone", "description": "cracked screen", "location": "Bus park",
        "event_date": TODAY, "photo_hash": None, "status": "OPEN", "home_branch": "B",
        "version": 1, "reported_by": None,
        "created_at": "2026-10-30T10:00:00+00:00", "updated_at": "2026-10-30T10:00:00+00:00",
    }
    data.update(extra)
    return data


def apply(event_type, data, origin="B"):
    with SessionLocal() as db:
        result = apply_event(db, event_type, {"origin": origin, "data": data})
        db.commit()
        return result


# ---------- Outgoing: changes on this branch create outbox events ----------
def test_register_creates_user_event(client):
    register(client, "alice@example.com")
    events = outbox()
    assert events[-1][0] == "user.created"
    assert events[-1][1]["origin"] == "A"
    assert events[-1][1]["data"]["email"] == "alice@example.com"


def test_item_create_update_delete_create_events(client, admin_headers):
    headers = register(client, "bob@example.com")
    item = client.post("/items", headers=headers, json={
        "type": "LOST", "category": "bag", "title": "Red bag", "event_date": TODAY,
    }).json()
    client.patch(f"/items/{item['id']}", headers=headers, json={"colour": "red"})
    client.delete(f"/items/{item['id']}", headers=admin_headers)

    item_events = [(t, p["data"]) for t, p in outbox() if t.startswith("item.")]
    assert [t for t, _ in item_events] == ["item.created", "item.updated", "item.deleted"]
    assert item_events[0][1]["version"] == 1
    assert item_events[1][1]["version"] == 2 and item_events[1][1]["colour"] == "red"
    assert item_events[2][1]["id"] == item["id"]


def test_failed_request_creates_no_event(client):
    before = len(outbox())
    r = client.post("/auth/register", json={"full_name": "X", "email": "bad-email", "password": "secret123"})
    assert r.status_code == 422
    assert len(outbox()) == before


# ---------- Incoming: events from other branches ----------
def test_insert_remote_item_and_search_it(client):
    data = remote_item()
    assert apply("item.created", data) == "inserted"
    r = client.get("/items", params={"q": "samsung"}).json()
    assert r["total"] == 1
    assert r["items"][0]["home_branch"] == "B"


def test_newer_version_wins_older_is_ignored(client):
    data = remote_item()
    apply("item.created", data)
    assert apply("item.updated", {**data, "version": 3, "status": "CLAIMED"}) == "updated"
    # A delayed, older message arrives late: it must NOT overwrite the newer copy
    assert apply("item.updated", {**data, "version": 2, "status": "MATCHED"}) == "ignored: not newer"
    # The same message delivered twice is harmless
    assert apply("item.updated", {**data, "version": 3, "status": "CLAIMED"}) == "ignored: not newer"
    with SessionLocal() as db:
        item = db.get(Item, uuid.UUID(data["id"]))
        assert item.version == 3 and item.status.value == "CLAIMED"


def test_update_before_create_still_works(client):
    """If item.updated arrives first (e.g. this branch joined late), the item is simply inserted."""
    data = remote_item(version=5)
    assert apply("item.updated", data) == "inserted"


def test_remote_delete(client):
    data = remote_item()
    apply("item.created", data)
    assert apply("item.deleted", {"id": data["id"], "version": 2}) == "deleted"
    assert client.get(f"/items/{data['id']}").status_code == 404
    assert apply("item.deleted", {"id": data["id"], "version": 2}) == "ignored: not found"


def test_own_events_are_ignored(client):
    assert apply("item.created", remote_item(home_branch="A"), origin="A") == "ignored: own event"


def test_remote_item_cannot_be_edited_here(client, admin_headers):
    data = remote_item()
    apply("item.created", data)
    r = client.patch(f"/items/{data['id']}", headers=admin_headers, json={"title": "Changed"})
    assert r.status_code == 409


def test_user_registered_at_other_branch_can_log_in_here(client):
    user = {
        "id": str(uuid.uuid4()), "full_name": "Claude Remote", "email": "remote@example.com",
        "phone": None, "password_hash": hash_password("secret123"), "role": "user",
        "branch_id": None, "created_at": "2026-10-30T10:00:00+00:00",
    }
    assert apply("user.created", user) == "inserted"
    assert apply("user.created", user) == "ignored: not newer"  # delivered twice: no change
    headers = login(client, "remote@example.com", "secret123")
    me = client.get("/auth/me", headers=headers).json()
    assert me["id"] == user["id"]
    # and they can report an item at THIS branch
    r = client.post("/items", headers=headers, json={
        "type": "LOST", "category": "keys", "title": "House keys", "event_date": TODAY,
    })
    assert r.status_code == 201 and r.json()["home_branch"] == "A"


def test_user_email_conflict_keeps_local_account(client):
    register(client, "same@example.com")
    other = {
        "id": str(uuid.uuid4()), "full_name": "Other Person", "email": "same@example.com",
        "phone": None, "password_hash": hash_password("x123456"), "role": "user",
        "branch_id": None, "created_at": "2026-10-30T10:00:00+00:00",
    }
    assert apply("user.created", other) == "ignored: email conflict"
    with SessionLocal() as db:
        assert len(db.scalars(select(User).where(User.email == "same@example.com")).all()) == 1


def test_replication_status_endpoint(client):
    apply("item.created", remote_item())
    s = client.get("/replication/status").json()
    assert s["branch"] == "A"
    assert s["replication_enabled"] is False  # no RABBITMQ_URL in tests
    assert s["items_by_home_branch"] == {"B": 1}
