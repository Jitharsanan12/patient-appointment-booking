# Patient Appointment Booking System

A full-stack appointment booking app: patients book appointments with doctors, doctors manage their schedule, and admins can see everything.

**Stack:** FastAPI (Python) + SQLAlchemy + PostgreSQL (Neon) on the backend, React (Vite) on the frontend, JWT-based authentication.

## Features

- Patients: browse doctors, book appointments (date/time + reason), view their own upcoming appointments, cancel them
- Doctors: view their assigned appointments, mark them completed or cancelled
- Admins: view every appointment in the system
- No double-booking the same doctor at the same date/time
- No booking a date/time in the past
- Only the relevant patient, assigned doctor, or an admin can view a given appointment's details

## Project structure

```
patient-appointment-booking/
├── .env                    # DATABASE_URL (not committed — see below)
├── backend/
│   ├── app/
│   │   ├── main.py         # FastAPI app entry point
│   │   ├── database.py     # SQLAlchemy engine/session setup
│   │   ├── models.py       # Database tables (User, Doctor, Appointment)
│   │   ├── schemas.py      # Request/response data shapes
│   │   ├── auth.py         # Password hashing, JWT creation/verification
│   │   └── routers/        # API endpoints, grouped by feature
│   ├── requirements.txt
│   └── venv/                # Python virtual environment (not committed)
└── frontend/
    ├── .env                 # VITE_API_URL (not committed)
    └── src/
        ├── api/client.js    # All backend API calls
        ├── context/         # Auth state (who's logged in)
        ├── components/      # Navbar, route guard
        └── pages/           # Login, Register, doctor list, dashboards
```

## Prerequisites

- Python 3.9+
- Node.js 18+
- A PostgreSQL database connection string (this project was set up with a [Neon](https://neon.tech) instance)

## Backend setup

1. From the `backend/` folder, create and activate a virtual environment, then install dependencies:

   ```bash
   cd backend
   python3 -m venv venv
   ./venv/bin/pip install -r requirements.txt
   ```

2. In the **project root** (one level up from `backend/`), create a `.env` file with your database connection string:

   ```
   DATABASE_URL=postgresql://<user>:<password>@<host>/<database>?sslmode=require
   ```

   The backend loads this automatically via `python-dotenv` — never hardcode a connection string in the code.

3. (Optional) Set a JWT signing secret. If omitted, a development default is used — fine for local dev, but you should set your own for anything beyond that:

   ```
   JWT_SECRET_KEY=some-long-random-string
   ```

4. Run the server:

   ```bash
   ./venv/bin/uvicorn app.main:app --reload
   ```

   The API is now running at `http://127.0.0.1:8000`. Interactive docs are at `http://127.0.0.1:8000/docs`. Tables are created automatically on startup if they don't already exist.

## Frontend setup

1. Install dependencies:

   ```bash
   cd frontend
   npm install
   ```

2. Create a `frontend/.env` file pointing at your backend:

   ```
   VITE_API_URL=http://127.0.0.1:8000
   ```

3. Run the dev server:

   ```bash
   npm run dev
   ```

   The app is now running at `http://localhost:5173`.

## Using the app

Register an account as a patient, doctor, or admin from the Register page, then log in. (For learning purposes, this project lets anyone self-register with any role — in a real production system, doctor/admin accounts would be created separately by an administrator instead of being open to public signup.)

## Notes on the current setup

- **Schema changes:** tables are created with `Base.metadata.create_all()` on startup, which is fine for development. If you change `models.py` after tables already exist, you'll need a migration tool like [Alembic](https://alembic.sqlalchemy.org/) to apply the change, or drop and recreate the tables in development.
- **Deploying to AWS** (a later goal for this project) is a separate step not covered here — it would typically involve containerizing the backend (e.g. deploy to ECS/Elastic Beanstalk), serving the frontend as a static build (e.g. S3 + CloudFront), and setting `DATABASE_URL`/`VITE_API_URL` as environment variables in that environment rather than `.env` files.
