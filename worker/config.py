"""Worker configuration. Loads .env.local from repo root (one level up)."""
import os
from pathlib import Path

from dotenv import load_dotenv

# Walk up from worker/config.py to repo root, load .env.local
_REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_REPO_ROOT / ".env.local")
load_dotenv(_REPO_ROOT / ".env")  # fallback


class Config:
    # --- Postgres ----------------------------------------------------------
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://command:command_secret@localhost:5433/evergreen_command",
    )
    POOL_MIN_SIZE: int = int(os.getenv("WORKER_POOL_MIN", "1"))
    POOL_MAX_SIZE: int = int(os.getenv("WORKER_POOL_MAX", "4"))

    # --- Worker loop -------------------------------------------------------
    POLL_INTERVAL_SECONDS: float = float(os.getenv("WORKER_POLL_INTERVAL", "2.0"))
    LOG_LEVEL: str = os.getenv("WORKER_LOG_LEVEL", "INFO")

    # --- LLM (llama.cpp) ---------------------------------------------------
    LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "http://127.0.0.1:8081")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "nemotron")
    LLM_TIMEOUT: float = float(os.getenv("LLM_TIMEOUT", "600.0"))
    LLM_TEMPERATURE: float = float(os.getenv("LLM_TEMPERATURE", "0.3"))

    # --- Agent -------------------------------------------------------------
    AGENT_MAX_ITERATIONS: int = int(os.getenv("AGENT_MAX_ITERATIONS", "10"))

    # --- Artifacts ---------------------------------------------------------
    ARTIFACTS_DIR: str = os.getenv(
        "ARTIFACTS_DIR",
        str(_REPO_ROOT / "worker" / "artifacts"),
    )


config = Config()
