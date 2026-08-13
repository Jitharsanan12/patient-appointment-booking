"""
Admin-only endpoints for managing accounts that the public can't create
themselves — right now, just creating doctor accounts.
"""

import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas, auth
from app.database import get_db

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/doctors", response_model=schemas.AdminCreateDoctorResponse, status_code=201)
def create_doctor(
    payload: schemas.AdminCreateDoctorRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.admin)),
):
    """
    Creates a doctor's login (User) and profile (Doctor) in one step.
    Only an admin can call this — enforced by require_role above, the same
    dependency used to protect the existing admin-only appointment view.
    """
    existing_user = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email is already registered")

    # If the admin didn't type a password in, generate a random one. The
    # doctor gets this once, in the response, and should change it after
    # logging in for the first time (there's no "reset password" flow yet).
    password = payload.password or secrets.token_urlsafe(9)

    new_user = models.User(
        email=payload.email,
        hashed_password=auth.hash_password(password),
        full_name=payload.full_name,
        role=models.UserRole.doctor,
    )
    db.add(new_user)
    db.flush()  # assigns new_user.id without fully committing yet

    doctor_profile = models.Doctor(
        user_id=new_user.id,
        specialization=payload.specialization,
        bio=payload.bio,
    )
    db.add(doctor_profile)
    db.commit()
    db.refresh(doctor_profile)

    return schemas.AdminCreateDoctorResponse(
        id=doctor_profile.id,
        email=new_user.email,
        full_name=new_user.full_name,
        specialization=doctor_profile.specialization,
        bio=doctor_profile.bio,
        temporary_password=password,
    )
