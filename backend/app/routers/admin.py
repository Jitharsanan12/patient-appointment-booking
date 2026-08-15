"""
Admin-only endpoints for managing accounts that the public can't create
themselves — right now, just creating doctor accounts.
"""

import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas, auth
from app.database import get_db
from app.email_utils import send_doctor_welcome_email
from app.routers import appointments as appointments_router

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

    # Email the doctor their login credentials. This happens AFTER the
    # account is safely committed to the database, and its result never
    # blocks the response — if it fails, email_sent comes back False and
    # the admin still has temporary_password on screen to share manually.
    email_sent = send_doctor_welcome_email(new_user.email, new_user.full_name, password)

    return schemas.AdminCreateDoctorResponse(
        id=doctor_profile.id,
        email=new_user.email,
        full_name=new_user.full_name,
        specialization=doctor_profile.specialization,
        bio=doctor_profile.bio,
        temporary_password=password,
        email_sent=email_sent,
    )


@router.post(
    "/appointments", response_model=schemas.AppointmentOut, status_code=status.HTTP_201_CREATED
)
def admin_book_appointment(
    payload: schemas.AdminBookAppointmentRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.admin)),
):
    """
    Lets an admin book an appointment on behalf of an existing patient
    (e.g. a phone booking). Runs through
    appointments.validate_and_create_appointment — the EXACT SAME
    past-date, real-open-slot, and double-booking checks that
    POST /appointments (the patient's own booking endpoint) uses, so this
    can never double-book a doctor or accept an invalid slot just because
    it came from the admin path instead.
    """
    patient = (
        db.query(models.User)
        .filter(models.User.id == payload.patient_id, models.User.role == models.UserRole.patient)
        .first()
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    new_appointment = appointments_router.validate_and_create_appointment(
        db, payload.patient_id, payload.doctor_id, payload.appointment_date, payload.reason
    )
    return appointments_router._to_out(new_appointment)


@router.get("/patients", response_model=list[schemas.PatientOut])
def list_patients(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.admin)),
):
    """Admin-only: every registered patient, for the admin dashboard's
    patient directory and the booking form's patient selector."""
    return (
        db.query(models.User)
        .filter(models.User.role == models.UserRole.patient)
        .order_by(models.User.full_name.asc())
        .all()
    )


@router.get("/patients/{patient_id}", response_model=list[schemas.AppointmentOut])
def get_patient_appointment_history(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.admin)),
):
    """
    Admin-only: one patient's full appointment history (every status —
    this is a history view, not just what's still scheduled). Reuses the
    same _with_relations eager-loading and _to_out response conversion
    that every other appointment-listing endpoint in appointments.py
    already uses, instead of a new, separately-maintained query.
    """
    patient = (
        db.query(models.User)
        .filter(models.User.id == patient_id, models.User.role == models.UserRole.patient)
        .first()
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    query = appointments_router._with_relations(
        db.query(models.Appointment).filter(models.Appointment.patient_id == patient_id)
    ).order_by(models.Appointment.appointment_date.desc())

    return [appointments_router._to_out(a) for a in query.all()]
