import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Config:
    app_id: str
    private_key: str  # PEM string
    base_url: str
    redirect_url: str
    db_path: Path


def load_config() -> Config:
    app_id = os.environ["ENABLE_BANKING_APP_ID"]

    key_path = os.environ.get("ENABLE_BANKING_PRIVATE_KEY_PATH", "private_key.pem")
    private_key = Path(key_path).read_text()

    return Config(
        app_id=app_id,
        private_key=private_key,
        base_url=os.environ.get("ENABLE_BANKING_BASE_URL", "https://api.enablebanking.com"),
        redirect_url=os.environ.get("ENABLE_BANKING_REDIRECT_URL", "https://example.com/callback"),
        db_path=Path(os.environ.get("DB_PATH", "transactions.db")),
    )
