"""
Endpoints for browsing doctors. Any logged-in user can view the doctor list
(a patient needs it to choose who to book with).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app import models, schemas, auth
from app.database import get_db

router = APIRouter(prefix="/doctors", tags=["doctors"])


@router.get("", response_model=list[schemas.DoctorOut])
def list_doctors(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    # joinedload fetches the related User (for full_name) in the same query,
    # instead of firing off a separate query per doctor.
    doctors = db.query(models.Doctor).options(joinedload(models.Doctor.user)).all()

    return [
        schemas.DoctorOut(
            id=d.id,
            full_name=d.user.full_name,
            specialization=d.specialization,
            bio=d.bio,
        )
        for d in doctors
    ]
