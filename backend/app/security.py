"""Passwords (bcrypt) and login tokens (JWT), plus role checks."""
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import Role, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "role": user.role.value,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.token_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def short_token_for(user_id: uuid.UUID, role: str, minutes: int = 5) -> str:
    """A short-lived login token, made by a branch to act ON BEHALF OF a user, e.g. to deliver
    a claim that was queued while the item's home branch was down. Every branch shares JWT_SECRET,
    so the home branch accepts it."""
    payload = {"sub": str(user_id), "role": role,
               "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes)}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def internal_token() -> str:
    """Proves to another branch that the caller is a branch of this system (for /replication/snapshot)."""
    payload = {"sub": f"branch:{settings.branch_id}", "role": "internal",
               "exp": datetime.now(timezone.utc) + timedelta(minutes=2)}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def require_internal(token: str = Depends(oauth2_scheme)) -> str:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        raise HTTPException(401, "Internal token required")
    if payload.get("role") != "internal":
        raise HTTPException(403, "Only branches may call this")
    return payload["sub"]


def user_from_token(db: Session, token: str) -> User | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
    return db.get(User, user_id)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    user = user_from_token(db, token)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_roles(*roles: Role):
    """Dependency factory: allow only users with one of the given roles."""
    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail=f"Requires role: {', '.join(r.value for r in roles)}")
        return user
    return checker
