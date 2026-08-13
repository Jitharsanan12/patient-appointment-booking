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

    patient = relationship("User", foreign_keys=[patient_id])
    doctor = relationship("Doctor", back_populates="appointments")

    __table_args__ = (
        # This is the database-level safety net against double-booking:
        # no two rows can share the same doctor_id + appointment_date.
        # (We'll also check this in the API code to give a friendly error
        # message instead of a raw database error.)
        UniqueConstraint("doctor_id", "appointment_date", name="uq_doctor_datetime"),
    )
