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

    # --- Heartbeat / crash recovery (Phase 5.3) ----------------------------
    # While a run is active, the worker bumps runs.last_heartbeat every
    # HEARTBEAT_INTERVAL_SECONDS. On startup we sweep any status='running'
    # rows whose heartbeat is older than STALE_HEARTBEAT_THRESHOLD_SECONDS
    # and flip them to 'failed' so a crash doesn't strand the queue.
    # Default ratio is 12x — gives plenty of slack for a slow tick before we
    # declare a row dead.
    HEARTBEAT_INTERVAL_SECONDS: float = float(
        os.getenv("WORKER_HEARTBEAT_INTERVAL", "10.0")
    )
    STALE_HEARTBEAT_THRESHOLD_SECONDS: float = float(
        os.getenv("WORKER_STALE_HEARTBEAT_THRESHOLD", "120.0")
    )

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
