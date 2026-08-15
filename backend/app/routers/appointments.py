"""
Endpoints for booking, viewing, cancelling, and updating appointments.

Access rules enforced here:
- Patients can only book/view/cancel their OWN appointments.
- Doctors can only view/update appointments assigned to THEM.
- Admins can view everything.
- No booking a doctor who's already booked at that exact date/time.
- No booking a date/time in the past.
"""

import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session, joinedload

from app import models, schemas, auth, s3_utils, email_utils
from app.database import get_db
from app.routers.doctors import compute_available_slots

router = APIRouter(prefix="/appointments", tags=["appointments"])


def _format_appointment_time(appointment_date: datetime) -> str:
    """Human-readable date/time for cancellation emails, e.g. 'August 17, 2026 at 08:30 PM'."""
    return appointment_date.strftime("%B %d, %Y at %I:%M %p")


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
        has_attachment=appointment.file_key is not None,
        file_name=appointment.file_name,
    )


def _with_relations(query):
    """Shared eager-loading so we don't run extra queries per row for names."""
    return query.options(
        joinedload(models.Appointment.doctor).joinedload(models.Doctor.user),
        joinedload(models.Appointment.patient),
    )


def validate_and_create_appointment(
    db: Session, patient_id: int, doctor_id: int, appointment_date: datetime, reason: str
) -> models.Appointment:
    """
    Core booking logic, shared by every path that can create an
    appointment: validates the requested slot and creates the row.

    Deliberately factored out of book_appointment below (rather than left
    inline) so that POST /admin/appointments (an admin booking on a
    patient's behalf — see routers/admin.py) can run through the EXACT
    SAME checks instead of a second, potentially-drifting copy of them.
    Only who the patient_id comes from differs between the two callers —
    the logged-in user for a normal booking, an admin-selected patient
    for an admin one.
    """
    # If the client sent a date with no timezone info, treat it as UTC so we
    # can safely compare it to "now" below.
    if appointment_date.tzinfo is None:
        appointment_date = appointment_date.replace(tzinfo=timezone.utc)

    # Rule: no booking in the past.
    if appointment_date < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Cannot book an appointment in the past")

    doctor = db.query(models.Doctor).filter(models.Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    # Rule: the requested time must be one of the doctor's actual bookable
    # slots (derived from their availability windows, minus anything already
    # booked). This reuses the exact same logic that powers the
    # /doctors/{id}/available-slots endpoint the frontend calls, so what the
    # patient sees as "available" is always what the backend will accept.
    available_slots = compute_available_slots(db, doctor_id, appointment_date.date())
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
            models.Appointment.doctor_id == doctor_id,
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
        patient_id=patient_id,
        doctor_id=doctor_id,
        appointment_date=appointment_date,
        reason=reason,
        status=models.AppointmentStatus.scheduled,
    )
    db.add(new_appointment)
    db.commit()
    db.refresh(new_appointment)
    return new_appointment


@router.post("", response_model=schemas.AppointmentOut, status_code=status.HTTP_201_CREATED)
def book_appointment(
    payload: schemas.AppointmentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.patient)),
):
    new_appointment = validate_and_create_appointment(
        db, current_user.id, payload.doctor_id, payload.appointment_date, payload.reason
    )
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

    # Notify the assigned doctor that their slot just freed up. A failed
    # email is only logged (see email_utils._send_email) — it never turns
    # a successful cancellation into a failed request.
    email_utils.send_appointment_cancelled_email_to_doctor(
        to_email=appointment.doctor.user.email,
        doctor_name=appointment.doctor.user.full_name,
        patient_name=appointment.patient.full_name,
        appointment_time=_format_appointment_time(appointment.appointment_date),
    )

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

    # Only a cancellation needs a notification — marking an appointment
    # completed doesn't. Same fail-soft behavior as the patient-cancel
    # path above: a failed email never fails this request.
    if payload.status == models.AppointmentStatus.cancelled:
        email_utils.send_appointment_cancelled_email_to_patient(
            to_email=appointment.patient.email,
            patient_name=appointment.patient.full_name,
            doctor_name=appointment.doctor.user.full_name,
            appointment_time=_format_appointment_time(appointment.appointment_date),
        )

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


