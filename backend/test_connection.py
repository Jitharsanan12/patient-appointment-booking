"""
One-off script to confirm the app can connect to the PostgreSQL database
defined by DATABASE_URL in the .env file. Run with:

    ./venv/bin/python test_connection.py

Safe to delete once you've confirmed the connection works.
"""

from sqlalchemy import text
from app.database import engine

with engine.connect() as connection:
    result = connection.execute(text("SELECT version();"))
    version = result.scalar()
    print("Connected successfully!")
    print("PostgreSQL version:", version)
