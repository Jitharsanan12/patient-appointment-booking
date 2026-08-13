"""
Endpoints for browsing doctors, managing a doctor's weekly availability,
and computing actual bookable time slots for a given date.
"""

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app import models, schemas, auth
from app.database import get_db

router = APIRouter(prefix="/doctors", tags=["doctors"])


@router.get("", response_model=list[schemas.DoctorOut])
def list_doctors(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    # joinedload fetches the related User (for full_name) in the same query,
    # instead of firing off a separate query per doctor.
    doctors = db.query(models.Doctor).options(joinedload(models.Doctor.user)).all()

    return [
        schemas.DoctorOut(
            id=d.id,
            full_name=d.user.full_name,
            specialization=d.specialization,
            bio=d.bio,
        )
        for d in doctors
    ]


@router.get("/me", response_model=schemas.DoctorOut)
def get_my_doctor_profile(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.doctor)),
):
    """Lets a logged-in doctor find their own doctor_id (needed to manage their availability)."""
    doctor = (
        db.query(models.Doctor)
        .options(joinedload(models.Doctor.user))
        .filter(models.Doctor.user_id == current_user.id)
        .first()
    )
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor profile not found for this account")

    return schemas.DoctorOut(
        id=doctor.id,
        full_name=doctor.user.full_name,
        specialization=doctor.specialization,
        bio=doctor.bio,
    )


def _get_doctor_or_404(db: Session, doctor_id: int) -> models.Doctor:
    doctor = db.query(models.Doctor).filter(models.Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    return doctor


def _require_own_doctor_profile(current_user: models.User, doctor_id: int, db: Session) -> None:
    """Raises 403 unless the logged-in doctor IS the doctor identified by doctor_id."""
    doctor_profile = db.query(models.Doctor).filter(models.Doctor.user_id == current_user.id).first()
    if not doctor_profile or doctor_profile.id != doctor_id:
        raise HTTPException(
            status_code=403, detail="You can only manage your own availability"
        )


# ---------- Availability management (doctor-only, own profile) ----------

@router.post(
    "/{doctor_id}/availability",
    response_model=schemas.AvailabilityOut,
    status_code=201,
)
def create_availability(
    doctor_id: int,
    payload: schemas.AvailabilityCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.doctor)),
):
    _get_doctor_or_404(db, doctor_id)
    _require_own_doctor_profile(current_user, doctor_id, db)

    availability = models.Availability(
        doctor_id=doctor_id,
        day_of_week=payload.day_of_week,
        start_time=payload.start_time,
        end_time=payload.end_time,
        slot_duration_minutes=payload.slot_duration_minutes,
    )
    db.add(availability)
    db.commit()
    db.refresh(availability)
    return availability


@router.get("/{doctor_id}/availability", response_model=list[schemas.AvailabilityOut])
def list_availability(
    doctor_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Any logged-in user can view a doctor's weekly availability windows —
    patients need this to understand when a doctor generally works, and it
    contains no sensitive information (just recurring time ranges).
    """
    _get_doctor_or_404(db, doctor_id)
    return (
        db.query(models.Availability)
        .filter(models.Availability.doctor_id == doctor_id)
        .order_by(models.Availability.day_of_week, models.Availability.start_time)
        .all()
    )


@router.delete("/{doctor_id}/availability/{availability_id}", status_code=204)
def delete_availability(
    doctor_id: int,
    availability_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.doctor)),
):
    _get_doctor_or_404(db, doctor_id)
    _require_own_doctor_profile(current_user, doctor_id, db)

    availability = (
        db.query(models.Availability)
        .filter(
            models.Availability.id == availability_id,
            models.Availability.doctor_id == doctor_id,
        )
        .first()
    )
    if not availability:
        raise HTTPException(status_code=404, detail="Availability window not found")

    db.delete(availability)
    db.commit()
    return None


# ---------- One-off unavailable dates (doctor-only, own profile) ----------

@router.post(
    "/{doctor_id}/unavailable-dates",
    response_model=schemas.UnavailableDateOut,
    status_code=201,
)
def create_unavailable_date(
    doctor_id: int,
    payload: schemas.UnavailableDateCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.doctor)),
):
    _get_doctor_or_404(db, doctor_id)
    _require_own_doctor_profile(current_user, doctor_id, db)

    existing = (
        db.query(models.AvailabilityOverride)
        .filter(
            models.AvailabilityOverride.doctor_id == doctor_id,
            models.AvailabilityOverride.date == payload.date,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="This date is already marked unavailable")

    override = models.AvailabilityOverride(
        doctor_id=doctor_id, date=payload.date, reason=payload.reason
    )
    db.add(override)
    db.commit()
    db.refresh(override)
    return override


@router.get("/{doctor_id}/unavailable-dates", response_model=list[schemas.UnavailableDateOut])
def list_unavailable_dates(
    doctor_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Any logged-in user can view a doctor's blocked dates (needed so patients see why a date has no slots)."""
    _get_doctor_or_404(db, doctor_id)
    return (
        db.query(models.AvailabilityOverride)
        .filter(models.AvailabilityOverride.doctor_id == doctor_id)
        .order_by(models.AvailabilityOverride.date)
        .all()
    )


@router.delete("/{doctor_id}/unavailable-dates/{override_id}", status_code=204)
def delete_unavailable_date(
    doctor_id: int,
    override_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.doctor)),
):
    _get_doctor_or_404(db, doctor_id)
    _require_own_doctor_profile(current_user, doctor_id, db)

    override = (
        db.query(models.AvailabilityOverride)
        .filter(
            models.AvailabilityOverride.id == override_id,
            models.AvailabilityOverride.doctor_id == doctor_id,
        )
        .first()
    )
    if not override:
        raise HTTPException(status_code=404, detail="Unavailable date not found")

    db.delete(override)
    db.commit()
    return None