@router.post("/{appointment_id}/admin-cancel", response_model=schemas.AppointmentOut)
def admin_cancel_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.admin)),
):
    """
    Lets an admin cancel any appointment on the patient's or doctor's
    behalf. There was previously no admin cancellation capability at
    all — this mirrors the same validation as cancel_appointment above
    (only a still-scheduled appointment can be cancelled), just without
    the "only the owning patient" restriction, and notifies BOTH the
    patient and the doctor by email instead of just one side.
    """
    appointment = (
        _with_relations(db.query(models.Appointment))
        .filter(models.Appointment.id == appointment_id)
        .first()
    )
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")

    if appointment.status != models.AppointmentStatus.scheduled:
        raise HTTPException(status_code=400, detail="Only scheduled appointments can be cancelled")

    appointment.status = models.AppointmentStatus.cancelled
    db.commit()
    db.refresh(appointment)

    appointment_time = _format_appointment_time(appointment.appointment_date)
    email_utils.send_appointment_cancelled_email_to_doctor(
        to_email=appointment.doctor.user.email,
        doctor_name=appointment.doctor.user.full_name,
        patient_name=appointment.patient.full_name,
        appointment_time=appointment_time,
    )
    email_utils.send_appointment_cancelled_email_to_patient(
        to_email=appointment.patient.email,
        patient_name=appointment.patient.full_name,
        doctor_name=appointment.doctor.user.full_name,
        appointment_time=appointment_time,
    )

    return _to_out(appointment)


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


@router.post("/{appointment_id}/attachment", response_model=schemas.AppointmentOut)
async def upload_attachment(
    appointment_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.patient)),
):
    """
    Lets the patient who booked an appointment attach a supporting file to
    it (e.g. a lab report or photo) — either right after booking, or any
    time later. Kept as its own endpoint rather than folded into
    POST /appointments so that existing booking logic (JSON body) is
    completely untouched; file uploads need multipart/form-data instead,
    which is what `file: UploadFile = File(...)` expects here.
    """
    appointment = (
        _with_relations(db.query(models.Appointment))
        .filter(models.Appointment.id == appointment_id)
        .first()
    )
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")

    # Ownership check, same rule as cancel_appointment above: only the
    # patient who booked it may attach a file to it.
    if appointment.patient_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="You can only attach a file to your own appointment"
        )

    if file.content_type not in s3_utils.ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Only PDF, JPG, and PNG files are allowed.",
        )

    # Read the upload into memory so we can check its real size against the
    # 5MB cap before spending time/bandwidth uploading it to S3. UploadFile
    # doesn't expose a reliable size up front (browsers can lie in headers),
    # so reading it fully is the simple, correct way to enforce this for a
    # small 5MB limit; a much larger limit would call for streaming checks.
    contents = await file.read()
    if len(contents) > s3_utils.MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File is too large (max 5MB)")

    object_key = s3_utils.build_object_key(appointment_id, file.content_type)
    s3_utils.upload_fileobj(io.BytesIO(contents), object_key, file.content_type)

    appointment.file_key = object_key
    appointment.file_name = file.filename
    db.commit()
    db.refresh(appointment)

    return _to_out(appointment)


@router.get("/{appointment_id}/attachment", response_model=schemas.AttachmentDownloadOut)
def get_attachment_download_url(
    appointment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Returns a short-lived, signed S3 URL for downloading an appointment's
    attachment — never the file itself, and never a permanent link, since
    the bucket is private. Access follows the exact same rule as viewing
    the appointment itself (GET /appointments/{id} above): the owning
    patient, the assigned doctor, or an admin.
    """
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

    if not appointment.file_key:
        raise HTTPException(status_code=404, detail="This appointment has no attachment")

    url = s3_utils.generate_presigned_download_url(appointment.file_key)
    return schemas.AttachmentDownloadOut(url=url, file_name=appointment.file_name)
