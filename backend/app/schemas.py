"""
Pydantic schemas: these define the shape of data going IN to the API
(request bodies) and OUT of the API (responses). They are deliberately
separate from the SQLAlchemy models in models.py — e.g. we never want to
accidentally send a user's hashed_password back in an API response, so
UserOut simply doesn't include that field.
"""

from datetime import datetime, time, date
from typing import Optional

from pydantic import BaseModel, EmailStr, ConfigDict, Field, model_validator, field_validator

from app.models import UserRole, AppointmentStatus, VisitType
from app.validators import (
    validate_phone,
    validate_full_name,
    validate_date_of_birth,
    validate_meaningful_text,
)


# ---------- Auth / Users ----------

class PatientRegister(BaseModel):
    """
    Input for the PUBLIC /auth/register endpoint. Deliberately has NO role
    field at all — public self-signup can only ever create a patient
    account. Doctor and admin accounts are created through separate,
    privileged paths (see AdminCreateDoctorRequest and seed_admin.py).
    """
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str

    @field_validator("full_name")
    @classmethod
    def check_full_name(cls, v):
        return validate_full_name(v)


class UserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: UserRole

    # Lets Pydantic read this schema directly from a SQLAlchemy model
    # instance (e.g. UserOut.model_validate(user)) instead of a dict.
    model_config = ConfigDict(from_attributes=True)


class PatientOut(BaseModel):
    """Admin-only patient directory row — see GET /admin/patients."""
    id: int
    full_name: str
    email: EmailStr
    created_at: datetime
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class AdminUpdatePatientRequest(BaseModel):
    """Input for the admin-only PUT /admin/patients/{patient_id}
    endpoint — account-level fields only (name/email), NOT the medical
    profile (date of birth, allergies, etc. — see PatientProfileUpdate,
    which stays the patient's own to edit via PUT /patients/me/profile).
    Same full_name validator as PatientRegister/AdminCreateDoctorRequest."""
    email: EmailStr
    full_name: str

    @field_validator("full_name")
    @classmethod
    def check_full_name(cls, v):
        return validate_full_name(v)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    """Input for PUT /auth/me/password. Used by any logged-in user
    (patient, doctor, or admin) to change their own password."""
    current_password: str
    new_password: str = Field(min_length=8)


