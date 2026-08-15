"""
Tests for variable-duration, gap-based appointment scheduling.

Runs against an in-memory SQLite database (created fresh per test via the
`db` fixture below) instead of the real Neon database — fast, isolated,
and safe to run repeatedly without touching real data. Exercises the
actual application functions (validate_and_create_appointment,
compute_available_slots, get_visit_type_duration) directly, the same
functions the real endpoints call, rather than duplicating their logic.

Real Resend network calls are disabled for every test (see the autouse
no_real_emails fixture) since booking successfully triggers a
confirmation email — we don't want tests making external network calls
or depending on Resend being configured.
"""

from datetime import date, datetime, time, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models, auth, email_utils
from app.database import Base
from app.routers.appointments import validate_and_create_appointment
from app.routers.doctors import compute_available_slots, get_visit_type_duration


@pytest.fixture(autouse=True)
def no_real_emails(monkeypatch):
    """Every send_* function in email_utils goes through _send_email —
    patching that one spot silences all of them for every test."""
    monkeypatch.setattr(email_utils, "_send_email", lambda *args, **kwargs: True)


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


def _future_monday() -> date:
    """A Monday far enough in the future that no test result depends on
    when the test suite happens to run."""
    d = date.today() + timedelta(days=400)
    while d.weekday() != 0:
        d += timedelta(days=1)
    return d


