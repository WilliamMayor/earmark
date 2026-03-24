"""
Lightweight database migration runner.

Migrations are .sql files in the `migrations/` directory at the project root,
named with a zero-padded numeric prefix so they sort correctly:

    migrations/
        0001_initial.sql
        0002_add_tags.sql
        ...

Each file is executed as a single transaction. Applied migrations are tracked
in a `schema_migrations` table that this module bootstraps automatically.

Usage:
    from sync.migrations import run_migrations
    run_migrations(conn)                          # uses default migrations dir
    run_migrations(conn, migrations_dir=some_path)  # override for testing
"""

import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

_DEFAULT_MIGRATIONS_DIR = Path(__file__).parent.parent / "migrations"

_BOOTSTRAP_SQL = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL
);
"""


def run_migrations(
    conn: sqlite3.Connection,
    migrations_dir: Path | None = None,
) -> list[str]:
    """
    Apply any unapplied migrations in order.

    Returns the names of migrations applied during this call (empty list if
    everything was already up to date).

    Raises RuntimeError if a migration fails, leaving the database unchanged
    for that migration (previous migrations in the same call are committed).
    """
    if migrations_dir is None:
        migrations_dir = _DEFAULT_MIGRATIONS_DIR

    # Bootstrap: ensure the tracking table exists before we query it
    conn.executescript(_BOOTSTRAP_SQL)
    conn.commit()

    applied = _applied_migrations(conn)
    ran: list[str] = []

    for path in _migration_files(migrations_dir):
        if path.name in applied:
            continue

        sql = path.read_text()
        statements = _split_statements(sql)

        try:
            for statement in statements:
                conn.execute(statement)
            conn.execute(
                "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
                (path.name, datetime.now(timezone.utc).isoformat()),
            )
            conn.commit()
            ran.append(path.name)
        except Exception as exc:
            conn.rollback()
            raise RuntimeError(f"Migration {path.name!r} failed: {exc}") from exc

    return ran


def applied_migrations(conn: sqlite3.Connection) -> list[str]:
    """Return names of all applied migrations in application order."""
    return [
        row[0]
        for row in conn.execute(
            "SELECT name FROM schema_migrations ORDER BY id ASC"
        ).fetchall()
    ]


def _applied_migrations(conn: sqlite3.Connection) -> set[str]:
    return set(applied_migrations(conn))


def _migration_files(migrations_dir: Path) -> list[Path]:
    """Return .sql files sorted by filename (which sorts by numeric prefix)."""
    return sorted(migrations_dir.glob("*.sql"), key=lambda p: p.name)


def _split_statements(sql: str) -> list[str]:
    """
    Split a SQL string into individual statements, stripping comments.
    Simple but sufficient for DDL-only migration files.
    """
    # Strip -- line comments
    sql = re.sub(r"--[^\n]*", "", sql)
    # Strip /* */ block comments
    sql = re.sub(r"/\*.*?\*/", "", sql, flags=re.DOTALL)
    return [s.strip() for s in sql.split(";") if s.strip()]