class ForgotPasswordRequest(BaseModel):
    """Input for the PUBLIC POST /auth/forgot-password endpoint."""
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Input for the PUBLIC POST /auth/reset-password endpoint."""
    token: str
    new_password: str = Field(min_length=8)


class DeactivateAccountRequest(BaseModel):
    """Input for the patient-only DELETE /auth/me endpoint — same
    re-enter-your-password confirmation pattern as ChangePasswordRequest,
    since this is an irreversible-feeling, self-service action."""
    current_password: str


class MessageResponse(BaseModel):
    """Generic {"message": "..."} response, used where an endpoint has
    nothing else to return — e.g. forgot/reset-password, which
    deliberately keep their response shape identical on every outcome
    (see forgot_password in routers/auth.py) rather than returning a
    user object or token."""
    message: str


# ---------- Doctors ----------

class DoctorOut(BaseModel):
    id: int  # doctor's id (from the doctors table, used when booking)
    full_name: str
    specialization: str
    bio: Optional[str] = None
    # Whether the underlying account (see User.is_active) is active. The
    # public GET /doctors only ever returns active doctors, so this is
    # always true there — it's meaningful on the admin-only GET
    # /admin/doctors listing, which returns every doctor regardless of
    # status so the admin can see who's deactivated.
    is_active: bool = True

    model_config = ConfigDict(from_attributes=True)


class AdminCreateDoctorRequest(BaseModel):
    """Input for the admin-only POST /admin/doctors endpoint."""
    email: EmailStr
    full_name: str
    specialization: str
    bio: Optional[str] = None
    # If the admin doesn't supply one, the backend generates a random
    # temporary password (the doctor should change it after first login).
    # min_length only applies when a value is actually given — None
    # (the "auto-generate one for me" case) is left alone.
    password: Optional[str] = Field(default=None, min_length=8)

    @field_validator("full_name")
    @classmethod
    def check_full_name(cls, v):
        return validate_full_name(v)


class AdminUpdateDoctorRequest(BaseModel):
    """Input for the admin-only PUT /admin/doctors/{doctor_id} endpoint —
    edits a doctor's basic info. Deliberately has no password field: that
    stays handled entirely by the existing password flows (PUT
    /auth/me/password, forgot/reset-password), not folded into this
    account-editing endpoint. Reuses the exact same full_name validator
    as AdminCreateDoctorRequest above and EmailStr for format checking,
    rather than duplicating either rule."""
    email: EmailStr
    full_name: str
    specialization: str
    bio: Optional[str] = None

    @field_validator("full_name")
    @classmethod
    def check_full_name(cls, v):
        return validate_full_name(v)


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


class AvailabilityBreakCreate(BaseModel):
    break_start: time
    break_end: time

    @model_validator(mode="after")
    def check_time_order(self):
        if self.break_end <= self.break_start:
            raise ValueError("break_end must be after break_start")
        return self


class AvailabilityBreakOut(BaseModel):
    id: int
    availability_id: int
    break_start: time
    break_end: time

    model_config = ConfigDict(from_attributes=True)


class AvailabilityOut(BaseModel):
    id: int
    doctor_id: int
    day_of_week: int
    start_time: time
    end_time: time
    slot_duration_minutes: int
    # Every recurring break linked to this window (see AvailabilityBreak
    # in models.py) — always present, empty when the window has none.
    breaks: list[AvailabilityBreakOut] = []

    model_config = ConfigDict(from_attributes=True)


class SlotOut(BaseModel):
    """One bookable slot: a specific start/end datetime on the requested date."""
    start_time: datetime
    end_time: datetime


# ---------- Visit types & per-doctor durations ----------

class VisitTypeDurationUpdate(BaseModel):
    """One row of input for PUT /doctors/{id}/visit-type-durations — a
    doctor setting their own duration for one visit type."""
    visit_type: VisitType
    duration_minutes: int = Field(gt=0)


class VisitTypeDurationOut(BaseModel):
    """A doctor's EFFECTIVE duration for one visit type — their own
    configured value if they've set one, otherwise the default (see
    DEFAULT_VISIT_TYPE_DURATIONS in routers/doctors.py). Always present
    for all three types, whether or not the doctor has customized them."""
    visit_type: VisitType
    duration_minutes: int


# ---------- Availability overrides (one-off unavailable dates) ----------

class UnavailableDateCreate(BaseModel):
    date: date
    reason: Optional[str] = None
    # Leave both blank to block the entire date (original behavior). Set
    # both to block only that time range on the date instead.
    blocked_start: Optional[time] = None
    blocked_end: Optional[time] = None

    @model_validator(mode="after")
    def check_partial_block(self):
        if (self.blocked_start is None) != (self.blocked_end is None):
            raise ValueError(
                "blocked_start and blocked_end must both be provided, or both left blank"
            )
        if self.blocked_start is not None and self.blocked_end <= self.blocked_start:
            raise ValueError("blocked_end must be after blocked_start")
        return self


class UnavailableDateOut(BaseModel):
    id: int
    doctor_id: int
    date: date
    reason: Optional[str] = None
    blocked_start: Optional[time] = None
    blocked_end: Optional[time] = None

    model_config = ConfigDict(from_attributes=True)


# ---------- Appointments ----------

class AppointmentCreate(BaseModel):
    doctor_id: int
    appointment_date: datetime
    reason: str
    # Name only — the doctor's actual duration for this type is resolved
    # server-side (see routers.doctors.get_visit_type_duration), never
    # sent by the client.
    visit_type: VisitType

    @field_validator("reason")
    @classmethod
    def check_reason(cls, v):
        return validate_meaningful_text(v, "Reason for visit")


class AdminBookAppointmentRequest(BaseModel):
    """Input for admin-only POST /admin/appointments — same shape as
    AppointmentCreate, plus which existing patient it's being booked for
    (a normal booking gets that from the logged-in user instead)."""
    patient_id: int
    doctor_id: int
    appointment_date: datetime
    reason: str
    visit_type: VisitType

    @field_validator("reason")
    @classmethod
    def check_reason(cls, v):
        return validate_meaningful_text(v, "Reason for visit")


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
    # The visit type selected at booking time, and this doctor's duration
    # for it AT THAT TIME (see Appointment.duration_minutes in models.py
    # for why this is captured on the row rather than looked up live).
    visit_type: VisitType
    duration_minutes: int
    # Whether a file is attached, and its original name if so — never the
    # internal S3 key, which is only used server-side (see file_key on the
    # Appointment model / app/s3_utils.py).
    has_attachment: bool = False
    file_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PatientProfileUpdate(BaseModel):
    """Input for PUT /patients/me/profile — every field optional, since a
    patient may only want to fill in some of them."""
    date_of_birth: Optional[date] = None
    phone_number: Optional[str] = None
    allergies: Optional[str] = None
    existing_conditions: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None

    @field_validator("phone_number", "emergency_contact_phone")
    @classmethod
    def check_phone(cls, v):
        return validate_phone(v)

    @field_validator("date_of_birth")
    @classmethod
    def check_date_of_birth(cls, v):
        return validate_date_of_birth(v)


class PatientProfileOut(BaseModel):
    date_of_birth: Optional[date] = None
    phone_number: Optional[str] = None
    allergies: Optional[str] = None
    existing_conditions: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AttachmentDownloadOut(BaseModel):
    """
    A short-lived, signed S3 URL for downloading one appointment's
    attachment (see GET /appointments/{id}/attachment), plus the original
    filename for display. The URL itself expires a few minutes after being
    issued — see PRESIGNED_URL_EXPIRY_SECONDS in app/s3_utils.py.
    """
    url: str
    file_name: str
