"""Branch configuration.

Every branch runs the SAME code. What makes Branch A different from Branch B
is only these environment variables.

Private values (passwords, secrets, API keys) are NOT written in the code or in
docker-compose.yml. They come from a ".env" file:
  - with Docker: the .env file next to docker-compose.yml (Docker Compose reads it)
  - without Docker: a .env file in the folder you start the branch from (read here)
Copy .env.example to .env and fill it in. Never commit .env to Git.
"""
import logging
import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()  # reads ./.env if present; real environment variables always win

log = logging.getLogger("config")

DEV_JWT_SECRET = "dev-only-insecure-secret-change-me-0000"
DEV_ADMIN_PASSWORD = "admin123"


def _peer_urls() -> dict[str, str]:
    """Where each branch's API can be reached FROM THIS BRANCH, e.g.
    PEER_URLS="A=http://branch-a:8000,B=http://branch-b:8000,C=http://branch-c:8000"."""
    urls = {b["id"]: b["api_url"] for b in KNOWN_BRANCHES}
    for part in os.getenv("PEER_URLS", "").split(","):
        if "=" in part:
            bid, url = part.split("=", 1)
            urls[bid.strip().upper()] = url.strip().rstrip("/")
    return urls


# The three branches of the system (addresses as seen from your own computer)
KNOWN_BRANCHES = [
    {"id": "A", "name": "Campus", "api_url": "http://localhost:8001"},
    {"id": "B", "name": "Bus Park", "api_url": "http://localhost:8002"},
    {"id": "C", "name": "Airport", "api_url": "http://localhost:8003"},
]


@dataclass(frozen=True)
class Settings:
    # Who am I? "A", "B" or "C"
    branch_id: str = os.getenv("BRANCH_ID", "A")
    branch_name: str = os.getenv("BRANCH_NAME", "Campus")

    # This branch's OWN database. A branch never connects to another branch's database.
    database_url: str = os.getenv(
        "DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/branch_a")

    # Login tokens (JWT). MUST be the same secret on every branch.
    jwt_secret: str = os.getenv("JWT_SECRET", DEV_JWT_SECRET)
    jwt_algorithm: str = "HS256"
    token_minutes: int = int(os.getenv("TOKEN_MINUTES", "480"))

    # RabbitMQ connection. Empty = replication switched off (e.g. when running the tests).
    rabbitmq_url: str = os.getenv("RABBITMQ_URL", "")

    # Photo storage: "local", "cloudinary" or "seaweedfs". Empty = choose automatically
    # (Cloudinary if CLOUDINARY_URL is set, SeaweedFS if SEAWEEDFS_FILER_URL is set, otherwise local folder).
    photo_storage: str = os.getenv("PHOTO_STORAGE", "")
    # cloudinary://API_KEY:API_SECRET@CLOUD_NAME
    cloudinary_url: str = os.getenv("CLOUDINARY_URL", "")
    seaweedfs_filer_url: str = os.getenv("SEAWEEDFS_FILER_URL", "")
    photo_dir: str = os.getenv("PHOTO_DIR", "./photos")

    # Web front end address (allowed to call this API from the browser)
    frontend_origins: str = os.getenv(
        "FRONTEND_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")

    # First admin account, created automatically on startup if it doesn't exist
    admin_email: str = os.getenv("ADMIN_EMAIL", "admin@lostfound.local")
    admin_password: str = os.getenv("ADMIN_PASSWORD", DEV_ADMIN_PASSWORD)

    # How this branch reaches the other branches (used to forward claims to an item's home branch)
    peer_urls: dict = field(default_factory=_peer_urls)

    # Matching: pairs scoring at least this many points (out of 100) are reported as possible matches
    match_threshold: int = int(os.getenv("MATCH_THRESHOLD", "60"))

    # Reliability (Phase 5)
    # how often peers are checked
    heartbeat_seconds: float = float(os.getenv("HEARTBEAT_SECONDS", "5"))
    # missed checks before "down"
    heartbeat_misses: int = int(os.getenv("HEARTBEAT_MISSES", "3"))
    queue_retry_seconds: float = float(
        os.getenv("QUEUE_RETRY_SECONDS", "3"))  # queued claims retry interval
    # periodic anti-entropy sync
    resync_minutes: float = float(os.getenv("RESYNC_MINUTES", "5"))
    background_tasks: bool = os.getenv(
        "BACKGROUND_TASKS", "1") == "1"       # 0 in tests


settings = Settings()


def warn_about_dev_secrets() -> None:
    if settings.jwt_secret == DEV_JWT_SECRET:
        log.warning(
            "JWT_SECRET is the insecure development default. Set it in your .env file.")
    if settings.admin_password == DEV_ADMIN_PASSWORD:
        log.warning(
            "ADMIN_PASSWORD is the default 'admin123'. Set it in your .env file.")
