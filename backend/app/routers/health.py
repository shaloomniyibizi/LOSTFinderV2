"""Heartbeat endpoint. In Phase 5 a monitor calls this every few seconds."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        database = "ok"
    except Exception:
        database = "down"
    return {
        "branch": settings.branch_id,
        "name": settings.branch_name,
        "status": "ok" if database == "ok" else "degraded",
        "database": database,
        "time": datetime.now(timezone.utc).isoformat(),
    }
