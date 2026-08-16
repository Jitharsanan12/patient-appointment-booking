"""
The FastAPI application entry point.

Run the server (from the backend/ folder) with:
    ./venv/bin/uvicorn app.main:app --reload

Then open http://127.0.0.1:8000/docs for interactive API documentation.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import auth, doctors, appointments, admin, patients

# Creates all tables defined in models.py if they don't already exist.
# (Fine for development; for a production app you'd use a migration tool
# like Alembic instead, so schema changes are tracked and reversible.)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="CareSlot API")

# Allows our React frontend (running on a different port during development)
# to make requests to this API. Without this, the browser blocks the requests.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(doctors.router)
app.include_router(appointments.router)
app.include_router(admin.router)
app.include_router(patients.router)


@app.get("/")
def root():
    return {"message": "CareSlot API is running"}
