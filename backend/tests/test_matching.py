"""Phase 4: matching lost and found items."""
from datetime import date, timedelta

from sqlalchemy import select

from app.database import SessionLocal
from app.matching import match_id, score
from app.models import Item, ItemStatus, ItemType, Match
from app.replication import after_remote_change, apply_event
from conftest import register

TODAY = date.today()


def mk(type_, category="phone", colour="blue", title="Samsung phone", description="", days_ago=0):
    return Item(type=ItemType(type_), category=category, colour=colour, title=title,
                description=description, event_date=TODAY - timedelta(days=days_ago), home_branch="A")


# ---------- scoring rules ----------
def test_same_category_colour_and_date_scores_high():
    # category 40 + colour 20 + two shared words ("samsung", "phone") 20 + found 1 day later 20
    assert score(mk("LOST", days_ago=1), mk("FOUND")) == 100


def test_different_category_never_matches():
    assert score(mk("LOST", category="phone"), mk("FOUND", category="wallet")) == 0


def test_found_long_before_lost_is_impossible():
    assert score(mk("LOST", days_ago=0), mk("FOUND", days_ago=5)) == 0


def test_colour_mismatch_and_old_date_scores_low():
    s = score(mk("LOST", colour="red", title="phone", days_ago=30), mk("FOUND", colour="black", title="mobile"))
    assert s == 40  # category only: below the 60 threshold


def test_keywords_count_up_to_20():
    lost = mk("LOST", colour=None, title="Black HP EliteBook laptop sticker", category="laptop", days_ago=2)
    found = mk("FOUND", colour=None, title="HP EliteBook with sticker", category="laptop")
    assert score(lost, found) == 40 + 10 + 20 + 20


# ---------- matches are created when items are reported ----------
def report(client, headers, **data):
    body = {"type": "LOST", "category": "phone", "colour": "blue", "title": "Blue Samsung phone",
            "event_date": TODAY.isoformat()}
    body.update(data)
    r = client.post("/items", headers=headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_reporting_creates_match_and_marks_both_items(client):
    owner = register(client, "owner@m.rw")
    finder = register(client, "finder@m.rw")
    lost = report(client, owner, type="LOST", title="Blue Samsung phone", description="cracked screen")
    found = report(client, finder, type="FOUND", title="Samsung phone, blue", description="screen is cracked")
    assert found["status"] == "MATCHED"
    assert client.get(f"/items/{lost['id']}").json()["status"] == "MATCHED"
    lost_matches = client.get(f"/items/{lost['id']}/matches").json()
    assert len(lost_matches) == 1 and lost_matches[0]["item"]["id"] == found["id"]
    assert lost_matches[0]["score"] >= 60
    found_matches = client.get(f"/items/{found['id']}/matches").json()
    assert found_matches[0]["item"]["id"] == lost["id"]


def test_no_match_for_different_category(client):
    a = register(client, "a@m.rw")
    b = register(client, "b@m.rw")
    report(client, a, type="LOST", category="phone")
    found = report(client, b, type="FOUND", category="wallet", title="Brown wallet")
    assert found["status"] == "OPEN"


def test_same_person_reporting_both_is_not_matched(client):
    a = register(client, "same@m.rw")
    report(client, a, type="LOST")
    assert report(client, a, type="FOUND")["status"] == "OPEN"


def test_match_ids_are_the_same_on_every_branch():
    import uuid
    l, f = uuid.uuid4(), uuid.uuid4()
    assert match_id(l, f) == match_id(l, f)
    assert match_id(l, f) != match_id(f, l)


def test_item_from_another_branch_triggers_matching_but_not_its_status(client):
    """A FOUND item from branch B arrives here (A). Branch A saves the match and marks ITS OWN lost
    item MATCHED, but must not change B's item: only B may do that."""
    owner = register(client, "o2@m.rw")
    lost = report(client, owner, type="LOST", title="Blue Samsung phone")
    remote = {
        "id": "8b0d5c1e-0000-4000-8000-000000000001", "type": "FOUND", "category": "phone", "colour": "blue",
        "title": "Samsung phone", "description": "", "location": "Bus park", "event_date": TODAY.isoformat(),
        "photo_hash": None, "verification_question": None, "status": "OPEN", "home_branch": "B", "version": 1,
        "reported_by": None, "created_at": "2026-10-30T10:00:00+00:00", "updated_at": "2026-10-30T10:00:00+00:00",
    }
    with SessionLocal() as db:
        assert apply_event(db, "item.created", {"origin": "B", "data": remote}) == "inserted"
        db.commit()
        after_remote_change(db, "item.created", remote)
    with SessionLocal() as db:
        matches = db.scalars(select(Match)).all()
        assert len(matches) == 1
        import uuid
        assert db.get(Item, uuid.UUID(lost["id"])).status == ItemStatus.MATCHED
        assert db.get(Item, uuid.UUID(remote["id"])).status == ItemStatus.OPEN  # B's item untouched here
    # running matching again creates nothing new (deterministic ids)
    with SessionLocal() as db:
        after_remote_change(db, "item.updated", remote)
        assert len(db.scalars(select(Match)).all()) == 1
