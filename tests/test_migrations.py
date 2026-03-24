"""Tests for sync/migrations.py — schema migration runner."""

import sqlite3
from pathlib import Path

import pytest

from sync.migrations import _split_statements, applied_migrations, run_migrations


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def conn():
    """Bare in-memory connection (no schema applied yet)."""
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    yield c
    c.close()


@pytest.fixture
def migrations_dir(tmp_path):
    """Empty temporary migrations directory."""
    d = tmp_path / "migrations"
    d.mkdir()
    return d


def write_migration(migrations_dir: Path, name: str, sql: str) -> Path:
    p = migrations_dir / name
    p.write_text(sql)
    return p


# ---------------------------------------------------------------------------
# Bootstrapping
# ---------------------------------------------------------------------------

def test_run_migrations_creates_tracking_table(conn, migrations_dir):
    run_migrations(conn, migrations_dir)
    tables = {
        row[0]
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    }
    assert "schema_migrations" in tables


def test_run_migrations_empty_dir_returns_empty_list(conn, migrations_dir):
    result = run_migrations(conn, migrations_dir)
    assert result == []


# ---------------------------------------------------------------------------
# Applying migrations
# ---------------------------------------------------------------------------

def test_single_migration_applied(conn, migrations_dir):
    write_migration(migrations_dir, "0001_create_foo.sql", "CREATE TABLE foo (id INTEGER PRIMARY KEY);")
    result = run_migrations(conn, migrations_dir)
    assert result == ["0001_create_foo.sql"]
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    assert "foo" in tables


def test_multiple_migrations_applied_in_order(conn, migrations_dir):
    write_migration(migrations_dir, "0001_a.sql", "CREATE TABLE a (id INTEGER PRIMARY KEY);")
    write_migration(migrations_dir, "0002_b.sql", "CREATE TABLE b (id INTEGER PRIMARY KEY);")
    write_migration(migrations_dir, "0003_c.sql", "CREATE TABLE c (id INTEGER PRIMARY KEY);")

    result = run_migrations(conn, migrations_dir)

    assert result == ["0001_a.sql", "0002_b.sql", "0003_c.sql"]
    assert applied_migrations(conn) == ["0001_a.sql", "0002_b.sql", "0003_c.sql"]


def test_migrations_applied_in_filename_order_not_filesystem_order(conn, migrations_dir):
    # Write them in reverse order to ensure sorting is by name, not discovery order
    write_migration(migrations_dir, "0003_last.sql", "CREATE TABLE last_tbl (id INTEGER);")
    write_migration(migrations_dir, "0001_first.sql", "CREATE TABLE first_tbl (id INTEGER);")
    write_migration(migrations_dir, "0002_middle.sql", "CREATE TABLE middle_tbl (id INTEGER);")

    run_migrations(conn, migrations_dir)

    assert applied_migrations(conn) == ["0001_first.sql", "0002_middle.sql", "0003_last.sql"]


# ---------------------------------------------------------------------------
# Idempotency
# ---------------------------------------------------------------------------

def test_second_call_skips_already_applied(conn, migrations_dir):
    write_migration(migrations_dir, "0001_foo.sql", "CREATE TABLE foo (id INTEGER);")

    run_migrations(conn, migrations_dir)
    result = run_migrations(conn, migrations_dir)  # second call

    assert result == []


def test_second_call_only_applies_new_migrations(conn, migrations_dir):
    write_migration(migrations_dir, "0001_foo.sql", "CREATE TABLE foo (id INTEGER);")
    run_migrations(conn, migrations_dir)

    write_migration(migrations_dir, "0002_bar.sql", "CREATE TABLE bar (id INTEGER);")
    result = run_migrations(conn, migrations_dir)

    assert result == ["0002_bar.sql"]


