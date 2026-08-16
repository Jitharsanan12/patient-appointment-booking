"""
Shared field-validation helpers for schemas.py.

Pulled out into their own functions (rather than inlined once per
schema) because several of these rules apply to more than one field —
e.g. a phone number is collected both for the patient themselves and
for their emergency contact, and a full name is collected both at
patient self-registration and when an admin creates a doctor. One
definition of "a valid phone number" per kind of field, reused
everywhere that kind of field appears, instead of a slightly-different
regex or length check copied at each call site.

Each function either returns the (possibly normalized, e.g. stripped)
value or raises ValueError — the standard way a Pydantic v2
field_validator signals invalid input, which Pydantic turns into a
422 response with that exact message.
"""

import re
from datetime import date, timedelta
from typing import Optional

# Digits only, with an optional leading "+" for a country code (e.g.
# "+14155551234"), 7-15 digits total not counting that "+". This is
# intentionally strict — no spaces, dashes, or parentheses — per what
# was asked for; a more lenient "accept common formatting, then strip
# it before validating" behavior would be a reasonable follow-up if
# real-world phone entry turns out to need it.
PHONE_PATTERN = re.compile(r"^\+?\d{7,15}$")

# Roughly 120 years, expressed in days so this works without relying on
# date.replace(year=...) — which would crash on a Feb 29 born-120-years-
# ago edge case in a non-leap year.
_ONE_HUNDRED_TWENTY_YEARS_IN_DAYS = 120 * 365.25


def validate_phone(value: Optional[str]) -> Optional[str]:
    """For an Optional[str] phone field — None/blank stays as-is (the
    field is optional; only a non-empty value gets format-checked)."""
    if not value:
        return value
    if not PHONE_PATTERN.match(value):
        raise ValueError(
            "Phone number must be 7-15 digits, with an optional leading "
            "+ for the country code (no letters, spaces, or symbols)"
        )
    return value


def validate_full_name(value: str) -> str:
    """Trims the name and rejects anything too short or made up entirely
    of digits — e.g. "  " or "12345" — while still allowing names that
    legitimately contain a number (a suffix like "3rd", say)."""
    stripped = value.strip()
    if len(stripped) < 2:
        raise ValueError("Full name must be at least 2 characters long")
    if stripped.replace(" ", "").isdigit():
        raise ValueError("Full name cannot be only numbers")
    return stripped


def validate_date_of_birth(value: Optional[date]) -> Optional[date]:
    if value is None:
        return value
    today = date.today()
    if value > today:
        raise ValueError("Date of birth cannot be in the future")
    earliest = today - timedelta(days=_ONE_HUNDRED_TWENTY_YEARS_IN_DAYS)
    if value < earliest:
        raise ValueError("Date of birth cannot be more than 120 years ago")
    return value


def validate_meaningful_text(value: str, field_label: str, min_length: int = 3) -> str:
    """For free-text fields that are supposed to actually say something
    (e.g. a visit reason) — rejects empty/whitespace-only input and
    anything shorter than min_length once whitespace is trimmed, so
    e.g. "  a  " can't sneak past a raw len() check on the untrimmed
    string."""
    stripped = value.strip()
    if len(stripped) < min_length:
        raise ValueError(f"{field_label} must be at least {min_length} characters long")
    return stripped
