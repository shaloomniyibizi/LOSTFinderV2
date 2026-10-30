"""Phase 3: photo upload, deduplication, serving, and 'my items'."""
import os
from datetime import date

from app.config import settings
from conftest import register

TODAY = date.today().isoformat()
JPEG = b"\xff\xd8\xff\xe0" + b"fake-jpeg-body" * 10
PNG = b"\x89PNG\r\n\x1a\n" + b"fake-png-body" * 10


def new_item(client, headers, **extra):
    data = {"type": "FOUND", "category": "bag", "title": "Black backpack", "event_date": TODAY}
    data.update(extra)
    r = client.post("/items", headers=headers, json=data)
    assert r.status_code == 201, r.text
    return r.json()


def upload(client, headers, item_id, data, name="photo.jpg", ctype="image/jpeg"):
    return client.post(f"/items/{item_id}/photo", headers=headers, files={"file": (name, data, ctype)})


def stored_files():
    return os.listdir(settings.photo_dir) if os.path.isdir(settings.photo_dir) else []


def test_upload_sets_hash_and_bumps_version(client):
    h = register(client, "p1@example.com")
    item = new_item(client, h)
    r = upload(client, h, item["id"], JPEG)
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["photo_hash"]) == 64
    assert body["version"] == 2


def test_photo_is_served_with_type_and_cache_header(client):
    h = register(client, "p2@example.com")
    item = new_item(client, h)
    photo_hash = upload(client, h, item["id"], PNG, "x.png", "image/png").json()["photo_hash"]
    r = client.get(f"/photos/{photo_hash}")
    assert r.status_code == 200
    assert r.content == PNG
    assert r.headers["content-type"] == "image/png"
    assert "immutable" in r.headers["cache-control"]


def test_same_photo_is_stored_once(client):
    h = register(client, "p3@example.com")
    a = new_item(client, h)
    b = new_item(client, h, title="Second backpack")
    before = len(stored_files())
    ha = upload(client, h, a["id"], JPEG + b"unique-3").json()["photo_hash"]
    hb = upload(client, h, b["id"], JPEG + b"unique-3").json()["photo_hash"]
    assert ha == hb
    assert len(stored_files()) == before + 1  # deduplicated


def test_reupload_same_photo_does_not_change_version(client):
    h = register(client, "p4@example.com")
    item = new_item(client, h)
    upload(client, h, item["id"], JPEG + b"v")
    again = upload(client, h, item["id"], JPEG + b"v").json()
    assert again["version"] == 2


def test_rejects_non_images_even_if_named_jpg(client):
    h = register(client, "p5@example.com")
    item = new_item(client, h)
    r = upload(client, h, item["id"], b"MZ this is an exe", "evil.jpg", "image/jpeg")
    assert r.status_code == 415


def test_rejects_large_photos(client):
    h = register(client, "p6@example.com")
    item = new_item(client, h)
    r = upload(client, h, item["id"], JPEG + b"0" * (5 * 1024 * 1024))
    assert r.status_code == 413


def test_only_reporter_can_upload(client):
    owner = register(client, "p7@example.com")
    other = register(client, "p8@example.com")
    item = new_item(client, owner)
    assert upload(client, other, item["id"], JPEG).status_code == 403
    assert client.post(f"/items/{item['id']}/photo", files={"file": ("a.jpg", JPEG, "image/jpeg")}).status_code == 401


def test_unknown_or_bad_photo_hash(client):
    assert client.get("/photos/" + "0" * 64).status_code == 404
    assert client.get("/photos/../../etc/passwd").status_code == 404
    assert client.get("/photos/not-a-hash").status_code == 404


def test_photo_upload_creates_update_event(client):
    from sqlalchemy import select

    from app.database import SessionLocal
    from app.models import OutboxEvent

    h = register(client, "p9@example.com")
    item = new_item(client, h)
    upload(client, h, item["id"], JPEG + b"evt")
    with SessionLocal() as db:
        last = db.scalars(select(OutboxEvent).order_by(OutboxEvent.id.desc())).first()
    assert last.event_type == "item.updated"
    assert last.payload["data"]["photo_hash"] is not None


def test_my_items(client):
    me = register(client, "mine@example.com")
    other = register(client, "notmine@example.com")
    new_item(client, me, type="LOST", title="My lost keys")
    new_item(client, me, type="FOUND", title="A found wallet")
    new_item(client, other, title="Someone else's report")
    r = client.get("/items/mine", headers=me).json()
    assert r["total"] == 2
    assert {i["title"] for i in r["items"]} == {"My lost keys", "A found wallet"}
    assert client.get("/items/mine").status_code == 401
