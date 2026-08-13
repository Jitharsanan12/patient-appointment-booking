"""
Authentication helpers:
- hashing/verifying passwords with bcrypt
- creating and decoding JWT access tokens
- a FastAPI dependency (get_current_user) that endpoints use to find out
  who is making the request, based on the "Authorization: Bearer <token>" header
"""

import os
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.database import get_db
from app import models

# Secret key used to sign JWT tokens. In a real production app this MUST be
# a long random value kept secret (e.g. also loaded from .env). For local
# development we fall back to a default so the app runs out of the box.
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-key-change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # tokens are valid for 24 hours

# Tells FastAPI where clients should go to get a token (our /auth/login endpoint).
# This also makes the interactive API docs (/docs) show a "login" button.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


def hash_password(plain_password: str) -> str:
    """Turn a plain-text password into a secure hash for storing in the DB."""
    hashed_bytes = bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt())
    return hashed_bytes.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Check a plain-text password against a stored hash at login time."""
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def create_access_token(data: dict) -> str:
    """
    Build a signed JWT containing `data` (we'll put the user's id and role
    in it) plus an expiry time. The client sends this token back on every
    request to prove who they are.
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    """
    FastAPI dependency: decodes the JWT from the request, looks up the
    matching user in the database, and returns it. Any endpoint that adds
    `current_user: models.User = Depends(get_current_user)` as a parameter
    will automatically require a valid token and get the logged-in user.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception
    return user


def require_role(*allowed_roles: models.UserRole):
    """
    Factory for a dependency that only allows through users with one of the
    given roles. Usage: Depends(require_role(models.UserRole.admin))
    """
    def role_checker(current_user: models.User = Depends(get_current_user)) -> models.User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return current_user

    return role_checker