# ---------- Computing actual bookable slots ----------

def compute_available_slots(db: Session, doctor_id: int, target_date: date) -> list[dict]:
    """
    Builds the list of bookable slots for a doctor on a specific date:
    1. Check whether the doctor has marked target_date as a one-off
       unavailable day (AvailabilityOverride) — if so, there are no slots
       at all, no matter what their weekly pattern says.
    2. Find the doctor's recurring availability windows for that day of the week.
    3. Chop each window into slot_duration_minutes-sized pieces.
    4. Drop any piece that's already booked (a "scheduled" appointment exists then).
    5. Drop any piece that's already in the past.
    Returns a list of {"start_time": datetime, "end_time": datetime} dicts,
    sorted earliest first. This is reused by both the /available-slots
    endpoint AND the booking endpoint (which uses it to validate requests).
    """
    is_blocked = (
        db.query(models.AvailabilityOverride)
        .filter(
            models.AvailabilityOverride.doctor_id == doctor_id,
            models.AvailabilityOverride.date == target_date,
        )
        .first()
        is not None
    )
    if is_blocked:
        return []

    day_of_week = target_date.weekday()  # Monday=0 ... Sunday=6, same as our storage convention

    windows = (
        db.query(models.Availability)
        .filter(
            models.Availability.doctor_id == doctor_id,
            models.Availability.day_of_week == day_of_week,
        )
        .all()
    )
    if not windows:
        return []

    # Every appointment already booked for this doctor on this date, so we
    # can skip any slot whose start time matches one of these.
    day_start = datetime.combine(target_date, datetime.min.time(), tzinfo=timezone.utc)
    day_end = day_start + timedelta(days=1)
    booked_appointments = (
        db.query(models.Appointment)
        .filter(
            models.Appointment.doctor_id == doctor_id,
            models.Appointment.status == models.AppointmentStatus.scheduled,
            models.Appointment.appointment_date >= day_start,
            models.Appointment.appointment_date < day_end,
        )
        .all()
    )
    booked_start_times = {a.appointment_date for a in booked_appointments}

    now = datetime.now(timezone.utc)
    slots = []

    for window in windows:
        duration = timedelta(minutes=window.slot_duration_minutes)
        slot_start = datetime.combine(target_date, window.start_time, tzinfo=timezone.utc)
        window_end = datetime.combine(target_date, window.end_time, tzinfo=timezone.utc)

        while slot_start + duration <= window_end:
            if slot_start not in booked_start_times and slot_start >= now:
                slots.append({"start_time": slot_start, "end_time": slot_start + duration})
            slot_start += duration

    slots.sort(key=lambda s: s["start_time"])
    return slots


@router.get("/{doctor_id}/available-slots", response_model=list[schemas.SlotOut])
def get_available_slots(
    doctor_id: int,
    target_date: date = Query(..., alias="date"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _get_doctor_or_404(db, doctor_id)
    return compute_available_slots(db, doctor_id, target_date)
