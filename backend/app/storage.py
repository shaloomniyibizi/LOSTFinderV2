"""Photo storage.

Photos are kept OUTSIDE the databases (like GFS chunkservers / Dropbox blockservers):
the item record only stores the photo's SHA-256 hash, and the photo bytes live in SeaweedFS
under that hash. Because the name IS the content's hash:
  - the same photo uploaded twice is stored only once (deduplication), and
  - every branch can serve every photo from the shared store.

Three interchangeable places to keep photos (the rest of the code doesn't notice the difference):
  - a local folder (default; in Docker it is one folder shared by all three branches)
  - Cloudinary, a free cloud service (set CLOUDINARY_URL)
  - SeaweedFS, a self-hosted distributed file store (set SEAWEEDFS_FILER_URL)
"""
import hashlib
import time
from pathlib import Path
from urllib.parse import unquote, urlparse

import httpx

from .config import settings

ALLOWED_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_PHOTO_BYTES = 5 * 1024 * 1024  # 5 MB


class StorageError(Exception):
    pass


def photo_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def detect_type(data: bytes) -> str | None:
    """Trust the file's first bytes, not its name or the browser's claim."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


class SeaweedStore:
    name = "seaweedfs"

    def __init__(self, filer_url: str):
        self.base = filer_url.rstrip("/") + "/lostfound/photos/"
        self.client = httpx.Client(timeout=15)

    def exists(self, h: str) -> bool:
        try:
            return self.client.head(self.base + h).status_code == 200
        except httpx.HTTPError as exc:
            raise StorageError(f"photo store unreachable: {exc}") from exc

    def save(self, h: str, data: bytes, content_type: str) -> None:
        try:
            r = self.client.put(self.base + h, content=data, headers={"Content-Type": content_type})
        except httpx.HTTPError as exc:
            raise StorageError(f"photo store unreachable: {exc}") from exc
        if r.status_code not in (200, 201):
            raise StorageError(f"photo store refused upload: HTTP {r.status_code}")

    def load(self, h: str) -> tuple[bytes, str] | None:
        try:
            r = self.client.get(self.base + h)
        except httpx.HTTPError as exc:
            raise StorageError(f"photo store unreachable: {exc}") from exc
        if r.status_code == 404:
            return None
        if r.status_code != 200:
            raise StorageError(f"photo store error: HTTP {r.status_code}")
        return r.content, r.headers.get("content-type", "application/octet-stream")


class LocalStore:
    name = "local folder"

    def __init__(self, folder: str):
        self.folder = Path(folder)
        self.folder.mkdir(parents=True, exist_ok=True)

    def _path(self, h: str) -> Path:
        return self.folder / h

    def exists(self, h: str) -> bool:
        return self._path(h).exists()

    def save(self, h: str, data: bytes, content_type: str) -> None:
        self._path(h).write_bytes(data)

    def load(self, h: str) -> tuple[bytes, str] | None:
        p = self._path(h)
        if not p.exists():
            return None
        data = p.read_bytes()
        return data, detect_type(data) or "application/octet-stream"


class CloudinaryStore:
    """Free cloud storage (Cloudinary free plan: 25 credits/month, no credit card).

    Configure with ONE setting copied from the Cloudinary dashboard:
        CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
    Photos are uploaded as  lostfinder/<sha256>  with overwrite=false, so Cloudinary
    keeps only one copy of the same photo. Browsers load photos straight from
    Cloudinary's CDN: GET /photos/<hash> answers with a redirect to it.
    """
    name = "cloudinary"
    FOLDER = "lostfinder"

    def __init__(self, url: str):
        parsed = urlparse(url)
        if parsed.scheme != "cloudinary" or not (parsed.username and parsed.password and parsed.hostname):
            raise ValueError("CLOUDINARY_URL must look like cloudinary://API_KEY:API_SECRET@CLOUD_NAME")
        self.api_key = unquote(parsed.username)
        self.api_secret = unquote(parsed.password)
        self.cloud = parsed.hostname
        self.client = httpx.Client(timeout=30)

    @staticmethod
    def sign(params: dict, api_secret: str) -> str:
        """Cloudinary request signature: sorted 'key=value' pairs joined by '&', plus the secret, SHA-1."""
        to_sign = "&".join(f"{k}={params[k]}" for k in sorted(params))
        return hashlib.sha1((to_sign + api_secret).encode()).hexdigest()

    def public_id(self, h: str) -> str:
        return f"{self.FOLDER}/{h}"

    def url(self, h: str) -> str:
        return f"https://res.cloudinary.com/{self.cloud}/image/upload/{self.public_id(h)}"

    def exists(self, h: str) -> bool:
        return False  # not needed: overwrite=false below makes Cloudinary keep a single copy

    def save(self, h: str, data: bytes, content_type: str) -> None:
        params = {"overwrite": "false", "public_id": self.public_id(h), "timestamp": str(int(time.time()))}
        form = {**params, "api_key": self.api_key, "signature": self.sign(params, self.api_secret)}
        try:
            r = self.client.post(
                f"https://api.cloudinary.com/v1_1/{self.cloud}/image/upload",
                data=form,
                files={"file": (h, data, content_type)},
            )
        except httpx.HTTPError as exc:
            raise StorageError(f"Cloudinary unreachable (check your internet connection): {exc}") from exc
        if r.status_code != 200:
            try:
                message = r.json()["error"]["message"]
            except (ValueError, KeyError, TypeError):
                message = f"HTTP {r.status_code}"
            raise StorageError(f"Cloudinary refused the upload: {message}")

    def load(self, h: str):
        raise NotImplementedError("Cloudinary photos are served by redirect, see routers/photos.py")


def _make_store():
    """Choose where photos go:
       PHOTO_STORAGE=cloudinary | seaweedfs | local   (or leave it empty to choose automatically:
       Cloudinary if CLOUDINARY_URL is set, else SeaweedFS if SEAWEEDFS_FILER_URL is set, else a local folder)."""
    choice = settings.photo_storage.strip().lower()
    if not choice:
        choice = "cloudinary" if settings.cloudinary_url else "seaweedfs" if settings.seaweedfs_filer_url else "local"
    if choice == "cloudinary":
        return CloudinaryStore(settings.cloudinary_url)
    if choice == "seaweedfs":
        return SeaweedStore(settings.seaweedfs_filer_url)
    return LocalStore(settings.photo_dir)


store = _make_store()


def is_valid_hash(h: str) -> bool:
    return len(h) == 64 and all(c in "0123456789abcdef" for c in h)
