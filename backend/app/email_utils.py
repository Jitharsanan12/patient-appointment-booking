"""
Sends transactional emails via Resend (https://resend.com).

RESEND_API_KEY is read from the environment, which app/database.py already
populates from .env via python-dotenv when the app starts — we never
hardcode the key here.
"""

import os

import resend

resend.api_key = os.getenv("RESEND_API_KEY")

# Resend's shared "onboarding" sender works with zero setup, but — until you
# verify your own domain with Resend — it can only deliver to the email
# address you signed up to Resend with, not to arbitrary recipients. See the
# README for details. Swap this for "you@yourdomain.com" once you verify one.
FROM_EMAIL = "Appointment Booking <onboarding@resend.dev>"


def _send_email(to_email: str, subject: str, html: str) -> bool:
    """
    Shared low-level sender used by every send_* function below — sends
    one email via Resend and returns True/False instead of raising.

    Returns True if Resend accepted the email, False if anything went
    wrong. We deliberately catch every exception here (network errors, a
    missing/invalid API key, Resend rejecting the recipient, etc.) and
    turn it into a plain False instead of letting it crash the request —
    a failed email should never stop the action that triggered it (e.g.
    creating a doctor account, or cancelling an appointment) from
    succeeding.
    """
    if not resend.api_key:
        return False

    try:
        resend.Emails.send({
            "from": FROM_EMAIL,
            "to": to_email,
            "subject": subject,
            "html": html,
        })
        return True
    except Exception as e:
        # Printed to the server console only — never exposed to the API
        # response — so you can see *why* an email failed while debugging,
        # without turning a delivery failure into a request failure.
        print(f"Failed to send email to {to_email}: {e}")
        return False


def send_doctor_welcome_email(to_email: str, full_name: str, temporary_password: str) -> bool:
    """Emails a newly created doctor their login credentials. The caller
    falls back to showing the password on screen if this returns False."""
    return _send_email(
        to_email,
        "Your doctor account has been created",
        (
            f"<p>Hi {full_name},</p>"
            f"<p>An admin has created a doctor account for you on the "
            f"Patient Appointment Booking system.</p>"
            f"<p><strong>Login email:</strong> {to_email}<br>"
            f"<strong>Temporary password:</strong> {temporary_password}</p>"
            f"<p>Please log in and change your password as soon as possible.</p>"
        ),
    )


def send_booking_confirmation_email(
    to_email: str,
    patient_name: str,
    doctor_name: str,
    specialty: str,
    appointment_time: str,
    reason: str,
) -> bool:
    """
    Confirms a newly booked appointment to the patient. Sent right after
    booking succeeds — by both the patient's own POST /appointments and
    the admin's POST /admin/appointments, since both go through
    appointments.validate_and_create_appointment (see that function for
    the single call site).
    """
    return _send_email(
        to_email,
        "Your appointment is confirmed",
        (
            f"<p>Hi {patient_name},</p>"
            f"<p>Your appointment with Dr. {doctor_name} ({specialty}) is confirmed for "
            f"<strong>{appointment_time}</strong>.</p>"
            f"<p><strong>Reason for visit:</strong> {reason}</p>"
        ),
    )


def send_appointment_cancelled_email_to_doctor(
    to_email: str, doctor_name: str, patient_name: str, appointment_time: str
) -> bool:
    """
    Notifies a doctor that one of their appointments was cancelled,
    freeing up that time slot. Used both when the patient cancels it
    themselves and when an admin cancels it on their behalf — from the
    doctor's point of view the useful information is the same either way.
    """
    return _send_email(
        to_email,
        "An appointment has been cancelled",
        (
            f"<p>Hi Dr. {doctor_name},</p>"
            f"<p>{patient_name}'s appointment scheduled for "
            f"<strong>{appointment_time}</strong> has been cancelled.</p>"
            f"<p>This time slot is now free.</p>"
        ),
    )


def send_appointment_cancelled_email_to_patient(
    to_email: str, patient_name: str, doctor_name: str, appointment_time: str
) -> bool:
    """
    Notifies a patient that their appointment was cancelled, with an
    apology and a suggestion to rebook. Used both when the doctor cancels
    it themselves and when an admin cancels it on their behalf.
    """
    return _send_email(
        to_email,
        "Your appointment has been cancelled",
        (
            f"<p>Hi {patient_name},</p>"
            f"<p>We're sorry — your appointment with Dr. {doctor_name} scheduled for "
            f"<strong>{appointment_time}</strong> has been cancelled.</p>"
            f"<p>Please feel free to book a new time that works for you whenever "
            f"you're ready.</p>"
        ),
    )
