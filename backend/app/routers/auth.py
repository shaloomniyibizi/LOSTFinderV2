"""Sign-up, login, your own profile, and admin-only user creation (the rest of user management is in users.py)."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Branch, Role, User
from ..replication import record_event, user_payload
from ..schemas import CreateUserIn, PasswordChange, ProfileUpdate, RegisterIn, TokenOut, UserOut
from ..security import create_token, get_current_user, hash_password, require_roles, verify_password

router = APIRouter(tags=["auth"])


def _email_taken(db: Session, email: str) -> bool:
    return db.scalar(select(User).where(User.email == email.lower())) is not None


@router.post("/auth/register", response_model=UserOut, status_code=201)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    """Public sign-up. Every new account has the role 'user' and can report both LOST and FOUND items.
    Staff and admin accounts are created by an admin. The account is copied to all branches,
    so the person can log in at any branch."""
    if _email_taken(db, data.email):
        raise HTTPException(409, "Email already registered")
    user = User(
        full_name=data.full_name,
        email=data.email.lower(),
        phone=data.phone,
        password_hash=hash_password(data.password),
        role=Role.user,
    )
    db.add(user)
    db.flush()  # fills in user.id and created_at
    record_event(db, "user.created", user_payload(user))
    db.commit()
    return user


@router.post("/auth/login", response_model=TokenOut)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Log in with email (as 'username') and password. Returns a JWT token."""
    user = db.scalar(select(User).where(User.email == form.username.lower()))
    if user is None or not verify_password(form.password, user.password_hash):
        raise HTTPException(401, "Wrong email or password")
    if not user.is_active:
        raise HTTPException(403, "This account has been disabled. Please contact the administrator.")
    return TokenOut(access_token=create_token(user), user=UserOut.model_validate(user))


@router.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    """Your own account (checks that your token is still valid)."""
    return user


def save_user_change(db: Session, user: User) -> None:
    """Every change to an account gets a new version and is sent to the other branches."""
    user.version = (user.version or 1) + 1
    user.updated_at = datetime.now(timezone.utc)
    record_event(db, "user.updated", user_payload(user))
    db.commit()
    db.refresh(user)


@router.patch("/auth/me", response_model=UserOut)
def update_me(data: ProfileUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Change your own name or phone number."""
    changes = data.model_dump(exclude_unset=True)
    if "full_name" in changes and changes["full_name"]:
        user.full_name = changes["full_name"].strip()
    if "phone" in changes:
        user.phone = (changes["phone"] or "").strip() or None
    save_user_change(db, user)
    return user


@router.post("/auth/me/password", status_code=204)
def change_my_password(data: PasswordChange, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Change your own password (you must give the current one)."""
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(400, "Your current password is not correct")
    user.password_hash = hash_password(data.new_password)
    save_user_change(db, user)


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    data: CreateUserIn,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles(Role.admin)),
):
    """Admin creates any account, e.g. staff for a branch."""
    if _email_taken(db, data.email):
        raise HTTPException(409, "Email already registered")
    if data.role == Role.staff:
        if not data.branch_id or db.get(Branch, data.branch_id) is None:
            raise HTTPException(422, "Staff accounts need a valid branch_id (A, B or C)")
    user = User(
        full_name=data.full_name,
        email=data.email.lower(),
        phone=data.phone,
        password_hash=hash_password(data.password),
        role=data.role,
        branch_id=data.branch_id if data.role == Role.staff else None,
    )
    db.add(user)
    db.flush()
    record_event(db, "user.created", user_payload(user))
    db.commit()
    return user
