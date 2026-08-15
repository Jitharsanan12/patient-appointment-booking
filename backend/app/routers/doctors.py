"""
Endpoints for browsing doctors, managing a doctor's weekly availability,
and computing actual bookable time slots for a given date.
"""

from datetime import date, datetime, timedelta

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


@router.put("/{doctor_id}/availability/{availability_id}", response_model=schemas.AvailabilityOut)
def update_availability(
    doctor_id: int,
    availability_id: int,
    payload: schemas.AvailabilityCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.doctor)),
):
    """
    Edits an existing availability window in place, rather than deleting
    and recreating it. Note: this only changes the recurring weekly
    pattern going forward — it does NOT touch any appointments already
    booked under the old window. If a doctor narrows their hours, existing
    bookings outside the new range stay exactly as they were; only NEW
    bookings are validated against the updated window.
    """
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

    availability.day_of_week = payload.day_of_week
    availability.start_time = payload.start_time
    availability.end_time = payload.end_time
    availability.slot_duration_minutes = payload.slot_duration_minutes

    db.commit()
    db.refresh(availability)
    return availability


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


# ---------- Visit types & per-doctor durations ----------

# Used when a doctor hasn't set their own duration for a type yet, so
# booking still works out of the box for every existing doctor.
DEFAULT_VISIT_TYPE_DURATIONS = {
    models.VisitType.follow_up: 15,
    models.VisitType.consultation: 30,
    models.VisitType.new_patient: 45,
}


def get_visit_type_duration(db: Session, doctor_id: int, visit_type: models.VisitType) -> int:
    """
    Minutes THIS doctor takes for the given visit type — their own
    configured value if they've set one, otherwise the default. This is
    the single place duration gets resolved, used by both
    compute_available_slots below and
    appointments.validate_and_create_appointment, so a booking is always
    checked against the exact same duration the patient was shown.
    """
    row = (
        db.query(models.DoctorVisitTypeDuration)
        .filter(
            models.DoctorVisitTypeDuration.doctor_id == doctor_id,
            models.DoctorVisitTypeDuration.visit_type == visit_type.value,
        )
        .first()
    )
    return row.duration_minutes if row else DEFAULT_VISIT_TYPE_DURATIONS[visit_type]


def _all_visit_type_durations(db: Session, doctor_id: int) -> list[schemas.VisitTypeDurationOut]:
    """Every visit type with this doctor's effective duration, in a
    stable order — always all three, whether or not the doctor has
    customized any of them."""
    return [
        schemas.VisitTypeDurationOut(
            visit_type=visit_type,
            duration_minutes=get_visit_type_duration(db, doctor_id, visit_type),
        )
        for visit_type in models.VisitType
    ]


@router.get(
    "/{doctor_id}/visit-type-durations", response_model=list[schemas.VisitTypeDurationOut]
)
def list_visit_type_durations(
    doctor_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Any logged-in user can view a doctor's per-visit-type durations —
    same reasoning as list_availability above: not sensitive, and needed
    to understand what's actually bookable."""
    _get_doctor_or_404(db, doctor_id)
    return _all_visit_type_durations(db, doctor_id)


@router.put(
    "/{doctor_id}/visit-type-durations", response_model=list[schemas.VisitTypeDurationOut]
)
def update_visit_type_durations(
    doctor_id: int,
    payload: list[schemas.VisitTypeDurationUpdate],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_role(models.UserRole.doctor)),
):
    """
    Lets a doctor set/edit their own duration for one or more visit types
    in a single request (upsert: creates the row the first time a type is
    customized, updates it after that). Returns the full resolved set of
    all three types afterward.
    """
    _get_doctor_or_404(db, doctor_id)
    _require_own_doctor_profile(current_user, doctor_id, db)

    for item in payload:
        row = (
            db.query(models.DoctorVisitTypeDuration)
            .filter(
                models.DoctorVisitTypeDuration.doctor_id == doctor_id,
                models.DoctorVisitTypeDuration.visit_type == item.visit_type.value,
            )
            .first()
        )
        if row:
            row.duration_minutes = item.duration_minutes
        else:
            db.add(
                models.DoctorVisitTypeDuration(
                    doctor_id=doctor_id,
                    visit_type=item.visit_type.value,
                    duration_minutes=item.duration_minutes,
                )
            )
    db.commit()

    return _all_visit_type_durations(db, doctor_id)


# ---------- Computing actual bookable slots ----------

# Granularity for stepping candidate start times through a free gap.
# Deliberately independent of any per-doctor setting (including the
# now-legacy Availability.slot_duration_minutes below) — see the
# explanation on compute_available_slots.
SLOT_STEP_MINUTES = 15


