"""
Endpoints for registering and logging in.

NOTE on roles: public self-signup (this /register endpoint) can ONLY ever
create a "patient" account — the role is hard-coded below and the request
schema (schemas.PatientRegister) doesn't even have a role field, so there's
nothing a client could send to change that. Doctor accounts are created by
an admin via POST /admin/doctors (see routers/admin.py); the one admin
account is created separately via backend/seed_admin.py, not through the API.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas, auth
from app.database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: schemas.PatientRegister, db: Session = Depends(get_db)):
    # Make sure this email isn't already taken.
    existing_user = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email is already registered")

    new_user = models.User(
        email=payload.email,
        hashed_password=auth.hash_password(payload.password),
        full_name=payload.full_name,
        role=models.UserRole.patient,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/login", response_model=schemas.Token)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()

    if not user or not auth.verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    # "sub" (subject) is the standard JWT field for "who does this token belong to".
    access_token = auth.create_access_token(data={"sub": str(user.id), "role": user.role.value})
    return schemas.Token(access_token=access_token)


@router.get("/me", response_model=schemas.UserOut)
def get_me(current_user: models.User = Depends(auth.get_current_user)):
    """Lets the frontend ask 'who am I logged in as?' using the current token."""
    return current_user
