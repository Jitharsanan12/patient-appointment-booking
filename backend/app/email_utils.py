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


def send_doctor_welcome_email(to_email: str, full_name: str, temporary_password: str) -> bool:
    """
    Emails a newly created doctor their login credentials.

    Returns True if Resend accepted the email, False if anything went
    wrong. We deliberately catch every exception here (network errors,
    a missing/invalid API key, Resend rejecting the recipient, etc.) and
    turn it into a plain False instead of letting it crash the request —
    a failed email should never stop the doctor account from being
    created. The caller falls back to showing the password on screen.
    """
    if not resend.api_key:
        return False

    try:
        resend.Emails.send({
            "from": FROM_EMAIL,
            "to": to_email,
            "subject": "Your doctor account has been created",
            "html": (
                f"<p>Hi {full_name},</p>"
                f"<p>An admin has created a doctor account for you on the "
                f"Patient Appointment Booking system.</p>"
                f"<p><strong>Login email:</strong> {to_email}<br>"
                f"<strong>Temporary password:</strong> {temporary_password}</p>"
                f"<p>Please log in and change your password as soon as possible.</p>"
            ),
        })
        return True
    except Exception as e:
        # Printed to the server console only — never exposed to the API
        # response — so you can see *why* an email failed while debugging,
        # without turning a delivery failure into a request failure.
        print(f"Failed to send doctor welcome email to {to_email}: {e}")
        return False