def _free_gaps_in_window(
    window_start: datetime, window_end: datetime, booked_intervals: list[tuple[datetime, datetime]]
) -> list[tuple[datetime, datetime]]:
    """
    Subtracts every booked (start, end) interval from one working-hours
    window, leaving the doctor's actual free gaps inside it. This is the
    "gap-based scheduling" part: a gap is however much continuous free
    time is genuinely left, not a fixed pre-chopped grid.

    booked_intervals must already be sorted by start time.
    """
    gaps = []
    cursor = window_start
    for booked_start, booked_end in booked_intervals:
        clipped_start = max(booked_start, window_start)
        clipped_end = min(booked_end, window_end)
        if clipped_start >= clipped_end:
            continue  # this booking doesn't actually fall inside this window
        if clipped_start > cursor:
            gaps.append((cursor, clipped_start))
        cursor = max(cursor, clipped_end)
    if cursor < window_end:
        gaps.append((cursor, window_end))
    return gaps


def compute_available_slots(
    db: Session, doctor_id: int, target_date: date, duration_minutes: int
) -> list[dict]:
    """
    Builds the list of bookable slots for a doctor on a specific date,
    for a visit that takes duration_minutes, using gap-based scheduling:

    1. Check whether the doctor has marked target_date as a one-off
       unavailable day (AvailabilityOverride) — if so, no slots at all.
    2. Find the doctor's recurring availability windows for that day of
       the week — their nominal working hours.
    3. Subtract every already-booked ("scheduled") appointment's ACTUAL
       time range (appointment_date to appointment_date + its own
       duration_minutes) from those windows, leaving the doctor's real
       free gaps for the day (see _free_gaps_in_window).
    4. Step a candidate start time through each gap in SLOT_STEP_MINUTES
       increments, keeping a candidate only if [candidate, candidate +
       duration_minutes] fits entirely inside that ONE gap — never
       spanning two gaps — and isn't already in the past.

    Note: Availability.slot_duration_minutes (set per availability
    window) is NOT used here anymore — stepping granularity is now the
    fixed SLOT_STEP_MINUTES above, and how much room a booking actually
    needs comes from the visit type's duration instead. The field still
    exists and is still fully editable in the availability manager (so
    nothing there breaks), it just no longer drives slot computation.

    Returns a list of {"start_time": datetime, "end_time": datetime}
    dicts, sorted earliest first. Reused by both the /available-slots
    endpoint and validate_and_create_appointment, which validates a
    booking request against this exact same list.
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

    # Every appointment already booked for this doctor on this date — its
    # own [start, start + duration) range is what actually gets removed
    # from the working-hours windows above. All naive clinic-local times,
    # same as appointment_date itself — no tzinfo anywhere in this file.
    day_start = datetime.combine(target_date, datetime.min.time())
    day_end = day_start + timedelta(days=1)
    booked_appointments = (
        db.query(models.Appointment)
        .filter(
            models.Appointment.doctor_id == doctor_id,
            models.Appointment.status == models.AppointmentStatus.scheduled,
            models.Appointment.appointment_date >= day_start,
            models.Appointment.appointment_date < day_end,
        )
        .order_by(models.Appointment.appointment_date)
        .all()
    )
    booked_intervals = [
        (a.appointment_date, a.appointment_date + timedelta(minutes=a.duration_minutes))
        for a in booked_appointments
    ]

    # datetime.now() here is deliberately naive/local (not
    # datetime.now(timezone.utc)) — it's compared directly against the
    # naive clinic-local appointment_date values above. This assumes the
    # server process's own system clock is set to the clinic's timezone;
    # if you deploy somewhere with a different system timezone, set that
    # server's TZ (e.g. TZ=Asia/Colombo) to match the clinic.
    now = datetime.now()
    duration = timedelta(minutes=duration_minutes)
    step = timedelta(minutes=SLOT_STEP_MINUTES)
    slots = []

    for window in windows:
        window_start = datetime.combine(target_date, window.start_time)
        window_end = datetime.combine(target_date, window.end_time)

        for gap_start, gap_end in _free_gaps_in_window(window_start, window_end, booked_intervals):
            candidate = gap_start
            while candidate + duration <= gap_end:
                if candidate >= now:
                    slots.append({"start_time": candidate, "end_time": candidate + duration})
                candidate += step

    slots.sort(key=lambda s: s["start_time"])
    return slots


@router.get("/{doctor_id}/available-slots", response_model=list[schemas.SlotOut])
def get_available_slots(
    doctor_id: int,
    target_date: date = Query(..., alias="date"),
    visit_type: models.VisitType = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _get_doctor_or_404(db, doctor_id)
    duration_minutes = get_visit_type_duration(db, doctor_id, visit_type)
    return compute_available_slots(db, doctor_id, target_date, duration_minutes)
