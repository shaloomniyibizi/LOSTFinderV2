"""Sign-up, login, current user, and admin-only user creation."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Branch, Role, User
from ..schemas import CreateUserIn, RegisterIn, TokenOut, UserOut
from ..security import create_token, get_current_user, hash_password, require_roles, verify_password

router = APIRouter(tags=["auth"])


def _email_taken(db: Session, email: str) -> bool:
    return db.scalar(select(User).where(User.email == email.lower())) is not None


@router.post("/auth/register", response_model=UserOut, status_code=201)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    """Public sign-up for owners and finders. Staff and admins are created by an admin."""
    if data.role not in (Role.owner, Role.finder):
        raise HTTPException(403, "Only owner or finder accounts can sign up; staff are created by an admin")
    if _email_taken(db, data.email):
        raise HTTPException(409, "Email already registered")
    user = User(
        full_name=data.full_name,
        email=data.email.lower(),
        phone=data.phone,
        password_hash=hash_password(data.password),
        role=data.role,
    )
    db.add(user)
    db.commit()
    return user


@router.post("/auth/login", response_model=TokenOut)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Log in with email (as 'username') and password. Returns a JWT token."""
    user = db.scalar(select(User).where(User.email == form.username.lower()))
    if user is None or not verify_password(form.password, user.password_hash):
        raise HTTPException(401, "Wrong email or password")
    return TokenOut(access_token=create_token(user), user=UserOut.model_validate(user))


@router.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


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
    db.commit()
    return user


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _admin: User = Depends(require_roles(Role.admin))):
    return db.scalars(select(User).order_by(User.created_at)).all()
