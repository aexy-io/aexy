"""Whose connected Google accounts you are allowed to see.

Listing every mailbox in the workspace to every member was defensible while
connecting was an admin act — there were one or two accounts and an admin had
attached them. It stopped being defensible once any member could connect their
own: the list became a roster of who has linked their personal inbox, readable
by everyone, and that is a different thing from "which addresses does the
workspace sync".

The rule mirrors how people already think about the org chart:

  * **Owners and admins** see everything. They answer for the workspace.
  * **A department head** sees their own, plus the accounts of people in the
    departments they head. Their remit is their department, not the company.
  * **Everyone else** sees their own.

One deliberate exception. A **Service Desk mailbox** is a team address rather
than somebody's personal inbox — it is answered by whoever is on the desk, and
the mailbox settings form has to be able to offer it. Those stay visible to
callers who can manage tickets, which is the permission that form already
requires. Hiding them would break the queue rather than protect anyone.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.google_integration import GoogleIntegration
from aexy.services.org_hierarchy import (
    developers_in_departments,
    headed_department_ids,
)


async def visible_google_accounts(
    db: AsyncSession,
    *,
    workspace_id: str,
    developer_id: str,
    integrations: list[GoogleIntegration],
    is_admin: bool,
    can_manage_tickets: bool,
    service_desk_integration_ids: set[str],
) -> list[GoogleIntegration]:
    """Filter a workspace's connected accounts down to what this caller may see.

    Takes the already-loaded list rather than querying, so the caller keeps one
    round trip and this stays a pure decision that a test can drive directly.
    """
    if is_admin:
        return integrations

    headed = await headed_department_ids(db, workspace_id, developer_id)
    reports = (
        await developers_in_departments(db, workspace_id, headed) if headed else set()
    )

    visible: list[GoogleIntegration] = []
    for integration in integrations:
        owner = str(integration.connected_by_id or "")

        # Yours.
        if owner and owner == str(developer_id):
            visible.append(integration)
            continue

        # A team address, for someone who runs the desk.
        if can_manage_tickets and str(integration.id) in service_desk_integration_ids:
            visible.append(integration)
            continue

        # Somebody in a department you head.
        if owner and owner in reports:
            visible.append(integration)
            continue

        # Unowned rows predate `connected_by_id` and belong to the workspace
        # rather than to a person. Treating them as private would empty the list
        # for single-account workspaces that have worked for months.
        if not owner:
            visible.append(integration)

    return visible
