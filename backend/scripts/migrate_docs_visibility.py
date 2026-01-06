#!/usr/bin/env python3
"""
Migration script to add document visibility, favorites, and notifications.
Run this script after updating the codebase with the new docs UI features.

Usage:
    python -m scripts.migrate_docs_visibility
"""

import asyncio
import os
import sys

# Add the src directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


async def run_migration():
    """Run the database migration."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL environment variable not set")
        sys.exit(1)

    # Convert to async URL if needed
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif database_url.startswith("sqlite://"):
        database_url = database_url.replace("sqlite://", "sqlite+aiosqlite://", 1)

    print(f"Connecting to database...")
    engine = create_async_engine(database_url, echo=True)

    async with engine.begin() as conn:
        # Check database type
        is_postgres = "postgresql" in database_url.lower()
        is_sqlite = "sqlite" in database_url.lower()

        print("\n=== Adding visibility column to documents table ===")
        if is_postgres:
            # PostgreSQL
            await conn.execute(text("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name='documents' AND column_name='visibility'
                    ) THEN
                        ALTER TABLE documents ADD COLUMN visibility VARCHAR(20) DEFAULT 'workspace';
                    END IF;
                END $$;
            """))
        elif is_sqlite:
            # SQLite - check if column exists
            result = await conn.execute(text("PRAGMA table_info(documents)"))
            columns = [row[1] for row in result.fetchall()]
            if 'visibility' not in columns:
                await conn.execute(text("ALTER TABLE documents ADD COLUMN visibility VARCHAR(20) DEFAULT 'workspace'"))
        print("Done!")

        print("\n=== Creating document_favorites table ===")
        if is_postgres:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS document_favorites (
                    id VARCHAR(36) PRIMARY KEY,
                    document_id VARCHAR(36) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                    developer_id VARCHAR(36) NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    CONSTRAINT uq_document_favorites_doc_dev UNIQUE (document_id, developer_id)
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_document_favorites_document_id ON document_favorites(document_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_document_favorites_developer_id ON document_favorites(developer_id)"))
        elif is_sqlite:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS document_favorites (
                    id VARCHAR(36) PRIMARY KEY,
                    document_id VARCHAR(36) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                    developer_id VARCHAR(36) NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (document_id, developer_id)
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_document_favorites_document_id ON document_favorites(document_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_document_favorites_developer_id ON document_favorites(developer_id)"))
        print("Done!")

        print("\n=== Creating document_notifications table ===")
        if is_postgres:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS document_notifications (
                    id VARCHAR(36) PRIMARY KEY,
                    document_id VARCHAR(36) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                    developer_id VARCHAR(36) NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
                    type VARCHAR(20) NOT NULL,
                    message TEXT NOT NULL,
                    is_read BOOLEAN DEFAULT FALSE,
                    read_at TIMESTAMP WITH TIME ZONE,
                    created_by_id VARCHAR(36) REFERENCES developers(id) ON DELETE SET NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_document_notifications_document_id ON document_notifications(document_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_document_notifications_developer_id ON document_notifications(developer_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_document_notifications_is_read ON document_notifications(is_read)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_document_notifications_created_at ON document_notifications(created_at)"))
        elif is_sqlite:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS document_notifications (
                    id VARCHAR(36) PRIMARY KEY,
                    document_id VARCHAR(36) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                    developer_id VARCHAR(36) NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
                    type VARCHAR(20) NOT NULL,
                    message TEXT NOT NULL,
                    is_read BOOLEAN DEFAULT 0,
                    read_at TIMESTAMP,
                    created_by_id VARCHAR(36) REFERENCES developers(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_document_notifications_document_id ON document_notifications(document_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_document_notifications_developer_id ON document_notifications(developer_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_document_notifications_is_read ON document_notifications(is_read)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_document_notifications_created_at ON document_notifications(created_at)"))
        print("Done!")

    await engine.dispose()
    print("\n=== Migration completed successfully! ===")


if __name__ == "__main__":
    asyncio.run(run_migration())
