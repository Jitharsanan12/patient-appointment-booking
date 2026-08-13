"""
One-time script to create the system's single admin account.

This is intentionally NOT an API endpoint — if "create an admin" were
reachable over HTTP, anyone who found the endpoint could grant themselves
full access to every appointment in the system. Instead, this script talks
directly to the database and is meant to be run manually, once, by whoever
controls the server/database (i.e. you).

Run from the backend/ folder:
    ./venv/bin/python seed_admin.py

It refuses to run if an admin account already exists, so you can't
accidentally create a second one by running it again.
"""

import getpass
import sys

from app.database import SessionLocal
from app import models, auth


def main():
    db = SessionLocal()
    try:
        existing_admin = db.query(models.User).filter(models.User.role == models.UserRole.admin).first()
        if existing_admin:
            print(f"An admin account already exists ({existing_admin.email}). Refusing to create another.")
            sys.exit(1)

        email = input("Admin email: ").strip()
        full_name = input("Admin full name: ").strip()
        # getpass hides the password as you type it, instead of echoing it
        # to the terminal.
        password = getpass.getpass("Admin password: ")
        confirm = getpass.getpass("Confirm password: ")

        if not email or not full_name or not password:
            print("Email, full name, and password are all required.")
            sys.exit(1)
        if password != confirm:
            print("Passwords did not match.")
            sys.exit(1)

        existing_user = db.query(models.User).filter(models.User.email == email).first()
        if existing_user:
            print(f"A user with email {email} already exists.")
            sys.exit(1)

        admin = models.User(
            email=email,
            hashed_password=auth.hash_password(password),
            full_name=full_name,
            role=models.UserRole.admin,
        )
        db.add(admin)
        db.commit()
        print(f"Admin account created: {email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
