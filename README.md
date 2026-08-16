# CareSlot

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
│   │   ├── email_utils.py  # Sends transactional emails via Resend
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

6. (Optional) Set up email delivery for doctor welcome emails. When an admin creates a doctor account, the system emails them their login + temporary password via [Resend](https://resend.com). This step is optional — if you skip it, doctor creation still works exactly the same, the password just won't be emailed (it's always shown on screen to the admin either way).

   1. Sign up for a free Resend account at [resend.com](https://resend.com) (the free tier is enough for this).
   2. In the Resend dashboard, go to **API Keys** and create one.
   3. Add it to your **project root** `.env` file, alongside `DATABASE_URL`:

      ```
      RESEND_API_KEY=re_your_key_here
      ```

   4. **Important limitation while testing:** this project sends from Resend's shared `onboarding@resend.dev` address, which requires no setup — but without your own verified sending domain, Resend will only actually deliver to **the email address you signed up to Resend with**. Sending to any other address (like a real doctor's email) will fail with an "Invalid `to` field" error, and the admin dashboard will show that the email couldn't be sent (falling back to the on-screen password, which always still works).
      - To test the email actually arriving, create a doctor using your own Resend account's email address, or Resend's special test address `delivered@resend.dev` (always reports success, sends nowhere real).
      - To email real doctors at their real addresses, verify your own domain in the Resend dashboard and change `FROM_EMAIL` in `backend/app/email_utils.py` to an address on that domain.

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
- **Doctor**: created by an admin, via the "Manage Doctors" section of the admin dashboard (or directly with `POST /admin/doctors`). The admin sets the doctor's email/name/specialization and either types a temporary password or lets the backend generate one. If Resend is configured (see step 6 of Backend setup), it's emailed to the doctor automatically; either way it's also shown once in the admin dashboard as a fallback, so share it with the doctor before navigating away if the email didn't go through.
- **Admin**: exactly one, created once via `seed_admin.py` (see step 5 of Backend setup above). There's no API endpoint that creates an admin — that's intentional, so an admin account can never be created by anyone who only has API access.

## Notes on the current setup

- **Schema changes:** tables are created with `Base.metadata.create_all()` on startup, which is fine for development. If you change `models.py` after tables already exist, you'll need a migration tool like [Alembic](https://alembic.sqlalchemy.org/) to apply the change, or drop and recreate the tables in development.
- **Deploying to AWS** (a later goal for this project) is a separate step not covered here — it would typically involve containerizing the backend (e.g. deploy to ECS/Elastic Beanstalk), serving the frontend as a static build (e.g. S3 + CloudFront), and setting `DATABASE_URL`/`VITE_API_URL` as environment variables in that environment rather than `.env` files.

## Known limitations

- **Resend sandbox restriction — affects every email the app sends, not just doctor welcome emails.** All outgoing email (the doctor welcome email when an admin creates a doctor account, *and* the appointment-cancellation notifications — "your appointment was cancelled" to the patient, "this slot is now free" to the doctor) goes out from Resend's shared `onboarding@resend.dev` sender. Until you verify your own domain with Resend, that sender can only successfully deliver to **the single email address your Resend account was created with**. Sending to any other address fails with an error like:

  > You can only send testing emails to your own email address (you@example.com). To send emails to other recipients, please verify a domain at resend.com/domains...

  This is a Resend account restriction, not a bug in the app — the backend attempts the send with the correct recipient, Resend rejects it, and the failure is caught and printed to the server console (see `_send_email` in `backend/app/email_utils.py`). A failed send never blocks the action that triggered it: the appointment still gets cancelled (or the doctor account still gets created) either way — check the server logs for a line starting with `Failed to send email to ...` to confirm a send was attempted and see exactly why it didn't go through.

  **What this means for testing:** to actually see a cancellation (or welcome) email land in an inbox, the *recipient* — the patient being notified, or the doctor — needs to be a test account registered with the same email address you signed up to Resend with, or you can use Resend's special test address `delivered@resend.dev` (always reports success, delivers nowhere real). Testing with any other real address will always fail to deliver; that's expected, not broken.

  To send to real, arbitrary addresses, verify your own domain in the Resend dashboard and update `FROM_EMAIL` in `backend/app/email_utils.py` to an address on that domain.
