"""
Endpoints for registering and logging in.

NOTE on roles: to keep this project simple for learning purposes, /register
lets the caller pick any role (patient, doctor, or admin). In a real
production system you would NOT let people self-register as "doctor" or
"admin" — those accounts would be created separately by an administrator.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas, auth
from app.database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: schemas.UserRegister, db: Session = Depends(get_db)):
    # Make sure this email isn't already taken.
    existing_user = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email is already registered")

    if payload.role == models.UserRole.doctor and not payload.specialization:
        raise HTTPException(status_code=400, detail="Doctors must provide a specialization")

    new_user = models.User(
        email=payload.email,
        hashed_password=auth.hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
    )
    db.add(new_user)
    db.flush()  # assigns new_user.id without fully committing yet

    if payload.role == models.UserRole.doctor:
        doctor_profile = models.Doctor(
            user_id=new_user.id,
            specialization=payload.specialization,
            bio=payload.bio,
        )
        db.add(doctor_profile)

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
