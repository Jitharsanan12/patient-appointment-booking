# Patient Appointment Booking System

A full-stack appointment booking app: patients book appointments with doctors, doctors manage their schedule, and admins can see everything.

**Stack:** FastAPI (Python) + SQLAlchemy + PostgreSQL (Neon) on the backend, React (Vite) on the frontend, JWT-based authentication.

## Features

- Patients: browse doctors, book appointments (date/time + reason), view their own upcoming appointments, cancel them
- Doctors: view their assigned appointments, mark them completed or cancelled; set weekly availability and block one-off unavailable dates
- Admins: view every appointment in the system; create doctor accounts
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

5. Create the one admin account. Public self-signup only ever creates patient accounts (see "Account roles" below), so the very first admin has to be created directly against the database instead of through the API. From the `backend/` folder, with the server stopped or running (either is fine):

   ```bash
   ./venv/bin/python seed_admin.py
   ```

   It'll prompt for an email, full name, and password, and refuses to run again once an admin already exists — so you can't accidentally create a second one.

   If you'd rather do it by hand in SQL instead of running the script, you can insert the row directly (replace the placeholder hash — see the script's use of `auth.hash_password` for how a real one is generated; never store a plain-text password):

   ```sql
   INSERT INTO users (email, hashed_password, full_name, role)
   VALUES ('admin@example.com', '<bcrypt-hashed-password>', 'Admin Name', 'admin');
   ```

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

The public Register page only ever creates a **patient** account — there's no role picker. Log in as a patient to browse doctors and book appointments.

### Account roles

- **Patient**: self-registers via the public Register page.
- **Doctor**: created by an admin, via the "Manage Doctors" section of the admin dashboard (or directly with `POST /admin/doctors`). The admin sets the doctor's email/name/specialization and either types a temporary password or lets the backend generate one — it's shown once in the response, so share it with the doctor before navigating away.
- **Admin**: exactly one, created once via `seed_admin.py` (see step 5 of Backend setup above). There's no API endpoint that creates an admin — that's intentional, so an admin account can never be created by anyone who only has API access.

## Notes on the current setup

- **Schema changes:** tables are created with `Base.metadata.create_all()` on startup, which is fine for development. If you change `models.py` after tables already exist, you'll need a migration tool like [Alembic](https://alembic.sqlalchemy.org/) to apply the change, or drop and recreate the tables in development.
- **Deploying to AWS** (a later goal for this project) is a separate step not covered here — it would typically involve containerizing the backend (e.g. deploy to ECS/Elastic Beanstalk), serving the frontend as a static build (e.g. S3 + CloudFront), and setting `DATABASE_URL`/`VITE_API_URL` as environment variables in that environment rather than `.env` files.
