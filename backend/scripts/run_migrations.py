#!/usr/bin/env python3
"""
Migration Runner Script

Runs all SQL migration scripts in the scripts directory.
Tracks applied migrations in a database table to avoid re-running.

Usage:
    # Run all pending migrations
    python scripts/run_migrations.py

    # Run in dry-run mode (show what would be executed)
    python scripts/run_migrations.py --dry-run

    # Run a specific migration
    python scripts/run_migrations.py --file migrate_knowledge_graph.sql

    # List all migrations and their status
    python scripts/run_migrations.py --list

    # Force re-run a migration (use with caution)
    python scripts/run_migrations.py --file migrate_knowledge_graph.sql --force

    # Use custom database URL
    python scripts/run_migrations.py --database-url postgresql://user:pass@host:5432/db

Environment Variables:
    DATABASE_URL - PostgreSQL connection string (default: from .env or localhost)
"""

import argparse
import asyncio
import hashlib
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Add backend/src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import asyncpg


# Default database URL for local development
DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/aexy"

# Migration files directory
SCRIPTS_DIR = Path(__file__).parent

# Migration tracking table
MIGRATIONS_TABLE = "schema_migrations"


def normalize_database_url(url: str) -> str:
    """Convert SQLAlchemy-style URL to asyncpg-compatible URL."""
    # Remove SQLAlchemy driver prefix if present
    if url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql+asyncpg://", "postgresql://", 1)
    elif url.startswith("postgresql+psycopg2://"):
        url = url.replace("postgresql+psycopg2://", "postgresql://", 1)
    return url


def get_database_url() -> str:
    """Get database URL from environment or .env file."""
    # Check environment variable first
    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        return normalize_database_url(db_url)

    # Try to load from .env file
    env_file = Path(__file__).parent.parent / ".env"
    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line.startswith("DATABASE_URL="):
                    url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    return normalize_database_url(url)

    return DEFAULT_DATABASE_URL


def get_migration_files() -> list[Path]:
    """Get all migration SQL files sorted by name."""
    files = sorted(SCRIPTS_DIR.glob("migrate*.sql"))
    return files


