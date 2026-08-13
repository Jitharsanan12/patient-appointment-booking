"""
Sets up the connection to our PostgreSQL database using SQLAlchemy.

Other files import `engine`, `SessionLocal`, and `Base` from here instead of
configuring the database connection themselves.
"""

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Load variables from the .env file (in the project root) into the environment.
# This is what makes os.getenv("DATABASE_URL") work below.
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Make sure a .env file exists in the "
        "project root with a DATABASE_URL variable."
    )

# The engine is the object SQLAlchemy uses to actually talk to the database.
engine = create_engine(DATABASE_URL)

# Each request will get its own database "session" (a workspace for queries)
# created from this factory.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# All of our database model classes (Doctor, Patient, Appointment, etc.)
# will inherit from this Base class.
Base = declarative_base()


def get_db():
    """
    FastAPI dependency that provides a database session to a request,
    and guarantees it gets closed afterwards, even if an error occurs.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
