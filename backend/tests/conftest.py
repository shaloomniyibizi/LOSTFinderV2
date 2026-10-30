"""Tests run against a temporary SQLite file, so you don't need PostgreSQL to run them."""
import os
import tempfile

_db_file = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_db_file}"
os.environ["PHOTO_DIR"] = os.path.join(os.path.dirname(_db_file), "photos")
os.environ["BRANCH_ID"] = "A"
os.environ["BRANCH_NAME"] = "Campus"
os.environ["ADMIN_EMAIL"] = "admin@test.local"
os.environ["ADMIN_PASSWORD"] = "admin123"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app, init_db  # noqa: E402


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    init_db()
    with TestClient(app) as c:
        yield c


def login(client, email, password):
    r = client.post("/auth/login", data={"username": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def register(client, email, password="secret123"):
    r = client.post("/auth/register", json={
        "full_name": "Test User", "email": email, "password": password,
    })
    assert r.status_code == 201, r.text
    return login(client, email, password)


@pytest.fixture()
def admin_headers(client):
    return login(client, "admin@test.local", "admin123")
