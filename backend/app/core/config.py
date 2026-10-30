"""Load backend configuration independently of the command's working directory."""
import os
from pathlib import Path

from dotenv import load_dotenv


ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(ENV_FILE, override=False)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://budget_user:budget_password@localhost:5432/budget_tracker",
)
JWT_SECRET = os.getenv("JWT_SECRET", "")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
COMPANY_DOMAIN = os.getenv("COMPANY_DOMAIN", "cowrywise.com").strip().lower()
