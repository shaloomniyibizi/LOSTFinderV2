"""Replication and cluster health (handy during the demo)."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import reliability, replication
from ..database import get_db
from ..models import Role, User
from ..security import require_internal, require_roles

router = APIRouter(tags=["replication"])


@router.get("/replication/status")
def replication_status(db: Session = Depends(get_db)):
    """RabbitMQ connection state, events sent/received, unsent events waiting in the outbox,
    claims queued for offline branches, last resync, and items held per home branch."""
    return {
        **replication.summary(db),
        "queued_claims": reliability.queued_count(),
        "last_resync": reliability.status.last_resync,
    }


@router.get("/cluster")
def cluster():
    """This branch's view of the other branches, from its heartbeat monitor (up / down / unknown)."""
    return reliability.monitor.view()


@router.get("/replication/snapshot")
def replication_snapshot(_caller: str = Depends(require_internal)):
    """Everything this branch holds (users, items, claims). Only other branches may call it."""
    return reliability.snapshot()


@router.post("/replication/resync")
def replication_resync(_admin: User = Depends(require_roles(Role.admin))):
    """Admin: compare data with every other branch now and repair anything missing or older."""
    return {"repaired": reliability.sync_from_all()}
