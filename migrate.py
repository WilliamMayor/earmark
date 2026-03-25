#!/usr/bin/env python3
"""Apply pending SQL migrations to a SQLite database.

Usage:
    python migrate.py [DB_PATH]

DB_PATH defaults to transactions.db (relative to this script's directory).
The DB_PATH can also be set via the DB_PATH environment variable.
"""

import os
import sqlite3
import sys
from pathlib import Path

from sync.migrations import run_migrations

SCRIPT_DIR = Path(__file__).parent


def get_db_path() -> Path:
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    env_path = os.environ.get("DB_PATH")
    if env_path:
        return Path(env_path)
    return SCRIPT_DIR / "transactions.db"


def main() -> None:
    db_path = get_db_path()
    print(f"Database: {db_path}")

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")

    try:
        ran = run_migrations(conn)
        if ran:
            for name in ran:
                print(f"  Applied {name}")
            print(f"\n{len(ran)} migration(s) applied.")
        else:
            print("No pending migrations.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