def test_applied_migrations_reflects_current_state(conn, migrations_dir):
    write_migration(migrations_dir, "0001_a.sql", "CREATE TABLE a (id INTEGER);")
    write_migration(migrations_dir, "0002_b.sql", "CREATE TABLE b (id INTEGER);")
    run_migrations(conn, migrations_dir)

    assert applied_migrations(conn) == ["0001_a.sql", "0002_b.sql"]


# ---------------------------------------------------------------------------
# Multi-statement migrations
# ---------------------------------------------------------------------------

def test_multi_statement_migration(conn, migrations_dir):
    sql = """
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER);
    """
    write_migration(migrations_dir, "0001_multi.sql", sql)
    run_migrations(conn, migrations_dir)

    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    assert "users" in tables
    assert "posts" in tables


def test_failed_migration_rolls_back_ddl(conn, migrations_dir):
    # First statement is valid DDL; second is invalid. Both should be absent
    # after the failure — the transaction must cover DDL, not just DML.
    sql = """
    CREATE TABLE should_not_exist (id INTEGER PRIMARY KEY);
    THIS IS NOT VALID SQL;
    """
    write_migration(migrations_dir, "0001_partial.sql", sql)

    with pytest.raises(RuntimeError):
        run_migrations(conn, migrations_dir)

    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    assert "should_not_exist" not in tables


def test_migration_with_comments(conn, migrations_dir):
    sql = """
    -- Create the widgets table
    CREATE TABLE widgets (
        id   INTEGER PRIMARY KEY,
        /* the widget name */
        name TEXT
    );
    """
    write_migration(migrations_dir, "0001_widgets.sql", sql)
    run_migrations(conn, migrations_dir)

    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    assert "widgets" in tables


# ---------------------------------------------------------------------------
# Failure handling
# ---------------------------------------------------------------------------

def test_failed_migration_raises_runtime_error(conn, migrations_dir):
    write_migration(migrations_dir, "0001_bad.sql", "THIS IS NOT VALID SQL;")

    with pytest.raises(RuntimeError, match="0001_bad.sql"):
        run_migrations(conn, migrations_dir)


def test_failed_migration_not_recorded_as_applied(conn, migrations_dir):
    write_migration(migrations_dir, "0001_bad.sql", "THIS IS NOT VALID SQL;")

    with pytest.raises(RuntimeError):
        run_migrations(conn, migrations_dir)

    assert applied_migrations(conn) == []


def test_failed_migration_does_not_affect_previous_successful_ones(conn, migrations_dir):
    write_migration(migrations_dir, "0001_good.sql", "CREATE TABLE good (id INTEGER);")
    write_migration(migrations_dir, "0002_bad.sql", "NOT VALID SQL;")

    with pytest.raises(RuntimeError):
        run_migrations(conn, migrations_dir)

    # First migration was committed before the failure
    assert "0001_good.sql" in applied_migrations(conn)
    assert "0002_bad.sql" not in applied_migrations(conn)


# ---------------------------------------------------------------------------
# Real migrations directory
# ---------------------------------------------------------------------------

def test_real_migrations_dir_applies_initial_schema(conn):
    """Smoke test: the actual migrations directory produces the expected tables."""
    run_migrations(conn)

    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    assert "sessions" in tables
    assert "accounts" in tables
    assert "transactions" in tables
    assert "schema_migrations" in tables


def test_real_migrations_idempotent(conn):
    run_migrations(conn)
    result = run_migrations(conn)
    assert result == []


# ---------------------------------------------------------------------------
# _split_statements utility
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("sql, expected_count", [
    ("CREATE TABLE a (id INTEGER);", 1),
    ("CREATE TABLE a (id INTEGER);\nCREATE TABLE b (id INTEGER);", 2),
    ("-- comment\nCREATE TABLE a (id INTEGER);", 1),
    ("/* block comment */ CREATE TABLE a (id INTEGER);", 1),
    ("   ;   ;   ", 0),  # empty statements ignored
])
def test_split_statements(sql, expected_count):
    assert len(_split_statements(sql)) == expected_count
