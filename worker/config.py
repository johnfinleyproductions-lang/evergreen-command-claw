"""Worker configuration. Loads .env.local from repo root (one level up)."""
import os
from pathlib import Path

from dotenv import load_dotenv

# Walk up from worker/config.py to repo root, load .env.local
_REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_REPO_ROOT / ".env.local")
load_dotenv(_REPO_ROOT / ".env")  # fallback


class Config:
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://command:command_secret@localhost:5433/evergreen_command",
    )
    POLL_INTERVAL_SECONDS: float = float(os.getenv("WORKER_POLL_INTERVAL", "2.0"))
    POOL_MIN_SIZE: int = int(os.getenv("WORKER_POOL_MIN", "1"))
    POOL_MAX_SIZE: int = int(os.getenv("WORKER_POOL_MAX", "4"))
    LOG_LEVEL: str = os.getenv("WORKER_LOG_LEVEL", "INFO")


config = Config()
