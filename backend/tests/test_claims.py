"""Phase 4: claims, staff decisions, forwarding to the home branch, activity feed, WebSocket."""
import uuid
from datetime import date

import httpx
from sqlalchemy import select

from app.database import SessionLocal
from app.models import Claim, Item, ItemType, OutboxEvent
from conftest import login, register

TODAY = date.today().isoformat()


def found_item(client, headers, **extra):
    body = {"type": "FOUND", "category": "laptop", "colour": "black", "title": "Black HP laptop",
            "event_date": TODAY, "verification_question": "What sticker is on the lid?"}
    body.update(extra)
    r = client.post("/items", headers=headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()


def make_staff(client, admin_headers, email="staff@a.rw", branch="A"):
    r = client.post("/users", headers=admin_headers, json={
        "full_name": "Grace Staff", "email": email, "password": "secret123", "role": "staff", "branch_id": branch})
    assert r.status_code == 201, r.text
    return login(client, email, "secret123")


def claim(client, headers, item_id, answer="A university sticker"):
    return client.post(f"/items/{item_id}/claims", headers=headers, json={"answer": answer})


def test_verification_question_only_for_found_items(client):
    h = register(client, "q@c.rw")
    assert found_item(client, h)["verification_question"] == "What sticker is on the lid?"
    lost = client.post("/items", headers=h, json={"type": "LOST", "category": "bag", "title": "Bag",
                                                  "event_date": TODAY, "verification_question": "secret?"}).json()
    assert lost["verification_question"] is None


def test_claim_locks_item_and_second_claim_is_refused(client):
    finder = register(client, "finder@c.rw")
    item = found_item(client, finder)
    r1 = claim(client, register(client, "owner1@c.rw"), item["id"])
    assert r1.status_code == 201, r1.text
    assert r1.json()["status"] == "PENDING"
    assert r1.json()["item_question"] == "What sticker is on the lid?"
    after = client.get(f"/items/{item['id']}").json()
    assert after["status"] == "CLAIMED" and after["version"] == 2
    r2 = claim(client, register(client, "owner2@c.rw"), item["id"])
    assert r2.status_code == 409


def test_claim_rules(client):
    finder = register(client, "f2@c.rw")
    item = found_item(client, finder)
    assert claim(client, finder, item["id"]).status_code == 403          # own item
    lost = client.post("/items", headers=finder, json={"type": "LOST", "category": "bag", "title": "Bag",
                                                      "event_date": TODAY}).json()
    other = register(client, "o3@c.rw")
    assert claim(client, other, lost["id"]).status_code == 422            # LOST items can't be claimed
    assert claim(client, other, item["id"], answer="x").status_code == 422  # answer too short
    assert client.post(f"/items/{item['id']}/claims", json={"answer": "hello there"}).status_code == 401


def test_staff_approve_then_handover(client, admin_headers):
    item = found_item(client, register(client, "f4@c.rw"))
    claimant = register(client, "owner4@c.rw")
    c = claim(client, claimant, item["id"]).json()
    staff = make_staff(client, admin_headers)

    # a normal user can't decide
    assert client.post(f"/claims/{c['id']}/approve", headers=claimant).status_code == 403
    # staff of ANOTHER branch can't decide either
    other_staff = make_staff(client, admin_headers, "staffb@c.rw", "B")
    assert client.post(f"/claims/{c['id']}/approve", headers=other_staff).status_code == 403

    # handover before approval is refused
    assert client.post(f"/claims/{c['id']}/handover", headers=staff).status_code == 409
    r = client.post(f"/claims/{c['id']}/approve", headers=staff, json={"note": "Sticker matches"})
    assert r.status_code == 200 and r.json()["status"] == "APPROVED"
    assert r.json()["claimant_email"] == "owner4@c.rw"  # staff see contact details
    assert client.post(f"/claims/{c['id']}/approve", headers=staff).status_code == 409  # only once
    r = client.post(f"/claims/{c['id']}/handover", headers=staff)
    assert r.status_code == 200 and r.json()["handed_over_at"]
    assert client.get(f"/items/{item['id']}").json()["status"] == "RETURNED"
    assert claim(client, register(client, "late@c.rw"), item["id"]).status_code == 409


def test_reject_makes_item_claimable_again(client, admin_headers):
    item = found_item(client, register(client, "f5@c.rw"))
    c = claim(client, register(client, "wrong@c.rw"), item["id"]).json()
    staff = make_staff(client, admin_headers, "s5@c.rw")
    r = client.post(f"/claims/{c['id']}/reject", headers=staff, json={"note": "Wrong sticker"})
    assert r.status_code == 200 and r.json()["status"] == "REJECTED" and r.json()["staff_note"] == "Wrong sticker"
    assert client.get(f"/items/{item['id']}").json()["status"] in ("OPEN", "MATCHED")
    assert claim(client, register(client, "right@c.rw"), item["id"]).status_code == 201


def test_lists_for_claimant_staff_and_finder(client, admin_headers):
    finder = register(client, "f6@c.rw")
    item = found_item(client, finder)
    claimant = register(client, "o6@c.rw")
    claim(client, claimant, item["id"])
    mine = client.get("/claims/mine", headers=claimant).json()
    assert len(mine) == 1 and mine[0]["item_title"] == "Black HP laptop" and mine[0]["claimant_email"] is None
    staff = make_staff(client, admin_headers, "s6@c.rw")
    assert len(client.get("/claims?status=PENDING", headers=staff).json()) == 1
    assert client.get("/claims", headers=claimant).status_code == 403
    assert len(client.get(f"/items/{item['id']}/claims", headers=finder).json()) == 1
    assert client.get(f"/items/{item['id']}/claims", headers=claimant).status_code == 403


def test_claim_events_are_replicated(client):
    item = found_item(client, register(client, "f7@c.rw"))
    c = claim(client, register(client, "o7@c.rw"), item["id"]).json()
    with SessionLocal() as db:
        types = [e.event_type for e in db.scalars(select(OutboxEvent).order_by(OutboxEvent.id))]
    assert types[-2:] == ["item.updated", "claim.created"]


def test_claim_on_other_branch_item_is_forwarded(client, monkeypatch):
    """Branch A holds a COPY of branch B's item: the claim must be sent to B, not decided here."""
    from app.replication import apply_event

    item_id = str(uuid.uuid4())
    with SessionLocal() as db:
        apply_event(db, "item.created", {"origin": "B", "data": {
            "id": item_id, "type": "FOUND", "category": "phone", "colour": None, "title": "Phone",
            "description": "", "location": "", "event_date": TODAY, "photo_hash": None,
            "verification_question": None, "status": "OPEN", "home_branch": "B", "version": 1,
            "reported_by": None, "created_at": "2026-10-30T10:00:00+00:00", "updated_at": None}})
        db.commit()

    calls = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        calls.update(url=url, json=json, headers=headers)
        return httpx.Response(201, json={"forwarded": True})

    monkeypatch.setattr("app.routers.claims.httpx.post", fake_post)
    h = register(client, "fw@c.rw")
    r = claim(client, h, item_id, answer="It has my photo as wallpaper")
    assert r.status_code == 201 and r.json() == {"forwarded": True}
    assert calls["url"] == f"http://localhost:8002/items/{item_id}/claims"
    assert calls["headers"]["Authorization"].startswith("Bearer ")
    with SessionLocal() as db:  # nothing was decided locally
        assert db.scalars(select(Claim)).first() is None

    def offline(*a, **k):
        raise httpx.ConnectError("down")

    monkeypatch.setattr("app.routers.claims.httpx.post", offline)
    r = claim(client, h, item_id, answer="It has my photo as wallpaper")
    assert r.status_code == 503 and "Bus Park" in r.json()["detail"]


def test_activity_feed(client, admin_headers):
    owner = register(client, "act-owner@c.rw")
    finder = register(client, "act-finder@c.rw")
    client.post("/items", headers=owner, json={"type": "LOST", "category": "laptop", "colour": "black",
                                               "title": "Black HP laptop", "event_date": TODAY})
    item = found_item(client, finder)
    claim(client, owner, item["id"])
    feed = client.get("/me/activity", headers=owner).json()
    kinds = [a["kind"] for a in feed]
    assert "match" in kinds and "claim" in kinds
    assert any(a["kind"] == "claim_on_my_item" for a in client.get("/me/activity", headers=finder).json())


def test_websocket_receives_match_notification(client):
    owner_headers = register(client, "ws-owner@c.rw")
    token = owner_headers["Authorization"].split()[1]
    client.post("/items", headers=owner_headers, json={"type": "LOST", "category": "keys", "colour": "silver",
                                                       "title": "House keys red keyring", "event_date": TODAY})
    with client.websocket_connect(f"/ws?token={token}") as ws:
        assert ws.receive_json()["type"] == "hello"
        finder = register(client, "ws-finder@c.rw")
        client.post("/items", headers=finder, json={"type": "FOUND", "category": "keys", "colour": "silver",
                                                    "title": "Keys with red keyring", "event_date": TODAY})
        msg = ws.receive_json()
        assert msg["type"] == "match"
        assert "Keys with red keyring" in msg["message"]


def test_websocket_rejects_bad_token(client):
    import pytest
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws?token=nonsense") as ws:
            ws.receive_json()
