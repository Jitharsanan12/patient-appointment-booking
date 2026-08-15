"""
Endpoints for a patient's medical profile: date of birth, phone number,
allergies, existing conditions, and emergency contact info.

Access rules enforced here:
- A patient can view and edit only THEIR OWN profile (GET/PUT /me/profile).
- A doctor can view (read-only) the profile of a patient they have an
  actual appointment with — not any patient.
- An admin can view any patient's profile.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas, auth
from app.database import get_db

router = APIRouter(prefix="/patients", tags=["patients"])


def _get_or_create_profile(db: Session, patient_user_id: int) -> models.PatientProfile:
    """
    Looks up a patient's profile row, creating an empty one on first
    access if it doesn't exist yet. Only used for the patient's OWN
    GET/PUT below — a brand new patient has never had a reason to have a
    row here, and both endpoints need one to read from or write onto.
    """
    profile = (
        db.query(models.PatientProfile)
        .filter(models.PatientProfile.user_id == patient_user_id)
        .first()
    )
    if not profile:
        profile = models.PatientProfile(user_id=patient_user_id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@router.get("/me/profile", response_model=schemas.PatientProfileOut)
def get_my_profile(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.patient)),
):
    """Lets a patient view their own medical profile."""
    return _get_or_create_profile(db, current_user.id)


@router.put("/me/profile", response_model=schemas.PatientProfileOut)
def update_my_profile(
    payload: schemas.PatientProfileUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.patient)),
):
    """Lets a patient update their own medical profile. Any field left out
    of the request body is cleared to null, matching how a real edit form
    (which always submits every field) is expected to behave."""
    profile = _get_or_create_profile(db, current_user.id)
    for field, value in payload.model_dump().items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/{patient_id}/profile", response_model=schemas.PatientProfileOut)
def get_patient_profile(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Lets a doctor view (read-only) the profile of a patient they have an
    appointment with, or an admin view any patient's profile. patient_id
    is the patient's USER id — the same id used as Appointment.patient_id
    elsewhere in the app.
    """
    patient = (
        db.query(models.User)
        .filter(models.User.id == patient_id, models.User.role == models.UserRole.patient)
        .first()
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    is_admin = current_user.role == models.UserRole.admin

    is_assigned_doctor = False
    if current_user.role == models.UserRole.doctor:
        doctor_profile = (
            db.query(models.Doctor).filter(models.Doctor.user_id == current_user.id).first()
        )
        if doctor_profile:
            is_assigned_doctor = (
                db.query(models.Appointment)
                .filter(
                    models.Appointment.doctor_id == doctor_profile.id,
                    models.Appointment.patient_id == patient_id,
                )
                .first()
                is not None
            )

    if not (is_admin or is_assigned_doctor):
        raise HTTPException(
            status_code=403,
            detail="You can only view profiles of patients you have an appointment with",
        )

    profile = (
        db.query(models.PatientProfile)
        .filter(models.PatientProfile.user_id == patient_id)
        .first()
    )
    if not profile:
        # This patient has never saved a profile — return an empty one
        # (all fields null) rather than 404, same as GET /me/profile would
        # for them. Deliberately NOT persisted here: a read by a doctor or
        # admin shouldn't create a database row as a side effect.
        return schemas.PatientProfileOut()
    return profile
