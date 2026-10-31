"""Phase 6: user management (admin), profile editing, and replication of account changes."""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, inspect, select, text

from app import database
from app.database import SessionLocal
from app.models import OutboxEvent, User
from app.replication import apply_event, user_payload
from conftest import login, register


def user_id(client, admin_headers, email):
    return next(u["id"] for u in client.get("/users", headers=admin_headers).json() if u["email"] == email)


def test_only_admins_manage_users(client, admin_headers):
    member = register(client, "m@u.rw")
    assert client.get("/users", headers=member).status_code == 403
    assert client.get("/users").status_code == 401
    uid = user_id(client, admin_headers, "m@u.rw")
    assert client.patch(f"/users/{uid}", headers=member, json={"is_active": False}).status_code == 403


def test_list_with_counts_and_filters(client, admin_headers):
    h = register(client, "reporter@u.rw")
    client.post("/items", headers=h, json={"type": "LOST", "category": "phone", "title": "Phone", "event_date": "2026-01-01"})
    users = client.get("/users", headers=admin_headers).json()
    me = next(u for u in users if u["email"] == "reporter@u.rw")
    assert me["reports"] == 1 and me["claims"] == 0 and me["is_active"] is True and me["version"] == 1
    assert [u["email"] for u in client.get("/users", headers=admin_headers, params={"q": "reporter"}).json()] == ["reporter@u.rw"]
    assert all(u["role"] == "admin" for u in client.get("/users", headers=admin_headers, params={"role": "admin"}).json())


def test_disable_signs_out_and_blocks_login(client, admin_headers):
    member = register(client, "bye@u.rw")
    uid = user_id(client, admin_headers, "bye@u.rw")
    r = client.patch(f"/users/{uid}", headers=admin_headers, json={"is_active": False})
    assert r.status_code == 200 and r.json()["is_active"] is False and r.json()["version"] == 2
    assert client.get("/auth/me", headers=member).status_code == 401          # open session stops working
    r = client.post("/auth/login", data={"username": "bye@u.rw", "password": "secret123"})
    assert r.status_code == 403 and "disabled" in r.json()["detail"]
    client.patch(f"/users/{uid}", headers=admin_headers, json={"is_active": True})
    login(client, "bye@u.rw", "secret123")                                    # enabled again


def test_role_and_branch_rules(client, admin_headers):
    register(client, "s@u.rw")
    uid = user_id(client, admin_headers, "s@u.rw")
    assert client.patch(f"/users/{uid}", headers=admin_headers, json={"role": "staff"}).status_code == 422
    r = client.patch(f"/users/{uid}", headers=admin_headers, json={"role": "staff", "branch_id": "B"})
    assert r.json()["role"] == "staff" and r.json()["branch_id"] == "B"
    r = client.patch(f"/users/{uid}", headers=admin_headers, json={"role": "user"})
    assert r.json()["branch_id"] is None                                      # only staff have a branch


def test_admin_cannot_lock_themselves_out(client, admin_headers):
    me = user_id(client, admin_headers, "admin@test.local")
    assert client.patch(f"/users/{me}", headers=admin_headers, json={"is_active": False}).status_code == 409
    assert client.patch(f"/users/{me}", headers=admin_headers, json={"role": "user"}).status_code == 409
    # With a second admin, the first one can be demoted by the second
    register(client, "boss2@u.rw")
    other = user_id(client, admin_headers, "boss2@u.rw")
    client.patch(f"/users/{other}", headers=admin_headers, json={"role": "admin"})
    boss2 = login(client, "boss2@u.rw", "secret123")
    assert client.patch(f"/users/{me}", headers=boss2, json={"role": "user"}).status_code == 200


def test_reset_password(client, admin_headers):
    register(client, "forgot@u.rw")
    uid = user_id(client, admin_headers, "forgot@u.rw")
    assert client.post(f"/users/{uid}/password", headers=admin_headers, json={"password": "new-pass-1"}).status_code == 204
    assert client.post("/auth/login", data={"username": "forgot@u.rw", "password": "secret123"}).status_code == 401
    login(client, "forgot@u.rw", "new-pass-1")


def test_profile_and_own_password(client):
    h = register(client, "self@u.rw")
    r = client.patch("/auth/me", headers=h, json={"full_name": "New Name", "phone": "+250 788 1"})
    assert r.json()["full_name"] == "New Name" and r.json()["phone"] == "+250 788 1"
    assert client.post("/auth/me/password", headers=h, json={"current_password": "wrong", "new_password": "abcdef"}).status_code == 400
    assert client.post("/auth/me/password", headers=h, json={"current_password": "secret123", "new_password": "abcdef"}).status_code == 204
    login(client, "self@u.rw", "abcdef")


def test_every_change_is_sent_to_other_branches(client, admin_headers):
    register(client, "ev@u.rw")
    uid = user_id(client, admin_headers, "ev@u.rw")
    client.patch(f"/users/{uid}", headers=admin_headers, json={"full_name": "Renamed"})
    with SessionLocal() as db:
        ev = db.scalars(select(OutboxEvent).where(OutboxEvent.event_type == "user.updated")).all()
    assert ev and ev[-1].payload["data"]["full_name"] == "Renamed" and ev[-1].payload["data"]["version"] == 2


def test_replicated_user_changes_higher_version_wins(client):
    register(client, "rep@u.rw")
    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.email == "rep@u.rw"))
        newer = user_payload(u) | {"full_name": "From branch B", "version": 3,
                                   "updated_at": datetime.now(timezone.utc).isoformat(), "is_active": False}
        assert apply_event(db, "user.updated", {"origin": "B", "data": newer}) == "updated"
        older = newer | {"full_name": "Stale", "version": 2}
        assert apply_event(db, "user.updated", {"origin": "C", "data": older}) == "ignored: not newer"
        # Same version, changed later elsewhere: the later change wins
        later = newer | {"full_name": "Later edit", "updated_at": (datetime.now(timezone.utc) + timedelta(seconds=5)).isoformat()}
        assert apply_event(db, "user.updated", {"origin": "C", "data": later}) == "updated"
        db.commit()
        u = db.scalar(select(User).where(User.email == "rep@u.rw"))
        assert (u.full_name, u.is_active, u.version) == ("Later edit", False, 3)
        # A brand-new account arriving as user.updated (e.g. during resync) is inserted
        fresh = newer | {"id": str(uuid.uuid4()), "email": "new@elsewhere.rw"}
        assert apply_event(db, "user.updated", {"origin": "B", "data": fresh}) == "inserted"


def test_old_database_is_upgraded_in_place(tmp_path, monkeypatch):
    """A database made by Phase 5 has no is_active/version/updated_at columns: they are added, data kept."""
    eng = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with eng.begin() as c:
        c.execute(text("CREATE TABLE users (id CHAR(32) PRIMARY KEY, full_name VARCHAR, email VARCHAR, phone VARCHAR, "
                       "password_hash VARCHAR, role VARCHAR, branch_id VARCHAR, created_at TIMESTAMP)"))
        c.execute(text("INSERT INTO users VALUES ('a', 'Old', 'old@x.rw', NULL, 'h', 'user', NULL, '2026-01-01')"))
    monkeypatch.setattr(database, "engine", eng)
    assert sorted(database.upgrade_schema()) == ["users.is_active", "users.updated_at", "users.version"]
    assert {c["name"] for c in inspect(eng).get_columns("users")} >= {"is_active", "version", "updated_at"}
    with eng.connect() as c:
        assert c.execute(text("SELECT full_name, is_active, version FROM users")).one() == ("Old", 1, 1)
    assert database.upgrade_schema() == []  # running it again changes nothing
