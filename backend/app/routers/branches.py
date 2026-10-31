from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Branch
from ..schemas import BranchOut

router = APIRouter(tags=["branches"])


@router.get("/branches", response_model=list[BranchOut])
def list_branches(db: Session = Depends(get_db)):
    """The three branch offices."""
    return db.scalars(select(Branch).order_by(Branch.id)).all()