def calculate_checksum(file_path: Path) -> str:
    """Calculate MD5 checksum of a file."""
    with open(file_path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()


async def ensure_migrations_table(conn: asyncpg.Connection) -> None:
    """Create the migrations tracking table if it doesn't exist."""
    await conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {MIGRATIONS_TABLE} (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            checksum VARCHAR(32) NOT NULL,
            applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            execution_time_ms INTEGER
        );

        CREATE INDEX IF NOT EXISTS ix_schema_migrations_name
            ON {MIGRATIONS_TABLE}(name);

        COMMENT ON TABLE {MIGRATIONS_TABLE} IS 'Tracks applied database migrations';
    """)


async def get_applied_migrations(conn: asyncpg.Connection) -> dict[str, dict]:
    """Get all applied migrations from the database."""
    rows = await conn.fetch(f"""
        SELECT name, checksum, applied_at, execution_time_ms
        FROM {MIGRATIONS_TABLE}
    """)
    return {
        row["name"]: {
            "checksum": row["checksum"],
            "applied_at": row["applied_at"],
            "execution_time_ms": row["execution_time_ms"],
        }
        for row in rows
    }


async def record_migration(
    conn: asyncpg.Connection,
    name: str,
    checksum: str,
    execution_time_ms: int,
) -> None:
    """Record a successfully applied migration."""
    await conn.execute(
        f"""
        INSERT INTO {MIGRATIONS_TABLE} (name, checksum, execution_time_ms)
        VALUES ($1, $2, $3)
        ON CONFLICT (name) DO UPDATE SET
            checksum = EXCLUDED.checksum,
            applied_at = NOW(),
            execution_time_ms = EXCLUDED.execution_time_ms
        """,
        name,
        checksum,
        execution_time_ms,
    )


async def run_migration(
    conn: asyncpg.Connection,
    file_path: Path,
    dry_run: bool = False,
) -> tuple[bool, int]:
    """
    Run a single migration file.

    Returns:
        Tuple of (success, execution_time_ms)
    """
    name = file_path.name
    checksum = calculate_checksum(file_path)

    print(f"\n{'[DRY RUN] ' if dry_run else ''}Running migration: {name}")
    print(f"  Checksum: {checksum}")

    if dry_run:
        print(f"  Would execute: {file_path}")
        return True, 0

    sql = file_path.read_text()

    start_time = datetime.now(timezone.utc)
    try:
        await conn.execute(sql)
        end_time = datetime.now(timezone.utc)
        execution_time_ms = int((end_time - start_time).total_seconds() * 1000)

        await record_migration(conn, name, checksum, execution_time_ms)

        print(f"  ✓ Completed in {execution_time_ms}ms")
        return True, execution_time_ms

    except Exception as e:
        print(f"  ✗ Failed: {e}")
        return False, 0


async def list_migrations(database_url: str) -> None:
    """List all migrations and their status."""
    conn = await asyncpg.connect(database_url)
    try:
        await ensure_migrations_table(conn)
        applied = await get_applied_migrations(conn)
        files = get_migration_files()

        print("\nMigration Status")
        print("=" * 80)
        print(f"{'Migration':<50} {'Status':<10} {'Applied At':<20}")
        print("-" * 80)

        for file_path in files:
            name = file_path.name
            current_checksum = calculate_checksum(file_path)

            if name in applied:
                info = applied[name]
                if info["checksum"] == current_checksum:
                    status = "✓ Applied"
                else:
                    status = "⚠ Changed"
                applied_at = info["applied_at"].strftime("%Y-%m-%d %H:%M") if info["applied_at"] else "N/A"
            else:
                status = "○ Pending"
                applied_at = "-"

            print(f"{name:<50} {status:<10} {applied_at:<20}")

        print("-" * 80)
        print(f"Total: {len(files)} migrations, {len(applied)} applied")

    finally:
        await conn.close()


async def run_migrations(
    database_url: str,
    dry_run: bool = False,
    specific_file: str | None = None,
    force: bool = False,
) -> bool:
    """
    Run pending migrations.

    Args:
        database_url: PostgreSQL connection string
        dry_run: If True, don't actually execute migrations
        specific_file: If provided, only run this specific migration
        force: If True, re-run even if already applied

    Returns:
        True if all migrations succeeded, False otherwise
    """
    conn = await asyncpg.connect(database_url)
    try:
        await ensure_migrations_table(conn)
        applied = await get_applied_migrations(conn)
        files = get_migration_files()

        if specific_file:
            # Run specific migration
            file_path = SCRIPTS_DIR / specific_file
            if not file_path.exists():
                print(f"Error: Migration file not found: {specific_file}")
                return False
            files = [file_path]

        pending = []
        changed = []
        for file_path in files:
            name = file_path.name
            current_checksum = calculate_checksum(file_path)

            if name not in applied:
                pending.append(file_path)
            elif applied[name]["checksum"] != current_checksum:
                changed.append(file_path)
            elif force and specific_file:
                pending.append(file_path)

        # If force is set and we have changed migrations, add them to pending
        if force and changed:
            pending.extend(changed)
            changed = []

        if not pending:
            print("\n✓ All migrations are up to date!")
            if changed:
                print(f"\n⚠ Warning: {len(changed)} migration(s) have changed since last run:")
                for f in changed:
                    print(f"  - {f.name}")
                print("  Use --force to re-run if needed.")
            return True

        print(f"\n{'[DRY RUN] ' if dry_run else ''}Running {len(pending)} pending migration(s)...")

        success_count = 0
        fail_count = 0
        total_time_ms = 0

        for file_path in pending:
            success, time_ms = await run_migration(conn, file_path, dry_run)
            if success:
                success_count += 1
                total_time_ms += time_ms
            else:
                fail_count += 1
                if not dry_run:
                    print("\n✗ Migration failed. Stopping.")
                    break

        print(f"\n{'[DRY RUN] ' if dry_run else ''}Summary:")
        print(f"  Successful: {success_count}")
        print(f"  Failed: {fail_count}")
        if not dry_run:
            print(f"  Total time: {total_time_ms}ms")

        return fail_count == 0

    finally:
        await conn.close()


def main():
    parser = argparse.ArgumentParser(
        description="Run database migrations",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be executed without running",
    )
    parser.add_argument(
        "--file",
        type=str,
        help="Run a specific migration file",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force re-run even if already applied",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        dest="list_migrations",
        help="List all migrations and their status",
    )
    parser.add_argument(
        "--database-url",
        type=str,
        help="PostgreSQL connection string (default: from DATABASE_URL env or .env)",
    )

    args = parser.parse_args()

    if args.database_url:
        database_url = normalize_database_url(args.database_url)
    else:
        database_url = get_database_url()

    # Mask password in output
    safe_url = database_url
    if "@" in safe_url:
        parts = safe_url.split("@")
        if ":" in parts[0]:
            user_pass = parts[0].rsplit(":", 1)
            safe_url = f"{user_pass[0]}:****@{parts[1]}"

    print(f"Database: {safe_url}")

    if args.list_migrations:
        asyncio.run(list_migrations(database_url))
    else:
        success = asyncio.run(
            run_migrations(
                database_url,
                dry_run=args.dry_run,
                specific_file=args.file,
                force=args.force,
            )
        )
        sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
