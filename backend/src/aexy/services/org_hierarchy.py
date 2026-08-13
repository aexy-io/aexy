"""Who reports to whom, for the surfaces that gate on it.

Lifted out of `google_account_visibility` unchanged: the org chart is not a
Google question, and a second caller — the monthly engineering report — should
not have to import a mailbox module to ask who heads a department.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.organization import Department, DepartmentMember, DepartmentMemberRole


async def headed_department_ids(
    db: AsyncSession, workspace_id: str, developer_id: str
) -> set[str]:
    """Departments this person heads, by either route.

    Headship is recorded twice — `Department.head_id` and a `DepartmentMember`
    row with `role_in_department = 'head'` — and the two do not always agree.
    Reading only one silently narrows the answer for whichever half of the data
    was written the other way.
    """
    by_column = (
        await db.execute(
            select(Department.id).where(
                Department.workspace_id == workspace_id,
                Department.head_id == developer_id,
            )
        )
    ).scalars().all()

    by_membership = (
        await db.execute(
            select(DepartmentMember.department_id).where(
                DepartmentMember.workspace_id == workspace_id,
                DepartmentMember.developer_id == developer_id,
                DepartmentMember.role_in_department == DepartmentMemberRole.HEAD.value,
            )
        )
    ).scalars().all()

    return {str(d) for d in by_column} | {str(d) for d in by_membership}


async def headed_department_names(
    db: AsyncSession, workspace_id: str, department_ids: set[str]
) -> list[str]:
    """Names for the departments, so a scoped view can say whose it is."""
    if not department_ids:
        return []

    rows = (
        await db.execute(
            select(Department.name)
            .where(
                Department.workspace_id == workspace_id,
                Department.id.in_(department_ids),
            )
            .order_by(Department.name)
        )
    ).scalars().all()
    return [str(name) for name in rows]


async def developers_in_departments(
    db: AsyncSession, workspace_id: str, department_ids: set[str]
) -> set[str]:
    """Everyone who belongs to any of these departments."""
    if not department_ids:
        return set()

    rows = (
        await db.execute(
            select(DepartmentMember.developer_id).where(
                DepartmentMember.workspace_id == workspace_id,
                DepartmentMember.department_id.in_(department_ids),
            )
        )
    ).scalars().all()
    return {str(r) for r in rows}
