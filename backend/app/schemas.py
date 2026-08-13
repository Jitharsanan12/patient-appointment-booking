"""
Pydantic schemas: these define the shape of data going IN to the API
(request bodies) and OUT of the API (responses). They are deliberately
separate from the SQLAlchemy models in models.py — e.g. we never want to
accidentally send a user's hashed_password back in an API response, so
UserOut simply doesn't include that field.
"""

from datetime import datetime, time, date
from typing import Optional

from pydantic import BaseModel, EmailStr, ConfigDict, Field, model_validator

from app.models import UserRole, AppointmentStatus


# ---------- Auth / Users ----------

class PatientRegister(BaseModel):
    """
    Input for the PUBLIC /auth/register endpoint. Deliberately has NO role
    field at all — public self-signup can only ever create a patient
    account. Doctor and admin accounts are created through separate,
    privileged paths (see AdminCreateDoctorRequest and seed_admin.py).
    """
    email: EmailStr
    password: str
    full_name: str


class UserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: UserRole

    # Lets Pydantic read this schema directly from a SQLAlchemy model
    # instance (e.g. UserOut.model_validate(user)) instead of a dict.
    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ---------- Doctors ----------

class DoctorOut(BaseModel):
    id: int  # doctor's id (from the doctors table, used when booking)
    full_name: str
    specialization: str
    bio: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AdminCreateDoctorRequest(BaseModel):
    """Input for the admin-only POST /admin/doctors endpoint."""
    email: EmailStr
    full_name: str
    specialization: str
    bio: Optional[str] = None
    # If the admin doesn't supply one, the backend generates a random
    # temporary password (the doctor should change it after first login).
    password: Optional[str] = None


class AdminCreateDoctorResponse(BaseModel):
    id: int  # the new doctor's id (from the doctors table)
    email: EmailStr
    full_name: str
    specialization: str
    bio: Optional[str] = None
    # Only ever returned here, once, at creation time — never stored in
    # plain text and never retrievable again after this response.
    temporary_password: str
    # Whether the welcome email was successfully sent via Resend — false
    # doesn't mean the doctor account wasn't created, just that the admin
    # should share temporary_password with them some other way.
    email_sent: bool


# ---------- Availability ----------

class AvailabilityCreate(BaseModel):
    # 0=Monday ... 6=Sunday, matching Python's date.weekday()
    day_of_week: int = Field(ge=0, le=6)
    start_time: time
    end_time: time
    slot_duration_minutes: int = Field(default=30, gt=0)

    @model_validator(mode="after")
    def check_time_order(self):
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class AvailabilityOut(BaseModel):
    id: int
    doctor_id: int
    day_of_week: int
    start_time: time
    end_time: time
    slot_duration_minutes: int

    model_config = ConfigDict(from_attributes=True)


class SlotOut(BaseModel):
    """One bookable slot: a specific start/end datetime on the requested date."""
    start_time: datetime
    end_time: datetime


# ---------- Availability overrides (one-off unavailable dates) ----------

class UnavailableDateCreate(BaseModel):
    date: date
    reason: Optional[str] = None


class UnavailableDateOut(BaseModel):
    id: int
    doctor_id: int
    date: date
    reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ---------- Appointments ----------

class AppointmentCreate(BaseModel):
    doctor_id: int
    appointment_date: datetime
    reason: str


class AppointmentStatusUpdate(BaseModel):
    status: AppointmentStatus


class AppointmentOut(BaseModel):
    id: int
    doctor_id: int
    doctor_name: str
    patient_id: int
    patient_name: str
    appointment_date: datetime
    reason: str
    status: AppointmentStatus

    model_config = ConfigDict(from_attributes=True)