def _make_patient(db, email="patient@example.com") -> models.User:
    user = models.User(
        email=email,
        hashed_password=auth.hash_password("x"),
        full_name="Test Patient",
        role=models.UserRole.patient,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_doctor(db, email="doctor@example.com", name="Dr. Test") -> models.Doctor:
    user = models.User(
        email=email,
        hashed_password=auth.hash_password("x"),
        full_name=name,
        role=models.UserRole.doctor,
    )
    db.add(user)
    db.flush()
    doctor = models.Doctor(user_id=user.id, specialization="General")
    db.add(doctor)
    db.commit()
    db.refresh(doctor)
    return doctor


def _make_availability(db, doctor, day_of_week, start: time, end: time):
    db.add(
        models.Availability(
            doctor_id=doctor.id,
            day_of_week=day_of_week,
            start_time=start,
            end_time=end,
            slot_duration_minutes=30,  # legacy field, no longer read by scheduling
        )
    )
    db.commit()


def _set_duration(db, doctor, visit_type: models.VisitType, minutes: int):
    db.add(
        models.DoctorVisitTypeDuration(
            doctor_id=doctor.id, visit_type=visit_type.value, duration_minutes=minutes
        )
    )
    db.commit()


def _dt(d: date, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(d, time(hour, minute))


# ---------- 1. A booking that exactly fits an available gap ----------


def test_booking_exactly_fills_the_gap(db):
    monday = _future_monday()
    patient = _make_patient(db)
    doctor = _make_doctor(db)
    # A 30-minute window with the default Consultation duration (30 min):
    # exactly one possible slot, using the entire gap.
    _make_availability(db, doctor, day_of_week=0, start=time(9, 0), end=time(9, 30))

    slots = compute_available_slots(db, doctor.id, monday, duration_minutes=30)
    assert slots == [{"start_time": _dt(monday, 9, 0), "end_time": _dt(monday, 9, 30)}]

    appt = validate_and_create_appointment(
        db, patient.id, doctor.id, _dt(monday, 9, 0), "checkup", models.VisitType.consultation
    )
    assert appt.id is not None
    assert appt.duration_minutes == 30
    assert appt.visit_type == models.VisitType.consultation.value


# ---------- 2. A booking that doesn't fit (rejected) ----------


def test_booking_that_does_not_fit_is_rejected(db):
    monday = _future_monday()
    patient = _make_patient(db)
    doctor = _make_doctor(db)
    # Only a 30-minute window, but New Patient defaults to 45 minutes —
    # doesn't fit no matter where you start inside this window.
    _make_availability(db, doctor, day_of_week=0, start=time(9, 0), end=time(9, 30))

    slots = compute_available_slots(db, doctor.id, monday, duration_minutes=45)
    assert slots == []

    with pytest.raises(HTTPException) as exc_info:
        validate_and_create_appointment(
            db, patient.id, doctor.id, _dt(monday, 9, 0), "checkup", models.VisitType.new_patient
        )
    assert exc_info.value.status_code == 400


# ---------- 3. Two different-duration bookings back-to-back (both succeed) ----------


def test_back_to_back_different_durations_both_succeed(db):
    monday = _future_monday()
    patient = _make_patient(db)
    doctor = _make_doctor(db)
    _make_availability(db, doctor, day_of_week=0, start=time(9, 0), end=time(11, 0))

    # Follow-up (default 15 min) at 09:00 -> occupies [09:00, 09:15).
    first = validate_and_create_appointment(
        db, patient.id, doctor.id, _dt(monday, 9, 0), "follow up", models.VisitType.follow_up
    )
    assert first.duration_minutes == 15

    # Consultation (default 30 min) starting exactly when the first one
    # ends -> [09:15, 09:45). No overlap, so this must succeed too.
    second = validate_and_create_appointment(
        db, patient.id, doctor.id, _dt(monday, 9, 15), "consult", models.VisitType.consultation
    )
    assert second.duration_minutes == 30
    assert first.id != second.id


# ---------- 4. A booking that would overlap an existing appointment (rejected) ----------


def test_overlapping_booking_is_rejected(db):
    monday = _future_monday()
    patient = _make_patient(db)
    doctor = _make_doctor(db)
    _make_availability(db, doctor, day_of_week=0, start=time(9, 0), end=time(11, 0))

    # Consultation (30 min) at 09:00 -> occupies [09:00, 09:30).
    validate_and_create_appointment(
        db, patient.id, doctor.id, _dt(monday, 9, 0), "consult", models.VisitType.consultation
    )

    # A Follow-up at 09:15 would run [09:15, 09:30) — entirely inside the
    # first appointment's range. Rejected via the gap-fit check (09:15
    # never appears as a valid candidate in the first place).
    with pytest.raises(HTTPException) as exc_info:
        validate_and_create_appointment(
            db, patient.id, doctor.id, _dt(monday, 9, 15), "follow up", models.VisitType.follow_up
        )
    assert exc_info.value.status_code == 400

    # The exact same start time as the existing appointment is also
    # rejected (the classic case, still fully covered).
    with pytest.raises(HTTPException) as exc_info:
        validate_and_create_appointment(
            db, patient.id, doctor.id, _dt(monday, 9, 0), "consult", models.VisitType.consultation
        )
    assert exc_info.value.status_code == 400

    # Only the one original appointment exists.
    assert db.query(models.Appointment).count() == 1


# ---------- 5. Two doctors, same type name, different durations ----------


def test_each_doctor_uses_their_own_duration_for_the_same_type_name(db):
    monday = _future_monday()
    patient = _make_patient(db)
    doctor_a = _make_doctor(db, email="a@example.com", name="Dr. A")
    doctor_b = _make_doctor(db, email="b@example.com", name="Dr. B")

    # Same visit type name, deliberately different configured durations.
    _set_duration(db, doctor_a, models.VisitType.consultation, 20)
    _set_duration(db, doctor_b, models.VisitType.consultation, 50)

    _make_availability(db, doctor_a, day_of_week=0, start=time(9, 0), end=time(10, 0))
    _make_availability(db, doctor_b, day_of_week=0, start=time(9, 0), end=time(10, 0))

    assert get_visit_type_duration(db, doctor_a.id, models.VisitType.consultation) == 20
    assert get_visit_type_duration(db, doctor_b.id, models.VisitType.consultation) == 50

    # Book "Consultation" with each doctor at the same time.
    appt_a = validate_and_create_appointment(
        db, patient.id, doctor_a.id, _dt(monday, 9, 0), "consult", models.VisitType.consultation
    )
    appt_b = validate_and_create_appointment(
        db, patient.id, doctor_b.id, _dt(monday, 9, 0), "consult", models.VisitType.consultation
    )
    assert appt_a.duration_minutes == 20
    assert appt_b.duration_minutes == 50

    # Dr. A's short duration leaves room for a second booking at 09:20;
    # this proves A's OWN 20-minute duration was actually used, not some
    # shared/default value.
    second_a = validate_and_create_appointment(
        db, patient.id, doctor_a.id, _dt(monday, 9, 20), "consult", models.VisitType.consultation
    )
    assert second_a.id is not None

    # The exact same 09:20 start time for Dr. B must be REJECTED: B's
    # first booking (50 min) runs until 09:50, so 09:20 overlaps it. This
    # confirms B's own longer duration is in effect and wasn't confused
    # with A's.
    with pytest.raises(HTTPException) as exc_info:
        validate_and_create_appointment(
            db, patient.id, doctor_b.id, _dt(monday, 9, 20), "consult", models.VisitType.consultation
        )
    assert exc_info.value.status_code == 400


# ---------- Bonus: doctor who never configured durations gets the defaults ----------


def test_unconfigured_doctor_gets_default_durations(db):
    doctor = _make_doctor(db)
    assert get_visit_type_duration(db, doctor.id, models.VisitType.follow_up) == 15
    assert get_visit_type_duration(db, doctor.id, models.VisitType.consultation) == 30
    assert get_visit_type_duration(db, doctor.id, models.VisitType.new_patient) == 45
