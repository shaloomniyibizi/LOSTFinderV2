"""Phase 5: heartbeat monitor, queued claims (store and forward), resync (anti-entropy)."""
import uuid
from datetime import date

import httpx
import pytest
from sqlalchemy import delete, select

from app import reliability
from app.database import SessionLocal
from app.models import Item, QueuedRequest, User
from app.replication import apply_event
from app.security import internal_token, user_from_token
from conftest import register

TODAY = date.today().isoformat()


def remote_found_item(home="B", **extra):
    data = {"id": str(uuid.uuid4()), "type": "FOUND", "category": "phone", "colour": "black", "title": "Black phone",
            "description": "", "location": "", "event_date": TODAY, "photo_hash": None,
            "verification_question": "Lock screen?", "status": "OPEN", "home_branch": home, "version": 1,
            "reported_by": None, "created_at": "2026-10-30T10:00:00+00:00", "updated_at": None}
    data.update(extra)
    with SessionLocal() as db:
        apply_event(db, "item.created", {"origin": home, "data": data})
        db.commit()
    return data


# ------------------------------------------------------------------ heartbeat monitor
def test_peer_marked_down_after_three_misses_and_up_after_one_success():
    mon = reliability.Monitor()
    came_back = []
    mon.on_peer_up = [came_back.append]
    mon.record("B", True, 5)
    assert mon.peers["B"].status == "up"
    mon.record("B", False)
    mon.record("B", False)
    assert mon.peers["B"].status == "up" and not mon.is_down("B")  # 2 misses: not yet
    mon.record("B", False)
    assert mon.is_down("B") and mon.peers["B"].misses == 3
    mon.record("B", True, 7)
    assert mon.peers["B"].status == "up" and mon.peers["B"].latency_ms == 7
    import time
    time.sleep(0.2)
    assert "B" in came_back  # a peer coming back triggers a resync with it


def test_check_once_uses_health_endpoint():
    def handler(request: httpx.Request):
        return httpx.Response(200 if request.url.port == 8002 else 500, json={})

    mon = reliability.Monitor()
    client = httpx.Client(transport=httpx.MockTransport(handler))
    for _ in range(3):
        mon.check_once(client)
    assert mon.peers["B"].status == "up"
    assert mon.peers["C"].status == "down"


def test_cluster_endpoint(client):
    view = client.get("/cluster").json()
    assert view["branch"] == "A"
    assert {p["branch"] for p in view["peers"]} == {"B", "C"}
    assert view["down_after_misses"] == 3


# ------------------------------------------------------------------ queued claims
def test_claim_is_queued_when_home_branch_unreachable(client, monkeypatch):
    item = remote_found_item()

    def offline(*a, **k):
        raise httpx.ConnectError("down")

    monkeypatch.setattr("app.routers.claims.httpx.post", offline)
    h = register(client, "q1@r.rw")
    r = client.post(f"/items/{item['id']}/claims", headers=h, json={"answer": "A photo of my cat"})
    assert r.status_code == 202, r.text
    body = r.json()
    assert body["queued"] and body["target_branch"] == "B"
    again = client.post(f"/items/{item['id']}/claims", headers=h, json={"answer": "A photo of my cat"})
    assert again.json()["id"] == body["id"]  # not queued twice
    mine = client.get("/claims/queued/mine", headers=h).json()
    assert len(mine) == 1 and mine[0]["status"] == "QUEUED" and mine[0]["item_title"] == "Black phone"
    assert client.get("/replication/status").json()["queued_claims"] == 1


def test_claim_queued_immediately_if_monitor_says_down(client, monkeypatch):
    item = remote_found_item()
    for _ in range(3):
        reliability.monitor.record("B", False)

    def must_not_be_called(*a, **k):
        raise AssertionError("should not try a branch that is known to be down")

    monkeypatch.setattr("app.routers.claims.httpx.post", must_not_be_called)
    r = client.post(f"/items/{item['id']}/claims", headers=register(client, "q2@r.rw"), json={"answer": "My cat photo"})
    assert r.status_code == 202


def _queue_one(client, monkeypatch, email):
    item = remote_found_item()
    monkeypatch.setattr("app.routers.claims.httpx.post", lambda *a, **k: (_ for _ in ()).throw(httpx.ConnectError("x")))
    h = register(client, email)
    client.post(f"/items/{item['id']}/claims", headers=h, json={"answer": "The lock screen is my dog"})
    return item, h


def test_forwarder_delivers_when_home_is_back(client, monkeypatch):
    item, h = _queue_one(client, monkeypatch, "q3@r.rw")
    seen = {}

    def home_is_back(url, json=None, headers=None, timeout=None):
        seen.update(url=url, json=json, auth=headers["Authorization"])
        return httpx.Response(201, json={"id": str(uuid.uuid4()), "status": "PENDING"})

    assert reliability.process_queue_once(post=home_is_back) == 1
    assert seen["url"] == f"http://localhost:8002/items/{item['id']}/claims"
    assert seen["json"] == {"answer": "The lock screen is my dog"}
    with SessionLocal() as db:  # the token sent on the user's behalf identifies that user
        user = user_from_token(db, seen["auth"].split()[1])
        assert user.email == "q3@r.rw"
        q = db.scalars(select(QueuedRequest)).one()
        assert q.status == "DELIVERED" and q.delivered_at and q.attempts == 1
    assert reliability.process_queue_once(post=home_is_back) == 0  # nothing left


