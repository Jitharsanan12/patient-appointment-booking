"""
Pydantic schemas: these define the shape of data going IN to the API
(request bodies) and OUT of the API (responses). They are deliberately
separate from the SQLAlchemy models in models.py — e.g. we never want to
accidentally send a user's hashed_password back in an API response, so
UserOut simply doesn't include that field.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, ConfigDict

from app.models import UserRole, AppointmentStatus


# ---------- Auth / Users ----------

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: UserRole
    # Only required when role == "doctor"
    specialization: Optional[str] = None
    bio: Optional[str] = None


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
