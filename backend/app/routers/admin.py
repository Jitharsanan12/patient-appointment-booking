"""
Admin-only endpoints for managing accounts that the public can't create
themselves — right now, just creating doctor accounts.
"""

import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

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


@router.put("/doctors/{doctor_id}", response_model=schemas.DoctorOut)
def update_doctor(
    doctor_id: int,
    payload: schemas.AdminUpdateDoctorRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.admin)),
):
    """
    Admin-only: edit a doctor's basic info (name/email/specialization/
    bio), keyed off doctor_id like every other doctor endpoint. No
    password field here on purpose — that stays on the existing password
    flows (see AdminUpdateDoctorRequest's docstring). Doesn't touch
    is_active, appointments, availability, or anything else about the
    account; this is purely an account-info edit layered on top of
    everything create_doctor/deactivate_doctor/reactivate_doctor above
    already do.
    """
    doctor = (
        db.query(models.Doctor)
        .options(joinedload(models.Doctor.user))
        .filter(models.Doctor.id == doctor_id)
        .first()
    )
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    # Same "is anyone else already using this email" check create_doctor
    # does, except scoped to exclude this doctor's OWN current row —
    # otherwise saving the form back unchanged (same email) would always
    # be rejected as "taken" by themselves.
    existing_user = (
        db.query(models.User)
        .filter(models.User.email == payload.email, models.User.id != doctor.user_id)
        .first()
    )
    if existing_user:
        raise HTTPException(status_code=400, detail="Email is already registered")

    doctor.user.email = payload.email
    doctor.user.full_name = payload.full_name
    doctor.specialization = payload.specialization
    doctor.bio = payload.bio
    db.commit()
    db.refresh(doctor)

    return schemas.DoctorOut(
        id=doctor.id,
        full_name=doctor.user.full_name,
        specialization=doctor.specialization,
        bio=doctor.bio,
        is_active=doctor.user.is_active,
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
        db,
        payload.patient_id,
        payload.doctor_id,
        payload.appointment_date,
        payload.reason,
        payload.visit_type,
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


@router.put("/patients/{patient_id}", response_model=schemas.PatientOut)
def update_patient(
    patient_id: int,
    payload: schemas.AdminUpdatePatientRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.admin)),
):
    """
    Admin-only: edit a patient's basic ACCOUNT info (name/email), not
    their medical profile — same role-filtered lookup as
    get_patient_appointment_history/deactivate_patient above, so this
    can never accidentally target a doctor or admin account. Doesn't
    touch is_active, appointments, or PatientProfile (date of birth,
    allergies, etc. — that's the patient's own to edit via PUT
    /patients/me/profile).
    """
    patient = (
        db.query(models.User)
        .filter(models.User.id == patient_id, models.User.role == models.UserRole.patient)
        .first()
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    existing_user = (
        db.query(models.User)
        .filter(models.User.email == payload.email, models.User.id != patient.id)
        .first()
    )
    if existing_user:
        raise HTTPException(status_code=400, detail="Email is already registered")

    patient.email = payload.email
    patient.full_name = payload.full_name
    db.commit()
    db.refresh(patient)
    return patient


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


@router.post("/patients/{patient_id}/deactivate", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.admin)),
):
    """
    Admin-only: deactivate any patient account. Unlike DELETE /auth/me
    (the patient's own self-service version in routers/auth.py), no
    password re-entry is required — the admin is already authenticated
    and authorized via require_role above. Filtering by
    role == patient means this can never accidentally target a doctor or
    another admin account, even if an arbitrary id is passed in.
    Appointments, profile data, and history are untouched — only
    is_active flips, exactly like the self-service path.
    """
    patient = (
        db.query(models.User)
        .filter(models.User.id == patient_id, models.User.role == models.UserRole.patient)
        .first()
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    patient.is_active = False
    db.commit()


@router.get("/doctors", response_model=list[schemas.DoctorOut])
def list_all_doctors(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.admin)),
):
    """
    Admin-only: every doctor regardless of active status, for the "Manage
    Doctors" admin page. This is deliberately separate from the public
    GET /doctors (routers/doctors.py), which only ever returns active
    doctors — the admin needs to see deactivated ones too, to review their
    status and appointment history.
    """
    doctors = db.query(models.Doctor).options(joinedload(models.Doctor.user)).all()
    return [
        schemas.DoctorOut(
            id=d.id,
            full_name=d.user.full_name,
            specialization=d.specialization,
            bio=d.bio,
            is_active=d.user.is_active,
        )
        for d in doctors
    ]


@router.post("/doctors/{doctor_id}/deactivate", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_doctor(
    doctor_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.admin)),
):
    """
    Admin-only: deactivate a doctor account, keyed off doctor_id (the
    Doctor table's own id — the same id the frontend already uses for
    every other doctor endpoint, never the underlying User id). Once
    deactivated, the doctor drops out of GET /doctors and
    compute_available_slots returns no slots for them (see
    routers/doctors.py), while their existing appointments and history
    stay fully intact and visible to admin via GET /admin/patients/{id}
    and the doctor's own appointment views.
    """
    doctor = (
        db.query(models.Doctor)
        .options(joinedload(models.Doctor.user))
        .filter(models.Doctor.id == doctor_id)
        .first()
    )
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    doctor.user.is_active = False
    db.commit()


@router.post("/doctors/{doctor_id}/reactivate", status_code=status.HTTP_204_NO_CONTENT)
def reactivate_doctor(
    doctor_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.admin)),
):
    """
    Admin-only: the reverse of deactivate_doctor above, same doctor_id
    lookup. Deliberately has no patient-style self-reactivation
    counterpart — POST /auth/reactivate (routers/auth.py) explicitly
    rejects any non-patient role with a "contact an admin" 403, so
    bringing a doctor back can only ever happen here, through an
    authenticated admin.
    """
    doctor = (
        db.query(models.Doctor)
        .options(joinedload(models.Doctor.user))
        .filter(models.Doctor.id == doctor_id)
        .first()
    )
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    doctor.user.is_active = True
    db.commit()
