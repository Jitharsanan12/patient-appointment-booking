"""
SQLAlchemy models: these Python classes map directly to PostgreSQL tables.
Each class attribute becomes a column.
"""

import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Time,
    Date,
    ForeignKey,
    Enum,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


class UserRole(str, enum.Enum):
    """The three kinds of people who can log in."""
    patient = "patient"
    doctor = "doctor"
    admin = "admin"


class AppointmentStatus(str, enum.Enum):
    """The lifecycle of a booked appointment."""
    scheduled = "scheduled"
    completed = "completed"
    cancelled = "cancelled"


class User(Base):
    """
    Every person who can log in: patients, doctors, and admins.
    We use ONE table with a `role` column rather than three separate
    tables, since they all need email/password/name for login.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(Enum(UserRole), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # If this user is a doctor, this links to their extra profile info.
    # uselist=False makes this a one-to-one relationship instead of a list.
    doctor_profile = relationship("Doctor", back_populates="user", uselist=False)

    # If this user is a patient, this links to their optional medical
    # profile (allergies, emergency contact, etc.) — same one-to-one
    # pattern as doctor_profile above.
    patient_profile = relationship("PatientProfile", back_populates="user", uselist=False)


class Doctor(Base):
    """
    Extra profile info that only applies to users with role="doctor".
    Kept separate from User so we don't add doctor-only columns
    (specialization, bio) to every patient/admin row.
    """
    __tablename__ = "doctors"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    specialization = Column(String, nullable=False)
    bio = Column(String, nullable=True)

    user = relationship("User", back_populates="doctor_profile")
    appointments = relationship("Appointment", back_populates="doctor")
    availability_windows = relationship(
        "Availability", back_populates="doctor", cascade="all, delete-orphan"
    )
    unavailable_dates = relationship(
        "AvailabilityOverride", back_populates="doctor", cascade="all, delete-orphan"
    )


class PatientProfile(Base):
    """
    Optional medical profile for a user with role="patient" — allergies,
    existing conditions, emergency contact, etc. Kept separate from User
    (same reasoning as Doctor above) so these patient-only columns don't
    sit on every doctor/admin row too.

    Every field is nullable: a patient may never fill any of this in, and
    that's fine — the row still exists (created on first view/edit, see
    routers/patients.py) with everything blank.
    """
    __tablename__ = "patient_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    date_of_birth = Column(Date, nullable=True)
    phone_number = Column(String, nullable=True)
    allergies = Column(String, nullable=True)
    existing_conditions = Column(String, nullable=True)
    emergency_contact_name = Column(String, nullable=True)
    emergency_contact_phone = Column(String, nullable=True)

    user = relationship("User", back_populates="patient_profile")


class Availability(Base):
    """
    A recurring weekly window during which a doctor is available, e.g.
    "every Monday, 09:00-17:00, in 30-minute slots". A doctor can have
    multiple rows (e.g. Monday mornings AND Wednesday afternoons).

    We store a day of the week rather than specific dates so the doctor
    sets their schedule once and it repeats every week. day_of_week uses
    the same convention as Python's date.weekday(): 0=Monday ... 6=Sunday.
    """
    __tablename__ = "availability"

    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=False)
    day_of_week = Column(Integer, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    slot_duration_minutes = Column(Integer, nullable=False, default=30)

    doctor = relationship("Doctor", back_populates="availability_windows")


class AvailabilityOverride(Base):
    """
    A one-off exception that blocks a doctor's normal weekly availability
    for a single specific date (e.g. a public holiday or a day off) —
    regardless of what their recurring Availability windows say for that
    day of the week.

    We only model "block this date" (not "add extra hours on this date")
    since that's what was asked for; the UniqueConstraint stops a doctor
    from accidentally creating the same override twice.
    """
    __tablename__ = "availability_overrides"

    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=False)
    date = Column(Date, nullable=False)
    reason = Column(String, nullable=True)

    doctor = relationship("Doctor", back_populates="unavailable_dates")

    __table_args__ = (
        UniqueConstraint("doctor_id", "date", name="uq_doctor_override_date"),
    )


class Appointment(Base):
    """
    A booking made by a patient with a doctor at a specific date/time.
    """
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=False)
    appointment_date = Column(DateTime(timezone=True), nullable=False)
    reason = Column(String, nullable=False)
    status = Column(Enum(AppointmentStatus), nullable=False, default=AppointmentStatus.scheduled)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Optional attachment (e.g. a lab report or photo) the patient can add.
    # file_key is the object's path *inside* the private S3 bucket, NOT a
    # public URL — the bucket has no public read access, so this key is
    # only ever used server-side to generate a short-lived presigned
    # download link (see app/s3_utils.py). file_name is the original
    # filename, kept separately so the UI can show/download it with a
    # human-readable name instead of the internal key.
    file_key = Column(String, nullable=True)
    file_name = Column(String, nullable=True)

    patient = relationship("User", foreign_keys=[patient_id])
    doctor = relationship("Doctor", back_populates="appointments")

    __table_args__ = (
        # This is the database-level safety net against double-booking:
        # no two rows can share the same doctor_id + appointment_date.
        # (We'll also check this in the API code to give a friendly error
        # message instead of a raw database error.)
        UniqueConstraint("doctor_id", "appointment_date", name="uq_doctor_datetime"),
    )
