"""Cloudinary storage, tested WITHOUT internet: the HTTP calls are intercepted."""
import httpx
import pytest

from app import storage
from app.storage import CloudinaryStore, StorageError


def test_signature_matches_cloudinary_documentation_example():
    # Example from Cloudinary's "Generating authentication signatures" documentation
    params = {"eager": "w_400,h_300,c_pad|w_260,h_200,c_crop", "public_id": "sample_image", "timestamp": "1315060510"}
    assert CloudinaryStore.sign(params, "abcd") == "bfd09f95f331f558cbd1320e67aa8d488770583e"


def test_parses_cloudinary_url():
    s = CloudinaryStore("cloudinary://123456:my%2Fsecret@demo-cloud")
    assert (s.api_key, s.api_secret, s.cloud) == ("123456", "my/secret", "demo-cloud")
    assert s.url("ab" * 32) == f"https://res.cloudinary.com/demo-cloud/image/upload/lostfinder/{'ab' * 32}"


@pytest.mark.parametrize("bad", ["", "https://x", "cloudinary://only-key@cloud", "cloudinary://k:s@"])
def test_rejects_bad_url(bad):
    with pytest.raises(ValueError):
        CloudinaryStore(bad)


def _store_with(handler):
    s = CloudinaryStore("cloudinary://key123:secret456@demo-cloud")
    s.client = httpx.Client(transport=httpx.MockTransport(handler))
    return s


def test_upload_sends_signed_request():
    seen = {}

    def handler(request: httpx.Request):
        seen["url"] = str(request.url)
        seen["body"] = request.content
        return httpx.Response(200, json={"public_id": "lostfinder/x"})

    s = _store_with(handler)
    h = "c" * 64
    s.save(h, b"\xff\xd8\xffdata", "image/jpeg")
    assert seen["url"] == "https://api.cloudinary.com/v1_1/demo-cloud/image/upload"
    body = seen["body"].decode(errors="ignore")
    for expected in ('name="api_key"', "key123", f"lostfinder/{h}", 'name="overwrite"', 'name="signature"'):
        assert expected in body
    assert "secret456" not in body  # the secret itself is never sent


def test_upload_error_is_reported():
    s = _store_with(lambda r: httpx.Response(401, json={"error": {"message": "Invalid Signature"}}))
    with pytest.raises(StorageError, match="Invalid Signature"):
        s.save("d" * 64, b"x", "image/png")


def test_no_internet_is_reported():
    def handler(request):
        raise httpx.ConnectError("no network")

    with pytest.raises(StorageError, match="unreachable"):
        _store_with(handler).save("e" * 64, b"x", "image/png")


def test_photo_endpoint_redirects_to_cloudinary(client, monkeypatch):
    monkeypatch.setattr(storage, "store", CloudinaryStore("cloudinary://k:s@demo-cloud"))
    h = "f" * 64
    r = client.get(f"/photos/{h}", follow_redirects=False)
    assert r.status_code == 307
    assert r.headers["location"] == f"https://res.cloudinary.com/demo-cloud/image/upload/lostfinder/{h}"


def test_health_reports_storage(client):
    assert client.get("/health").json()["photo_storage"] == "local folder"
