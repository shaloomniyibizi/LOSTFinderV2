"""Shared helpers for the test scripts: branch addresses, the .env file, and small HTTP helpers."""
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
BRANCHES = {
    "A": os.getenv("BRANCH_A_URL", "http://localhost:8001"),
    "B": os.getenv("BRANCH_B_URL", "http://localhost:8002"),
    "C": os.getenv("BRANCH_C_URL", "http://localhost:8003"),
}
NAMES = {"A": "Campus", "B": "Bus Park", "C": "Airport"}
PASSWORD = "test-pass-123"


def load_env(path: Path = ROOT / ".env") -> dict:
    """Read KEY=VALUE lines from the project's .env (real environment variables win)."""
    values = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                values[k.strip()] = v.strip().strip('"').strip("'")
    values.update({k: v for k, v in os.environ.items() if k in values or k == "JWT_SECRET"})
    return values


def internal_token() -> str:
    """A token that lets the scripts read /replication/snapshot, like a branch would.
    Needs JWT_SECRET from .env (the same secret the branches use)."""
    import jwt  # pip install PyJWT

    secret = load_env().get("JWT_SECRET")
    if not secret:
        raise SystemExit("JWT_SECRET not found. Run the script from the project folder that contains .env")
    payload = {"sub": "branch:test-script", "role": "internal", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)}
    return jwt.encode(payload, secret, algorithm="HS256")


def is_up(bid: str) -> bool:
    try:
        return httpx.get(BRANCHES[bid] + "/health", timeout=2).status_code == 200
    except httpx.HTTPError:
        return False


def wait_until(check, timeout: float = 60, every: float = 0.25):
    """Poll check() until it returns something truthy. Returns (result, seconds) or (None, timeout)."""
    start = time.perf_counter()
    while time.perf_counter() - start < timeout:
        try:
            result = check()
            if result:
                return result, time.perf_counter() - start
        except httpx.HTTPError:
            pass
        time.sleep(every)
    return None, timeout


def new_user(bid: str, label: str = "tester") -> tuple[str, dict]:
    """Sign up a fresh user at a branch and log in. Returns (email, auth headers)."""
    email = f"{label}-{uuid.uuid4().hex[:8]}@test.rw"
    url = BRANCHES[bid]
    httpx.post(url + "/auth/register", json={"full_name": label.title(), "email": email, "password": PASSWORD},
               timeout=10).raise_for_status()
    r = httpx.post(url + "/auth/login", data={"username": email, "password": PASSWORD}, timeout=10)
    r.raise_for_status()
    return email, {"Authorization": "Bearer " + r.json()["access_token"]}


def login(bid: str, email: str) -> dict | None:
    r = httpx.post(BRANCHES[bid] + "/auth/login", data={"username": email, "password": PASSWORD}, timeout=5)
    return {"Authorization": "Bearer " + r.json()["access_token"]} if r.status_code == 200 else None


def report(bid: str, headers: dict, **item) -> dict:
    body = {"type": "FOUND", "category": "bag", "title": "Test bag", "event_date": time.strftime("%Y-%m-%d")}
    body.update(item)
    r = httpx.post(BRANCHES[bid] + "/items", headers=headers, json=body, timeout=10)
    r.raise_for_status()
    return r.json()
