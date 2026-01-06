#!/usr/bin/env python3
"""
Data migration script to create default spaces for existing workspaces.
Run this script after running the schema migration (migrate_document_spaces.sql).

Usage:
    python -m scripts.migrate_document_spaces_data
"""

import asyncio
import os
import sys
from uuid import uuid4
from datetime import datetime, timezone

# Add the src directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker


async def run_migration():
    """Run the data migration."""
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
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        async with session.begin():
            # Get all workspaces
            print("\n=== Finding workspaces without default spaces ===")
            result = await session.execute(text("""
                SELECT w.id, w.name, w.owner_id
                FROM workspaces w
                WHERE NOT EXISTS (
                    SELECT 1 FROM document_spaces ds
                    WHERE ds.workspace_id = w.id AND ds.is_default = true
                )
            """))
            workspaces = result.fetchall()
            print(f"Found {len(workspaces)} workspaces without default spaces")

            for ws_id, ws_name, owner_id in workspaces:
                print(f"\n--- Processing workspace: {ws_name} ({ws_id}) ---")

                # Create default space
                space_id = str(uuid4())
                now = datetime.now(timezone.utc)

                await session.execute(text("""
                    INSERT INTO document_spaces (
                        id, workspace_id, name, slug, description, icon, color,
                        is_default, is_archived, settings, created_by_id,
                        created_at, updated_at
                    ) VALUES (
                        :id, :workspace_id, 'General', 'general',
                        'Default space for all workspace documents',
                        '📄', '#6366F1', true, false, '{}', :owner_id,
                        :now, :now
                    )
                """), {
                    "id": space_id,
                    "workspace_id": ws_id,
                    "owner_id": owner_id,
                    "now": now,
                })
                print(f"  Created default space: {space_id}")

                # Get all workspace members
                members_result = await session.execute(text("""
                    SELECT developer_id, role FROM workspace_members
                    WHERE workspace_id = :workspace_id AND status = 'active'
                """), {"workspace_id": ws_id})
                members = members_result.fetchall()
                print(f"  Found {len(members)} workspace members")

                # Add all members to the default space
                for dev_id, ws_role in members:
                    # Map workspace role to space role
                    space_role = "editor"
                    if ws_role in ("owner", "admin"):
                        space_role = "admin"
                    elif ws_role == "viewer":
                        space_role = "viewer"

                    member_id = str(uuid4())
                    await session.execute(text("""
                        INSERT INTO document_space_members (
                            id, space_id, developer_id, role, joined_at, created_at, updated_at
                        ) VALUES (
                            :id, :space_id, :developer_id, :role, :now, :now, :now
                        )
                        ON CONFLICT (space_id, developer_id) DO NOTHING
                    """), {
                        "id": member_id,
                        "space_id": space_id,
                        "developer_id": dev_id,
                        "role": space_role,
                        "now": now,
                    })
                print(f"  Added {len(members)} members to default space")

                # Update all documents in the workspace to belong to the default space
                doc_result = await session.execute(text("""
                    UPDATE documents
                    SET space_id = :space_id
                    WHERE workspace_id = :workspace_id AND space_id IS NULL
                """), {
                    "space_id": space_id,
                    "workspace_id": ws_id,
                })
                print(f"  Updated {doc_result.rowcount} documents to use default space")

        await session.commit()

    await engine.dispose()
    print("\n=== Data migration completed successfully! ===")


if __name__ == "__main__":
    asyncio.run(run_migration())
