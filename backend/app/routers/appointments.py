"""
Endpoints for booking, viewing, cancelling, and updating appointments.

Access rules enforced here:
- Patients can only book/view/cancel their OWN appointments.
- Doctors can only view/update appointments assigned to THEM.
- Admins can view everything.
- No booking a doctor who's already booked at that exact date/time.
- No booking a date/time in the past.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app import models, schemas, auth
from app.database import get_db
from app.routers.doctors import compute_available_slots

router = APIRouter(prefix="/appointments", tags=["appointments"])


def _to_out(appointment: models.Appointment) -> schemas.AppointmentOut:
    """Converts a DB Appointment (with doctor/patient loaded) into the API response shape."""
    return schemas.AppointmentOut(
        id=appointment.id,
        doctor_id=appointment.doctor_id,
        doctor_name=appointment.doctor.user.full_name,
        patient_id=appointment.patient_id,
        patient_name=appointment.patient.full_name,
        appointment_date=appointment.appointment_date,
        reason=appointment.reason,
        status=appointment.status,
    )


def _with_relations(query):
    """Shared eager-loading so we don't run extra queries per row for names."""
    return query.options(
        joinedload(models.Appointment.doctor).joinedload(models.Doctor.user),
        joinedload(models.Appointment.patient),
    )


@router.post("", response_model=schemas.AppointmentOut, status_code=status.HTTP_201_CREATED)
def book_appointment(
    payload: schemas.AppointmentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.patient)),
):
    appointment_date = payload.appointment_date
    # If the client sent a date with no timezone info, treat it as UTC so we
    # can safely compare it to "now" below.
    if appointment_date.tzinfo is None:
        appointment_date = appointment_date.replace(tzinfo=timezone.utc)

    # Rule: no booking in the past.
    if appointment_date < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Cannot book an appointment in the past")

    doctor = db.query(models.Doctor).filter(models.Doctor.id == payload.doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    # Rule: the requested time must be one of the doctor's actual bookable
    # slots (derived from their availability windows, minus anything already
    # booked). This reuses the exact same logic that powers the
    # /doctors/{id}/available-slots endpoint the frontend calls, so what the
    # patient sees as "available" is always what the backend will accept.
    available_slots = compute_available_slots(db, payload.doctor_id, appointment_date.date())
    if not any(slot["start_time"] == appointment_date for slot in available_slots):
        raise HTTPException(
            status_code=400,
            detail="This time is not an available slot for this doctor. "
            "Please choose one of the doctor's open slots.",
        )

    # Rule: no double-booking the same doctor at the same date/time.
    # (Only counts appointments that are still "scheduled" — a cancelled
    # slot frees up the time.)
    conflict = (
        db.query(models.Appointment)
        .filter(
            models.Appointment.doctor_id == payload.doctor_id,
            models.Appointment.appointment_date == appointment_date,
            models.Appointment.status == models.AppointmentStatus.scheduled,
        )
        .first()
    )
    if conflict:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This doctor is already booked at that date and time",
        )

    new_appointment = models.Appointment(
        patient_id=current_user.id,
        doctor_id=payload.doctor_id,
        appointment_date=appointment_date,
        reason=payload.reason,
        status=models.AppointmentStatus.scheduled,
    )
    db.add(new_appointment)
    db.commit()
    db.refresh(new_appointment)

    return _to_out(new_appointment)


@router.get("/me", response_model=list[schemas.AppointmentOut])
def my_upcoming_appointments(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.patient)),
):
    """A patient's own upcoming (still-scheduled, not-yet-passed) appointments."""
    query = _with_relations(
        db.query(models.Appointment).filter(
            models.Appointment.patient_id == current_user.id,
            models.Appointment.status == models.AppointmentStatus.scheduled,
            models.Appointment.appointment_date >= datetime.now(timezone.utc),
        )
    ).order_by(models.Appointment.appointment_date.asc())

    return [_to_out(a) for a in query.all()]


@router.post("/{appointment_id}/cancel", response_model=schemas.AppointmentOut)
def cancel_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.patient)),
):
    appointment = (
        _with_relations(db.query(models.Appointment))
        .filter(models.Appointment.id == appointment_id)
        .first()
    )
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")

    # Ownership check: a patient may only cancel THEIR OWN appointment.
    if appointment.patient_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only cancel your own appointments")

    if appointment.status != models.AppointmentStatus.scheduled:
        raise HTTPException(status_code=400, detail="Only scheduled appointments can be cancelled")

    appointment.status = models.AppointmentStatus.cancelled
    db.commit()
    db.refresh(appointment)
    return _to_out(appointment)


@router.get("/doctor/me", response_model=list[schemas.AppointmentOut])
def my_assigned_appointments(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.doctor)),
):
    """A doctor's own assigned appointments."""
    doctor_profile = (
        db.query(models.Doctor).filter(models.Doctor.user_id == current_user.id).first()
    )
    if not doctor_profile:
        raise HTTPException(status_code=404, detail="Doctor profile not found for this account")

    query = _with_relations(
        db.query(models.Appointment).filter(models.Appointment.doctor_id == doctor_profile.id)
    ).order_by(models.Appointment.appointment_date.asc())

    return [_to_out(a) for a in query.all()]


@router.patch("/{appointment_id}/status", response_model=schemas.AppointmentOut)
def update_appointment_status(
    appointment_id: int,
    payload: schemas.AppointmentStatusUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.doctor)),
):
    """Lets a doctor mark one of THEIR OWN appointments completed or cancelled."""
    appointment = (
        _with_relations(db.query(models.Appointment))
        .filter(models.Appointment.id == appointment_id)
        .first()
    )
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")

    doctor_profile = (
        db.query(models.Doctor).filter(models.Doctor.user_id == current_user.id).first()
    )
    if not doctor_profile or appointment.doctor_id != doctor_profile.id:
        raise HTTPException(
            status_code=403, detail="You can only update appointments assigned to you"
        )

    appointment.status = payload.status
    db.commit()
    db.refresh(appointment)
    return _to_out(appointment)


@router.get("", response_model=list[schemas.AppointmentOut])
def list_all_appointments(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.admin)),
):
    """Admin-only: view every appointment in the system."""
    query = _with_relations(db.query(models.Appointment)).order_by(
        models.Appointment.appointment_date.desc()
    )
    return [_to_out(a) for a in query.all()]


@router.get("/{appointment_id}", response_model=schemas.AppointmentOut)
def get_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Get one appointment's details — only the involved patient, the assigned doctor, or an admin may view it."""
    appointment = (
        _with_relations(db.query(models.Appointment))
        .filter(models.Appointment.id == appointment_id)
        .first()
    )
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")

    is_owning_patient = current_user.role == models.UserRole.patient and appointment.patient_id == current_user.id
    is_assigned_doctor = (
        current_user.role == models.UserRole.doctor
        and appointment.doctor.user_id == current_user.id
    )
    is_admin = current_user.role == models.UserRole.admin

    if not (is_owning_patient or is_assigned_doctor or is_admin):
        raise HTTPException(status_code=403, detail="You do not have access to this appointment")

    return _to_out(appointment)