def test_forwarder_keeps_trying_while_unreachable_and_skips_down_branch(client, monkeypatch):
    _queue_one(client, monkeypatch, "q4@r.rw")
    reliability.process_queue_once(post=lambda *a, **k: (_ for _ in ()).throw(httpx.ConnectError("x")))
    with SessionLocal() as db:
        q = db.scalars(select(QueuedRequest)).one()
        assert q.status == "QUEUED" and q.attempts == 1 and "unreachable" in q.last_error
    for _ in range(3):
        reliability.monitor.record("B", False)
    reliability.process_queue_once(post=lambda *a, **k: pytest.fail("must not call a down branch"))


def test_forwarder_reports_refusal(client, monkeypatch):
    _queue_one(client, monkeypatch, "q5@r.rw")
    refused = lambda *a, **k: httpx.Response(409, json={"detail": "Someone has already claimed this item."})  # noqa: E731
    assert reliability.process_queue_once(post=refused) == 1
    with SessionLocal() as db:
        q = db.scalars(select(QueuedRequest)).one()
        assert q.status == "FAILED" and "already claimed" in q.last_error


# ------------------------------------------------------------------ resync (anti-entropy)
def test_snapshot_only_for_branches(client):
    assert client.get("/replication/snapshot").status_code == 401
    user_headers = register(client, "s1@r.rw")
    assert client.get("/replication/snapshot", headers=user_headers).status_code == 403
    r = client.get("/replication/snapshot", headers={"Authorization": f"Bearer {internal_token()}"})
    assert r.status_code == 200
    assert {"users", "items", "claims", "branch"} <= set(r.json())


def test_internal_token_is_not_a_user_login(client):
    r = client.get("/auth/me", headers={"Authorization": f"Bearer {internal_token()}"})
    assert r.status_code == 401


def test_resync_inserts_missing_and_keeps_newest(client):
    mine = remote_found_item()  # we already hold version 1
    peer_snapshot = {"branch": "B", "users": [], "claims": [], "items": [
        {**mine, "version": 3, "title": "Black phone (updated)"},       # newer: must replace ours
        {**mine, "id": str(uuid.uuid4()), "title": "Missed item"},     # missing here: must be added
    ]}
    counts = reliability.apply_snapshot(peer_snapshot)
    assert counts["items"] == 2
    with SessionLocal() as db:
        assert db.get(Item, uuid.UUID(mine["id"])).title == "Black phone (updated)"
    older = {"branch": "B", "users": [], "claims": [], "items": [{**mine, "version": 2, "title": "old"}]}
    assert reliability.apply_snapshot(older)["items"] == 0  # an older copy never wins


def test_wiped_branch_gets_its_own_items_back_from_peers(client):
    """Branch A loses its database. Branch B still holds copies of A's items: resync brings them home."""
    h = register(client, "w1@r.rw")
    item = client.post("/items", headers=h, json={"type": "LOST", "category": "bag", "title": "Red bag",
                                                  "event_date": TODAY}).json()
    peer_view = reliability.snapshot()          # what branch B would hold (copies of everything)
    peer_view["branch"] = "B"
    with SessionLocal() as db:                  # disaster: A's data is gone
        db.execute(delete(Item))
        db.execute(delete(User).where(User.email == "w1@r.rw"))
        db.commit()
    assert client.get(f"/items/{item['id']}").status_code == 404
    counts = reliability.apply_snapshot(peer_view)
    assert counts["items"] >= 1 and counts["users"] >= 1
    restored = client.get(f"/items/{item['id']}").json()
    assert restored["title"] == "Red bag" and restored["home_branch"] == "A"
    assert client.post("/auth/login", data={"username": "w1@r.rw", "password": "secret123"}).status_code == 200


def test_sync_from_peer_uses_internal_token(client):
    seen = {}

    def fake_get(url, headers=None, timeout=None):
        seen.update(url=url, auth=headers["Authorization"])
        return httpx.Response(200, json={"branch": "C", "users": [], "items": [], "claims": []},
                              request=httpx.Request("GET", url))

    assert reliability.sync_from_peer("C", get=fake_get) == {"users": 0, "items": 0, "claims": 0}
    assert seen["url"] == "http://localhost:8003/replication/snapshot"
    assert reliability.status.last_resync["C"]["items"] == 0
    assert reliability.sync_from_peer("A") is None  # never from itself


def test_manual_resync_is_admin_only(client, admin_headers, monkeypatch):
    monkeypatch.setattr(reliability, "sync_from_all", lambda: {"B": None, "C": None})
    assert client.post("/replication/resync", headers=register(client, "nr@r.rw")).status_code == 403
    assert client.post("/replication/resync", headers=admin_headers).json() == {"repaired": {"B": None, "C": None}}


def test_admin_id_is_the_same_on_every_branch(client):
    """Every branch seeds the admin with the same id, so the consistency check sees one admin, not three."""
    import uuid
    from app.config import settings
    from app.database import SessionLocal
    from app.models import User
    with SessionLocal() as db:
        admin = db.query(User).filter(User.email == settings.admin_email).one()
    assert admin.id == uuid.uuid5(uuid.NAMESPACE_URL, f"lostfinder-admin:{settings.admin_email}")
