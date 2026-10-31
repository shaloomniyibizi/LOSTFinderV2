"""Phase 5: fault tolerance.

1. HEARTBEAT MONITOR (like GFS / HDFS heartbeats)
   Every HEARTBEAT_SECONDS this branch calls GET /health on every other branch.
   After HEARTBEAT_MISSES failures in a row, that branch is marked DOWN; one success marks it UP again.
   GET /cluster shows this branch's view of the others.

2. QUEUED CLAIMS (store and forward)
   A claim must be decided at the item's home branch. If that branch is DOWN, the claim is not refused:
   it is saved in `queued_requests` and the FORWARDER thread delivers it once the home branch is back.
   To act on the user's behalf it makes a short-lived token with the shared JWT secret.
   The home branch still decides (and locks the item), so only one claim can ever win.

3. RESYNC / ANTI-ENTROPY (like Amazon Dynamo's replica synchronisation)
   RabbitMQ normally delivers every change. But a message can be lost (RabbitMQ restarted without its
   data, a branch's database wiped...). So branches also COMPARE their data directly: this branch downloads
   a peer's full snapshot and applies every record whose version is newer than its own copy.
   It runs when the branch starts, when a peer comes back UP, every RESYNC_MINUTES, and on demand.
   Because it also copies items whose home is THIS branch, a branch whose database was wiped gets its
   own items back from the other branches' copies.
"""
import logging
import threading
import time
import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy import select

from .config import KNOWN_BRANCHES, settings
from .database import SessionLocal

log = logging.getLogger("reliability")

BRANCH_NAMES = {b["id"]: b["name"] for b in KNOWN_BRANCHES}
_stop = threading.Event()


def _now() -> datetime:
    return datetime.now(timezone.utc)


# =============================================================== 1. heartbeat monitor
class PeerState:
    def __init__(self, branch_id: str):
        self.branch_id = branch_id
        self.status = "unknown"         # unknown | up | down
        self.misses = 0
        self.latency_ms: int | None = None
        self.last_ok: datetime | None = None
        self.since: datetime = _now()   # when the status last changed

    def as_dict(self) -> dict:
        return {
            "branch": self.branch_id, "name": BRANCH_NAMES.get(self.branch_id, self.branch_id),
            "status": self.status, "misses": self.misses, "latency_ms": self.latency_ms,
            "last_ok": self.last_ok.isoformat() if self.last_ok else None, "since": self.since.isoformat(),
        }


class Monitor:
    def __init__(self):
        self.peers = {b: PeerState(b) for b in settings.peer_urls if b != settings.branch_id}
        self.on_peer_up: list = []  # callbacks(branch_id) when a peer comes back

    def is_down(self, branch_id: str) -> bool:
        p = self.peers.get(branch_id)
        return bool(p and p.status == "down")

    def record(self, branch_id: str, ok: bool, latency_ms: int | None = None) -> None:
        p = self.peers[branch_id]
        old = p.status
        if ok:
            p.misses, p.latency_ms, p.last_ok = 0, latency_ms, _now()
            p.status = "up"
        else:
            p.misses += 1
            p.latency_ms = None
            if p.misses >= settings.heartbeat_misses:
                p.status = "down"
        if p.status != old:
            p.since = _now()
            log.warning("branch %s is now %s (was %s)", branch_id, p.status.upper(), old)
            if p.status == "up" and old in ("down", "unknown"):
                for cb in self.on_peer_up:
                    threading.Thread(target=cb, args=(branch_id,), daemon=True).start()

    def check_once(self, client: httpx.Client | None = None) -> None:
        c = client or httpx.Client(timeout=2)
        for bid in self.peers:
            start = time.perf_counter()
            try:
                ok = c.get(settings.peer_urls[bid] + "/health").status_code == 200
            except httpx.HTTPError:
                ok = False
            self.record(bid, ok, round((time.perf_counter() - start) * 1000) if ok else None)

    def view(self) -> dict:
        return {"branch": settings.branch_id, "checked_every_seconds": settings.heartbeat_seconds,
                "down_after_misses": settings.heartbeat_misses,
                "peers": [p.as_dict() for p in self.peers.values()]}


monitor = Monitor()


def _monitor_loop() -> None:
    client = httpx.Client(timeout=2)
    while not _stop.is_set():
        try:
            monitor.check_once(client)
        except Exception:
            log.exception("heartbeat check failed")
        _stop.wait(settings.heartbeat_seconds)


# =============================================================== 2. queued claims
def queue_claim(db, item_id: uuid.UUID, user_id: uuid.UUID, target: str, payload: dict, error: str):
    from .models import QueuedRequest

    existing = db.scalars(select(QueuedRequest).where(
        QueuedRequest.item_id == item_id, QueuedRequest.user_id == user_id, QueuedRequest.status == "QUEUED",
    )).first()
    if existing:
        return existing
    q = QueuedRequest(kind="claim", target_branch=target, item_id=item_id, user_id=user_id,
                      payload=payload, last_error=error)
    db.add(q)
    db.commit()
    log.info("claim on item %s queued for branch %s (%s)", item_id, target, error)
    return q


