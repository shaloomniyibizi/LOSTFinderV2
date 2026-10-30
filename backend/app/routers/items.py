"""Report, search, view and update lost/found items."""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import Item, ItemStatus, ItemType, Role, User
from ..replication import item_payload, record_event
from ..schemas import ItemIn, ItemOut, ItemPage, ItemUpdate
from ..security import get_current_user, require_roles

router = APIRouter(prefix="/items", tags=["items"])


def _get_item_or_404(db: Session, item_id: uuid.UUID) -> Item:
    item = db.get(Item, item_id)
    if item is None:
        raise HTTPException(404, "Item not found")
    return item


def _ensure_home_branch(item: Item) -> None:
    """Only the item's home branch may change it (it is the 'primary', like in GFS)."""
    if item.home_branch != settings.branch_id:
        raise HTTPException(
            409,
            f"This item belongs to branch {item.home_branch}; changes must be made there",
        )


@router.post("", response_model=ItemOut, status_code=201)
def report_item(data: ItemIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Report a LOST or FOUND item. Any logged-in user can report either type.
    This branch becomes the item's home branch, and a copy is sent to the other branches."""
    if data.event_date > date.today():
        raise HTTPException(422, "event_date cannot be in the future")
    item = Item(
        type=data.type,
        category=data.category.strip().lower(),
        colour=data.colour.strip().lower() if data.colour else None,
        title=data.title.strip(),
        description=data.description.strip(),
        location=data.location.strip(),
        event_date=data.event_date,
        home_branch=settings.branch_id,
        version=1,
        reported_by=user.id,
    )
    db.add(item)
    db.flush()  # fills in id and timestamps
    record_event(db, "item.created", item_payload(item))  # tell the other branches
    db.commit()
    return item


@router.get("", response_model=ItemPage)
def search_items(
    db: Session = Depends(get_db),
    q: str | None = Query(None, description="Words to find in title, description or location"),
    type: ItemType | None = None,
    category: str | None = None,
    colour: str | None = None,
    status: ItemStatus | None = None,
    branch: str | None = Query(None, description="Only items whose home branch is this (A, B, C)"),
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Search items. Public: no login needed, so owners can look before signing up."""
    stmt = select(Item)
    if q:
        for word in q.split():
            like = f"%{word}%"
            stmt = stmt.where(
                or_(Item.title.ilike(like), Item.description.ilike(like), Item.location.ilike(like))
            )
    if type:
        stmt = stmt.where(Item.type == type)
    if category:
        stmt = stmt.where(Item.category == category.strip().lower())
    if colour:
        stmt = stmt.where(Item.colour == colour.strip().lower())
    if status:
        stmt = stmt.where(Item.status == status)
    if branch:
        stmt = stmt.where(Item.home_branch == branch.upper())
    if date_from:
        stmt = stmt.where(Item.event_date >= date_from)
    if date_to:
        stmt = stmt.where(Item.event_date <= date_to)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    items = db.scalars(stmt.order_by(Item.created_at.desc()).limit(limit).offset(offset)).all()
    return ItemPage(total=total, items=items)


@router.get("/{item_id}", response_model=ItemOut)
def get_item(item_id: uuid.UUID, db: Session = Depends(get_db)):
    return _get_item_or_404(db, item_id)


@router.patch("/{item_id}", response_model=ItemOut)
def update_item(
    item_id: uuid.UUID,
    data: ItemUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Edit an item. Allowed for: the person who reported it, staff of its home branch, or an admin."""
    item = _get_item_or_404(db, item_id)
    _ensure_home_branch(item)

    is_reporter = item.reported_by == user.id
    is_branch_staff = user.role == Role.staff and user.branch_id == item.home_branch
    if not (is_reporter or is_branch_staff or user.role == Role.admin):
        raise HTTPException(403, "You are not allowed to edit this item")

    changes = data.model_dump(exclude_unset=True)
    if "status" in changes and not (is_branch_staff or user.role == Role.admin):
        raise HTTPException(403, "Only branch staff or an admin can change the status")
    if changes.get("event_date") and changes["event_date"] > date.today():
        raise HTTPException(422, "event_date cannot be in the future")
    if not changes:
        return item

    for field, value in changes.items():
        if field in ("category", "colour") and isinstance(value, str):
            value = value.strip().lower()
        setattr(item, field, value)
    item.version += 1  # every change makes a newer version
    db.flush()
    record_event(db, "item.updated", item_payload(item))
    db.commit()
    return item


@router.delete("/{item_id}", status_code=204)
def delete_item(
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles(Role.admin)),
):
    item = _get_item_or_404(db, item_id)
    _ensure_home_branch(item)
    record_event(db, "item.deleted", {"id": str(item.id), "version": item.version + 1})
    db.delete(item)
    db.commit()
