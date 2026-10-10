"""Application settings (read from backend/.env or environment variables)."""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]      # .../voice Bank/backend
BASE_DIR = BACKEND_DIR.parent                          # .../voice Bank


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(BACKEND_DIR / ".env"), extra="ignore")

    # Storage / serving
    db_path: str = str(BASE_DIR / "bank.db")
    web_dir: str = str(BASE_DIR / "web")
    port: int = 5000
    cors_origins: str = (
        "http://localhost:5000,http://127.0.0.1:5000,http://localhost:5501,http://127.0.0.1:5501"
    )

    # Security
    admin_token: str = ""
    secret_key: str = "dev-secret-change-me"
    session_minutes: int = 60
    max_pin_attempts: int = 5
    lock_minutes: int = 15

    # Money rules
    max_amount: int = 10_000_000          # rupees, per transaction
    confirm_ttl_seconds: int = 120

    # Risk thresholds (score 0-100)
    risk_medium: int = 30
    risk_high: int = 60
    tz_offset_minutes: int = 330          # IST, used for the "unusual hour" rule

    # Text to speech (Microsoft Edge neural voices through the edge-tts package)
    tts_cache_dir: str = str(BACKEND_DIR / "tts_cache")
    tts_voice_en: str = "en-IN-NeerjaNeural"
    tts_voice_hi: str = "hi-IN-SwaraNeural"
    tts_voice_kn: str = "kn-IN-SapnaNeural"
    tts_rate: str = "-5%"
    tts_max_chars: int = 400
    tts_per_minute: int = 90


settings = Settings()