def process_queue_once(post=None) -> int:
    """Try to deliver every queued request whose target branch is not known to be down.
    Returns how many were finished (delivered or failed for good)."""
    from .announce import BRANCH_NAMES as NAMES
    from .models import Item, QueuedRequest, User
    from .notifier import notifier
    from .security import short_token_for

    post = post or httpx.post
    finished = 0
    with SessionLocal() as db:
        pending = db.scalars(select(QueuedRequest).where(QueuedRequest.status == "QUEUED")
                             .order_by(QueuedRequest.created_at)).all()
        for q in pending:
            if monitor.is_down(q.target_branch):
                continue
            user = db.get(User, q.user_id)
            if user is None:
                q.status, q.last_error = "FAILED", "user account not found"
                db.commit()
                continue
            q.attempts += 1
            try:
                r = post(
                    f"{settings.peer_urls[q.target_branch]}/items/{q.item_id}/claims",
                    json=q.payload,
                    headers={"Authorization": f"Bearer {short_token_for(user.id, user.role.value)}",
                             "X-Forwarded-From-Branch": settings.branch_id},
                    timeout=10,
                )
            except httpx.HTTPError as exc:
                q.last_error = f"still unreachable: {exc.__class__.__name__}"
                db.commit()
                continue
            try:
                body = r.json()
            except ValueError:
                body = {"detail": f"HTTP {r.status_code}"}
            item = db.get(Item, q.item_id)
            title = item.title if item else "the item"
            where = NAMES.get(q.target_branch, q.target_branch)
            if r.status_code == 201:
                q.status, q.result, q.delivered_at, q.last_error = "DELIVERED", body, _now(), None
                db.commit()
                finished += 1
                log.info("queued claim %s delivered to %s", q.id, q.target_branch)
                notifier.to_users([q.user_id], {
                    "type": "claim", "title": "Your queued claim was delivered",
                    "message": f"{where} is back online. Staff there will check your claim for “{title}”.",
                    "link": f"/items/{q.item_id}"})
            elif 400 <= r.status_code < 500:
                q.status, q.result, q.last_error = "FAILED", body, body.get("detail") if isinstance(body, dict) else str(body)
                db.commit()
                finished += 1
                notifier.to_users([q.user_id], {
                    "type": "claim", "title": "Your queued claim could not be accepted",
                    "message": f"{where}: {q.last_error}", "link": f"/items/{q.item_id}"})
            else:
                q.last_error = f"home branch answered HTTP {r.status_code}"
                db.commit()
    return finished


def _forwarder_loop() -> None:
    while not _stop.is_set():
        try:
            process_queue_once()
        except Exception:
            log.exception("forwarding queued requests failed")
        _stop.wait(settings.queue_retry_seconds)


# =============================================================== 3. resync / anti-entropy
def snapshot() -> dict:
    """Everything this branch holds, for another branch to compare with."""
    from .models import Claim, Item, User
    from .replication import claim_payload, item_payload, user_payload

    with SessionLocal() as db:
        return {
            "branch": settings.branch_id,
            "taken_at": _now().isoformat(),
            "users": [user_payload(u) for u in db.scalars(select(User))],
            "items": [item_payload(i) for i in db.scalars(select(Item))],
            "claims": [claim_payload(c) for c in db.scalars(select(Claim))],
        }


def apply_snapshot(data: dict) -> dict:
    """Apply a peer's snapshot: insert what's missing, replace what's older (higher version wins)."""
    from .matching import safe_run_for_item
    from .replication import apply_event

    origin = data.get("branch", "?")
    counts = {"users": 0, "items": 0, "claims": 0}
    changed_items = []
    with SessionLocal() as db:
        for u in data.get("users", []):
            if apply_event(db, "user.updated", {"origin": origin, "data": u}) in ("inserted", "updated"):
                counts["users"] += 1
        db.commit()
        for it in data.get("items", []):
            if apply_event(db, "item.updated", {"origin": origin, "data": it}) in ("inserted", "updated"):
                counts["items"] += 1
                changed_items.append(uuid.UUID(it["id"]))
        db.commit()
        for c in data.get("claims", []):
            if apply_event(db, "claim.updated", {"origin": origin, "data": c}) in ("inserted", "updated"):
                counts["claims"] += 1
        db.commit()
    for item_id in changed_items:
        safe_run_for_item(item_id)
    return counts


def sync_from_peer(branch_id: str, get=None) -> dict | None:
    from .security import internal_token

    if branch_id == settings.branch_id or branch_id not in settings.peer_urls:
        return None
    get = get or httpx.get
    try:
        r = get(settings.peer_urls[branch_id] + "/replication/snapshot",
                headers={"Authorization": f"Bearer {internal_token()}"}, timeout=20)
        r.raise_for_status()
    except httpx.HTTPError as exc:
        log.info("resync from %s skipped: %s", branch_id, exc.__class__.__name__)
        return None
    counts = apply_snapshot(r.json())
    status.last_resync[branch_id] = {"at": _now().isoformat(), **counts}
    if any(counts.values()):
        log.warning("resync from %s repaired %s", branch_id, counts)
    return counts


def sync_from_all() -> dict:
    return {b: sync_from_peer(b) for b in settings.peer_urls if b != settings.branch_id}


def _resync_loop() -> None:
    _stop.wait(4)  # let the web server start first
    while not _stop.is_set():
        try:
            sync_from_all()
        except Exception:
            log.exception("periodic resync failed")
        _stop.wait(settings.resync_minutes * 60)


# =============================================================== status + start/stop
class Status:
    def __init__(self):
        self.last_resync: dict[str, dict] = {}


status = Status()


def queued_count() -> int:
    from sqlalchemy import func

    from .models import QueuedRequest
    with SessionLocal() as db:
        return db.scalar(select(func.count()).select_from(QueuedRequest).where(QueuedRequest.status == "QUEUED")) or 0


def start() -> None:
    if not settings.background_tasks:
        return
    _stop.clear()
    monitor.on_peer_up = [sync_from_peer]  # a peer came back: compare data with it at once
    for name, target in (("monitor", _monitor_loop), ("forwarder", _forwarder_loop), ("resync", _resync_loop)):
        threading.Thread(target=target, name=name, daemon=True).start()


def stop() -> None:
    _stop.set()
