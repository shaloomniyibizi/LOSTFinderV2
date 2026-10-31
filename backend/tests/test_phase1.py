from datetime import date, timedelta

from conftest import login, register

TODAY = date.today().isoformat()


def found_laptop(**extra):
    data = {
        "type": "FOUND", "category": "Laptop", "colour": "Black",
        "title": "Black HP laptop", "description": "HP EliteBook with a sticker on the lid",
        "location": "Library 2nd floor", "event_date": TODAY,
    }
    data.update(extra)
    return data


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["branch"] == "A"
    assert r.json()["database"] == "ok"


def test_branches_seeded(client):
    ids = [b["id"] for b in client.get("/branches").json()]
    assert ids == ["A", "B", "C"]


def test_register_login_me(client):
    headers = register(client, "alice@example.com")
    me = client.get("/auth/me", headers=headers).json()
    assert me["email"] == "alice@example.com"
    assert me["role"] == "user"


def test_duplicate_email_rejected(client):
    register(client, "bob@example.com")
    r = client.post("/auth/register", json={
        "full_name": "Bob Again", "email": "BOB@example.com", "password": "secret123",
    })
    assert r.status_code == 409


def test_public_signup_is_always_user(client):
    """Sending role=staff or admin in the sign-up form is ignored: everyone signs up as 'user'."""
    r = client.post("/auth/register", json={
        "full_name": "Sneaky", "email": "s@example.com", "password": "secret123", "role": "admin",
    })
    assert r.status_code == 201
    assert r.json()["role"] == "user"


def test_any_user_can_report_lost_and_found(client):
    headers = register(client, "both@example.com")
    lost = client.post("/items", headers=headers, json=found_laptop(type="LOST"))
    found = client.post("/items", headers=headers, json=found_laptop(type="FOUND"))
    assert lost.status_code == 201 and lost.json()["type"] == "LOST"
    assert found.status_code == 201 and found.json()["type"] == "FOUND"


def test_wrong_password(client):
    register(client, "carol@example.com")
    r = client.post("/auth/login", data={"username": "carol@example.com", "password": "nope"})
    assert r.status_code == 401


def test_admin_creates_staff(client, admin_headers):
    r = client.post("/users", headers=admin_headers, json={
        "full_name": "Staff One", "email": "staff@example.com", "password": "secret123",
        "role": "staff", "branch_id": "A",
    })
    assert r.status_code == 201
    assert r.json()["branch_id"] == "A"
    # staff without a branch is refused
    r = client.post("/users", headers=admin_headers, json={
        "full_name": "Staff Two", "email": "staff2@example.com", "password": "secret123", "role": "staff",
    })
    assert r.status_code == 422


def test_non_admin_cannot_create_users(client):
    headers = register(client, "dave@example.com")
    r = client.post("/users", headers=headers, json={
        "full_name": "X", "email": "x@example.com", "password": "secret123", "role": "admin",
    })
    assert r.status_code == 403


def test_report_requires_login(client):
    assert client.post("/items", json=found_laptop()).status_code == 401


def test_report_item_sets_home_branch_and_version(client):
    headers = register(client, "finder@example.com")
    r = client.post("/items", headers=headers, json=found_laptop())
    assert r.status_code == 201, r.text
    item = r.json()
    assert item["home_branch"] == "A"
    assert item["version"] == 1
    assert item["status"] == "OPEN"
    assert item["category"] == "laptop" and item["colour"] == "black"  # normalised


def test_future_date_rejected(client):
    headers = register(client, "f2@example.com")
    in_two_days = (date.today() + timedelta(days=2)).isoformat()
    assert client.post("/items", headers=headers, json=found_laptop(event_date=in_two_days)).status_code == 422


def test_users_ahead_of_server_time_can_report_today(client):
    """Just after midnight in Kigali (UTC+2) it is still yesterday on a UTC server."""
    headers = register(client, "f2b@example.com")
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    assert client.post("/items", headers=headers, json=found_laptop(event_date=tomorrow)).status_code == 201


def test_search_filters(client):
    headers = register(client, "f3@example.com")
    client.post("/items", headers=headers, json=found_laptop())
    client.post("/items", headers=headers, json=found_laptop(
        type="LOST", category="phone", colour="blue", title="Blue Samsung phone",
        description="cracked screen", location="Nyabugogo bus park",
    ))
    assert client.get("/items").json()["total"] == 2
    assert client.get("/items", params={"type": "FOUND"}).json()["total"] == 1
    assert client.get("/items", params={"colour": "BLUE"}).json()["total"] == 1
    assert client.get("/items", params={"q": "sticker lid"}).json()["total"] == 1
    assert client.get("/items", params={"q": "nyabugogo"}).json()["items"][0]["category"] == "phone"
    assert client.get("/items", params={"branch": "b"}).json()["total"] == 0


def test_get_item_404(client):
    r = client.get("/items/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404


def test_update_increments_version_and_permissions(client, admin_headers):
    finder = register(client, "f4@example.com")
    item = client.post("/items", headers=finder, json=found_laptop()).json()

    # reporter can edit details -> version 2
    r = client.patch(f"/items/{item['id']}", headers=finder, json={"location": "Library ground floor"})
    assert r.status_code == 200 and r.json()["version"] == 2

    # reporter cannot change status
    assert client.patch(f"/items/{item['id']}", headers=finder, json={"status": "RETURNED"}).status_code == 403

    # another user cannot edit
    other = register(client, "other@example.com")
    assert client.patch(f"/items/{item['id']}", headers=other, json={"title": "Mine"}).status_code == 403

    # staff of branch A can change status -> version 3
    client.post("/users", headers=admin_headers, json={
        "full_name": "Staff A", "email": "sa@example.com", "password": "secret123",
        "role": "staff", "branch_id": "A",
    })
    staff = login(client, "sa@example.com", "secret123")
    r = client.patch(f"/items/{item['id']}", headers=staff, json={"status": "RETURNED"})
    assert r.status_code == 200 and r.json()["version"] == 3 and r.json()["status"] == "RETURNED"


def test_only_home_branch_can_change_item(client, admin_headers):
    """Simulates a copy of Branch B's item stored here: branch A must refuse to change it."""
    from app.database import SessionLocal
    from app.models import Item, ItemType

    with SessionLocal() as db:
        copy = Item(type=ItemType.FOUND, category="bag", title="Red bag", event_date=date.today(),
                    home_branch="B", version=4)
        db.add(copy)
        db.commit()
        item_id = str(copy.id)

    r = client.patch(f"/items/{item_id}", headers=admin_headers, json={"title": "Changed"})
    assert r.status_code == 409
    assert "branch B" in r.json()["detail"]


def test_admin_delete(client, admin_headers):
    finder = register(client, "f5@example.com")
    item = client.post("/items", headers=finder, json=found_laptop()).json()
    assert client.delete(f"/items/{item['id']}", headers=finder).status_code == 403
    assert client.delete(f"/items/{item['id']}", headers=admin_headers).status_code == 204
    assert client.get(f"/items/{item['id']}").status_code == 404
