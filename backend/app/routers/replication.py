"""Shows how replication is doing on this branch (handy during the demo)."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import replication
from ..database import get_db

router = APIRouter(tags=["replication"])


@router.get("/replication/status")
def replication_status(db: Session = Depends(get_db)):
    """RabbitMQ connection state, events sent/received, unsent events waiting in the outbox,
    and how many items this branch holds from each home branch."""
    return replication.summary(db)
