"""User management for admins (Phase 6).

Accounts exist at every branch, so an admin can manage them from any branch. Each change gets a
new version and is sent to the other branches as a "user.updated" event (higher version wins).

Accounts are disabled rather than deleted: their reports and claims stay in the history, and a
disabled person can no longer sign in at any branch (their open sessions stop working too).
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Branch, Claim, Item, Role, User
from ..schemas import PasswordReset, UserAdminOut, UserAdminUpdate
from ..security import hash_password, require_roles
from .auth import save_user_change

router = APIRouter(prefix="/users", tags=["users (admin)"])
admin_only = require_roles(Role.admin)


def _with_counts(db: Session, users: list[User]) -> list[UserAdminOut]:
    ids = [u.id for u in users]
    reports = dict(db.execute(select(Item.reported_by, func.count()).where(Item.reported_by.in_(ids)).group_by(Item.reported_by)).all()) if ids else {}
    claims = dict(db.execute(select(Claim.claimant_id, func.count()).where(Claim.claimant_id.in_(ids)).group_by(Claim.claimant_id)).all()) if ids else {}
    return [UserAdminOut.model_validate(u).model_copy(update={"reports": reports.get(u.id, 0), "claims": claims.get(u.id, 0)}) for u in users]


def _get(db: Session, user_id: uuid.UUID) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    return user


def _active_admins(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(User).where(User.role == Role.admin, User.is_active.is_(True))) or 0


@router.get("", response_model=list[UserAdminOut])
def list_users(
    db: Session = Depends(get_db),
    _admin: User = Depends(admin_only),
    q: str | None = Query(None, description="Search name, email or phone"),
    role: Role | None = None,
    active: bool | None = None,
):
    """Every account, with how many reports and claims each person made. Filter by text, role or status."""
    stmt = select(User).order_by(User.created_at.desc())
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.full_name.ilike(like), User.email.ilike(like), User.phone.ilike(like)))
    if role:
        stmt = stmt.where(User.role == role)
    if active is not None:
        stmt = stmt.where(User.is_active.is_(active))
    return _with_counts(db, list(db.scalars(stmt)))


@router.get("/{user_id}", response_model=UserAdminOut)
def get_user(user_id: uuid.UUID, db: Session = Depends(get_db), _admin: User = Depends(admin_only)):
    """One account, with its report and claim counts."""
    return _with_counts(db, [_get(db, user_id)])[0]


@router.patch("/{user_id}", response_model=UserAdminOut)
def update_user(user_id: uuid.UUID, data: UserAdminUpdate, db: Session = Depends(get_db), admin: User = Depends(admin_only)):
    """Change someone's name, phone, role, branch (staff) or disable/enable the account."""
    user = _get(db, user_id)
    changes = data.model_dump(exclude_unset=True)
    is_self = user.id == admin.id

    new_role = changes.get("role", user.role)
    new_active = changes.get("is_active", user.is_active)
    if is_self and (new_role != Role.admin or not new_active):
        raise HTTPException(409, "You can't remove your own admin role or disable your own account")
    if user.role == Role.admin and user.is_active and (new_role != Role.admin or not new_active) and _active_admins(db) <= 1:
        raise HTTPException(409, "There must always be at least one active admin")

    new_branch = changes.get("branch_id", user.branch_id)
    if new_role == Role.staff:
        if not new_branch or db.get(Branch, new_branch) is None:
            raise HTTPException(422, "Staff accounts need a branch (A, B or C)")
    else:
        new_branch = None

    if changes.get("full_name"):
        user.full_name = changes["full_name"].strip()
    if "phone" in changes:
        user.phone = (changes["phone"] or "").strip() or None
    user.role, user.branch_id, user.is_active = new_role, new_branch, new_active
    save_user_change(db, user)
    return _with_counts(db, [user])[0]


@router.post("/{user_id}/password", status_code=204)
def reset_password(user_id: uuid.UUID, data: PasswordReset, db: Session = Depends(get_db), _admin: User = Depends(admin_only)):
    """Set a new password for someone who forgot theirs. Give it to them in person."""
    user = _get(db, user_id)
    user.password_hash = hash_password(data.password)
    save_user_change(db, user)
