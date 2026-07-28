"""Seed the minimum a Playwright e2e run needs: one owner in one workspace.

Throwaway helper for a disposable E2E database — not part of the product.
Prints `<developer_id> <workspace_id>` so the caller can pair it with
generate_test_token.py.
"""

import asyncio
import sys
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from sqlalchemy import select  # noqa: E402

from aexy.core.database import async_session_maker  # noqa: E402
from aexy.models.developer import Developer  # noqa: E402
from aexy.models.workspace import Workspace, WorkspaceMember  # noqa: E402


async def main() -> int:
    async with async_session_maker() as db:
        developer = (
            await db.execute(select(Developer).limit(1))
        ).scalar_one_or_none()
        if developer is None:
            developer = Developer(
                id=str(uuid4()),
                name="E2E Runner",
                email="e2e@example.com",
                has_completed_onboarding=True,
            )
            db.add(developer)
            await db.flush()

        workspace = (
            await db.execute(select(Workspace).limit(1))
        ).scalar_one_or_none()
        if workspace is None:
            workspace = Workspace(
                id=str(uuid4()),
                name="E2E Workspace",
                slug=f"e2e-{uuid4().hex[:8]}",
                type="team",
                owner_id=developer.id,
                settings={},
                is_active=True,
            )
            db.add(workspace)
            await db.flush()

        member = (
            await db.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace.id,
                    WorkspaceMember.developer_id == developer.id,
                )
            )
        ).scalar_one_or_none()
        if member is None:
            db.add(
                WorkspaceMember(
                    id=str(uuid4()),
                    workspace_id=workspace.id,
                    developer_id=developer.id,
                    role="owner",
                    status="active",
                )
            )

        await db.commit()
        print(f"{developer.id} {workspace.id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
