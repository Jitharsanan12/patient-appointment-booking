"""
Endpoints for registering and logging in.

NOTE on roles: public self-signup (this /register endpoint) can ONLY ever
create a "patient" account — the role is hard-coded below and the request
schema (schemas.PatientRegister) doesn't even have a role field, so there's
nothing a client could send to change that. Doctor accounts are created by
an admin via POST /admin/doctors (see routers/admin.py); the one admin
account is created separately via backend/seed_admin.py, not through the API.
"""

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas, auth, email_utils
from app.database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])

# How long a requested reset link stays valid.
RESET_TOKEN_EXPIRE_MINUTES = 30

# Always the exact same wording, on every call, whether or not the email
# is actually registered — see forgot_password below.
FORGOT_PASSWORD_MESSAGE = "If an account exists with that email, we've sent a password reset link."


@router.post("/register", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: schemas.PatientRegister, db: Session = Depends(get_db)):
    # Make sure this email isn't already taken.
    existing_user = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email is already registered")

    new_user = models.User(
        email=payload.email,
        hashed_password=auth.hash_password(payload.password),
        full_name=payload.full_name,
        role=models.UserRole.patient,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/login", response_model=schemas.Token)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()

    if not user or not auth.verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    # Checked AFTER verifying the password (not before) so a deactivated
    # account's status can never be probed by someone who doesn't already
    # know the password — same reasoning as forgot_password's generic
    # response below, just applied to a different endpoint.
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account has been deactivated")

    # "sub" (subject) is the standard JWT field for "who does this token belong to".
    access_token = auth.create_access_token(data={"sub": str(user.id), "role": user.role.value})
    return schemas.Token(access_token=access_token)


@router.post("/reactivate", response_model=schemas.Token)
def reactivate_my_account(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    """
    Lets a deactivated PATIENT bring their own account back, having just
    proven it's really them by supplying their correct password — a wrong
    password gets the exact same generic 401 login() raises on a genuine
    mismatch, so this endpoint leaks nothing to someone who doesn't
    already know the password. Patient-only: once the password IS
    verified, a doctor's account gets a distinct 403 pointing them to an
    admin instead, since doctor accounts can only be brought back by one
    (see POST /admin/doctors/{id}/reactivate in routers/admin.py) — this
    endpoint is not a way around that. Reactivating logs the account
    straight in (same token shape as /login) rather than making them log
    in again right after, since they've already just proven their
    identity here.
    """
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not auth.verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    if user.role != models.UserRole.patient:
        raise HTTPException(
            status_code=403,
            detail="This account can only be reactivated by an admin. Please contact support.",
        )

    if not user.is_active:
        user.is_active = True
        db.commit()

    access_token = auth.create_access_token(data={"sub": str(user.id), "role": user.role.value})
    return schemas.Token(access_token=access_token)


@router.get("/me", response_model=schemas.UserOut)
def get_me(current_user: models.User = Depends(auth.get_current_user)):
    """Lets the frontend ask 'who am I logged in as?' using the current token."""
    return current_user


@router.put("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: schemas.ChangePasswordRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """
    Lets any logged-in user (patient, doctor, or admin) change their own
    password. get_current_user already identifies who is calling from
    their token, so there's no user id in the URL or body to tamper with —
    a user can only ever change their own password this way.
    """
    if not auth.verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    current_user.hashed_password = auth.hash_password(payload.new_password)
    db.commit()


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_my_account(
    payload: schemas.DeactivateAccountRequest,
    current_user: models.User = Depends(auth.require_role(models.UserRole.patient)),
    db: Session = Depends(get_db),
):
    """
    Lets a patient deactivate (soft-delete) their own account. Patient-only
    (doctors/admin don't get self-service deactivation here) and requires
    re-entering the current password, same confirmation pattern as
    change_password above. This ONLY flips is_active to False — every
    appointment, profile field, and history row stays exactly as it was,
    just tied to an account that can no longer log in (see the is_active
    checks in login() above and get_current_user in app/auth.py).
    """
    if not auth.verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    current_user.is_active = False
    db.commit()


@router.post("/forgot-password", response_model=schemas.MessageResponse)
def forgot_password(payload: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Starts a password reset for any account (patient, doctor, or admin).
    Deliberately returns the exact same message whether or not the email
    is registered — a real security practice, since a differing response
    ("no account with that email" vs "check your inbox") would let
    anyone probe the system to discover which emails have accounts here.
    So the "if user found" branch below is the ONLY place behavior
    differs, and it never surfaces to the response either way.
    """
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if user:
        user.reset_token = secrets.token_urlsafe(32)
        user.reset_token_expires_at = datetime.now(timezone.utc) + timedelta(
            minutes=RESET_TOKEN_EXPIRE_MINUTES
        )
        db.commit()

        # Fail-soft like every other email in this app (see
        # email_utils._send_email) — a failed send doesn't change the
        # response, since that response can never reveal anything about
        # whether the email exists or the send succeeded.
        email_utils.send_password_reset_email(
            to_email=user.email, full_name=user.full_name, reset_token=user.reset_token
        )

    return schemas.MessageResponse(message=FORGOT_PASSWORD_MESSAGE)


@router.post("/reset-password", response_model=schemas.MessageResponse)
def reset_password(payload: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    """
    Completes a password reset started by forgot_password above. Unlike
    that endpoint, this one's response DOES reveal whether the token is
    valid — but a token is an unguessable random secret only its intended
    recipient ever sees (in their inbox), not personal information like
    an email address, so confirming/rejecting it here doesn't leak
    anything the way confirming an email's existence would.
    """
    user = (
        db.query(models.User).filter(models.User.reset_token == payload.token).first()
    )
    if (
        not user
        or user.reset_token_expires_at is None
        or user.reset_token_expires_at < datetime.now(timezone.utc)
    ):
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired")

    user.hashed_password = auth.hash_password(payload.new_password)
    # Clear the token so this same link can't be used a second time.
    user.reset_token = None
    user.reset_token_expires_at = None
    db.commit()

    return schemas.MessageResponse(message="Your password has been reset successfully.")
