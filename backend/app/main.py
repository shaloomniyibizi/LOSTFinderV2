"""Entry point of one branch.

Run it with:  uvicorn app.main:app --port 8001
On startup it creates the tables (if missing), registers the three branches,
and creates the first admin account.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from .config import KNOWN_BRANCHES, settings
from .database import Base, SessionLocal, engine
from .models import Branch, Role, User
from .routers import auth, branches, health, items
from .security import hash_password


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        for b in KNOWN_BRANCHES:
            if db.get(Branch, b["id"]) is None:
                db.add(Branch(**b))
        admin_email = settings.admin_email.lower()
        if db.scalar(select(User).where(User.email == admin_email)) is None:
            db.add(User(
                full_name="System Admin",
                email=admin_email,
                password_hash=hash_password(settings.admin_password),
                role=Role.admin,
            ))
        db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title=f"Lost & Found — Branch {settings.branch_id} ({settings.branch_name})",
    description="Distributed Lost and Found Property Management System — one branch node.",
    version="0.1.0 (Phase 1)",
    lifespan=lifespan,
)

# Lets the Next.js front end (localhost:3000) call this API from the browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(branches.router)
app.include_router(items.router)
