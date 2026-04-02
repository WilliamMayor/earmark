import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Config:
    api_key: str
    db_path: Path


def load_config() -> Config:
    return Config(
        api_key=os.environ["LUNCHFLOW_API_KEY"],
        db_path=Path(os.environ.get("DB_PATH", "data/transactions.db")),
    )
