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
        print(path.name)
        if path.name in applied:
            continue

        sql = path.read_text()
        pragmas, statements = _split_statements(sql)

        try:
            # Use explicit SQL BEGIN/COMMIT rather than conn.commit()/rollback().
            # Python's sqlite3 module auto-commits DDL (CREATE TABLE, ALTER TABLE,
            # etc.) before Python-level transaction management can protect them.
            # Explicit SQL transactions bypass that behaviour — SQLite's own DDL
            # is fully transactional, so a ROLLBACK here undoes schema changes too.
            #
            # PRAGMA statements must run outside a transaction, so we execute them
            # before BEGIN and track any that need to be restored on failure.
            for pragma in pragmas:
                conn.execute(pragma)
            conn.execute("BEGIN")
            for statement in statements:
                conn.execute(statement)
            conn.execute(
                "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
                (path.name, datetime.now(timezone.utc).isoformat()),
            )
            conn.execute("COMMIT")
            ran.append(path.name)
        except Exception as exc:
            conn.execute("ROLLBACK")
            raise RuntimeError(f"Migration {path.name!r} failed: {exc}") from exc
        finally:
            # Restore safe defaults after any PRAGMA changes made pre-transaction.
            if any(re.search(r"foreign_keys", p, re.IGNORECASE) for p in pragmas):
                conn.execute("PRAGMA foreign_keys = ON")

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


_TRANSACTION_CONTROL_RE = re.compile(
    r"^(BEGIN|COMMIT|ROLLBACK)(\s+\w+)*$", re.IGNORECASE
)
_PRAGMA_RE = re.compile(r"^PRAGMA\s+", re.IGNORECASE)


def _split_statements(sql: str) -> tuple[list[str], list[str]]:
    """
    Split a SQL string into (pragmas, statements).

    Transaction-control statements (BEGIN, COMMIT, ROLLBACK) are filtered out
    because the runner manages its own transaction.

    PRAGMA statements must run outside a transaction, so they are returned
    separately as `pragmas` to be executed before BEGIN. Only the first
    occurrence of each PRAGMA key is kept (the "before" pragma); the mirrored
    "after" pragma in the migration file is deduplicated away.
    """
    # Strip -- line comments
    sql = re.sub(r"--[^\n]*", "", sql)
    # Strip /* */ block comments
    sql = re.sub(r"/\*.*?\*/", "", sql, flags=re.DOTALL)
    all_statements = [s.strip() for s in sql.split(";") if s.strip()]

    pragmas: list[str] = []
    seen_pragma_keys: set[str] = set()
    statements: list[str] = []

    for s in all_statements:
        if _TRANSACTION_CONTROL_RE.match(s):
            continue
        if _PRAGMA_RE.match(s):
            # Deduplicate by the pragma key (e.g. "foreign_keys") so the
            # opening "= OFF" is kept and the closing "= ON" is not re-added.
            key_match = re.match(r"PRAGMA\s+(\w+)", s, re.IGNORECASE)
            key = key_match.group(1).lower() if key_match else s
            if key not in seen_pragma_keys:
                seen_pragma_keys.add(key)
                pragmas.append(s)
        else:
            statements.append(s)

    return pragmas, statements
