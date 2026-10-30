"""Apply numbered SQL migrations; adopting an existing database is explicit."""
import argparse
import hashlib
from pathlib import Path

import psycopg

from app.core.config import DATABASE_URL

MIGRATIONS = Path(__file__).resolve().parents[1] / "sql" / "migrations"
BASELINE_COLUMNS = {
    "teams": {"id", "name", "created_at", "created_by"},
    "users": {"id", "google_sub", "email", "full_name", "role", "team_id", "last_login_at", "created_at"},
    "budgets": {"id", "team_id", "period", "created_by", "created_at"},
    "line_items": {"id", "budget_id", "code", "amount", "currency", "description", "purpose", "source", "created_at"},
}


def check_baseline(conn):
    for table, required in BASELINE_COLUMNS.items():
        columns = conn.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = %s",
            (table,),
        ).fetchall()
        if not required.issubset({row[0] for row in columns}):
            raise ValueError(f"Existing {table} table does not match the baseline; no migration recorded")
    amount = conn.execute(
        """SELECT numeric_precision, numeric_scale FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name = 'line_items' AND column_name = 'amount'"""
    ).fetchone()
    if amount != (14, 2):
        raise ValueError("Existing amount column must be NUMERIC(14,2)")


def apply_migrations(conn, adopt_existing=False):
    conn.execute("SELECT pg_advisory_xact_lock(724316902)")
    conn.execute("""CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY, checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""")
    existing = dict(conn.execute("SELECT version, checksum FROM schema_migrations").fetchall())
    applied = []
    for migration in sorted(MIGRATIONS.glob('[0-9][0-9][0-9]_*.sql')):
        content = migration.read_text()
        checksum = hashlib.sha256(content.encode()).hexdigest()
        if migration.name in existing:
            if existing[migration.name] != checksum:
                raise ValueError(f"Previously applied migration changed: {migration.name}")
            continue
        if migration.name == '001_initial.sql':
            tables_exist = any(conn.execute("SELECT to_regclass(%s)", (name,)).fetchone()[0] is not None for name in BASELINE_COLUMNS)
            if tables_exist:
                if not adopt_existing:
                    raise ValueError("Existing tables found. Use --adopt-existing to verify and record the baseline without recreating tables")
                check_baseline(conn)
            else:
                conn.execute(content)
        else:
            conn.execute(content)
        conn.execute("INSERT INTO schema_migrations (version, checksum) VALUES (%s, %s)", (migration.name, checksum))
        applied.append(migration.name)
    return applied


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--adopt-existing', action='store_true')
    args = parser.parse_args()
    with psycopg.connect(DATABASE_URL, connect_timeout=5) as conn:
        applied = apply_migrations(conn, args.adopt_existing)
    print('Applied: ' + ', '.join(applied) if applied else 'Database is up to date')


if __name__ == '__main__':
    main()
