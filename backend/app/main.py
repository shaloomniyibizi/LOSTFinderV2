"""Entry point of one branch.

Run it with:  uvicorn app.main:app --port 8001
On startup it creates the tables (if missing), registers the three branches,
and creates the first admin account.
"""
import asyncio
import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from .config import KNOWN_BRANCHES, settings, warn_about_dev_secrets
from .database import Base, SessionLocal, engine, upgrade_schema
from .models import Branch, Role, User
from . import reliability, replication
from .notifier import notifier
from .routers import auth, branches, claims, health, items, live, photos, stats, users
from .routers import replication as replication_router
from .security import hash_password

logging.basicConfig(level=logging.INFO, format="%(levelname)s:     [%(name)s] %(message)s")
# pika logs every lost connection as an ERROR; our own "retrying in 3s" warning already says it
logging.getLogger("pika").setLevel(logging.CRITICAL)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    added = upgrade_schema()
    if added:
        logging.getLogger("startup").info("database upgraded: added %s", ", ".join(added))
    with SessionLocal() as db:
        for b in KNOWN_BRANCHES:
            if db.get(Branch, b["id"]) is None:
                db.add(Branch(**b))
        admin_email = settings.admin_email.lower()
        if db.scalar(select(User).where(User.email == admin_email)) is None:
            db.add(User(
                # Same id on every branch (derived from the email), so all branches hold the SAME admin record
                id=uuid.uuid5(uuid.NAMESPACE_URL, f"lostfinder-admin:{admin_email}"),
                full_name="System Admin",
                email=admin_email,
                password_hash=hash_password(settings.admin_password),
                role=Role.admin,
            ))
        db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    warn_about_dev_secrets()
    init_db()
    notifier.attach_loop(asyncio.get_running_loop())  # lets background threads push WebSocket messages
    replication.start()  # background threads: send our events, receive other branches' events
    reliability.start()  # heartbeat monitor, queued-claim forwarder, periodic resync
    yield
    reliability.stop()
    replication.stop()


app = FastAPI(
    title=f"Lost & Found — Branch {settings.branch_id} ({settings.branch_name})",
    description="Distributed Lost and Found Property Management System — one branch node.",
    version="1.0.0",
    lifespan=lifespan,
)

# Lets the Next.js front end (localhost:3000) call this API from the browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.frontend_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(branches.router)
app.include_router(items.router)
app.include_router(photos.router)
app.include_router(claims.router)
app.include_router(live.router)
app.include_router(stats.router)
app.include_router(users.router)
app.include_router(replication_router.router)
