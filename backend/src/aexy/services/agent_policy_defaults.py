"""The policies a workspace has before anyone writes one.

Governance defaulted to open: a workspace with no `AgentPolicy` rows let an
agent run every one of ~1,100 mutating operations unattended, and writing the
first policy meant knowing the catalogue's action names by heart. So the gate
existed and, in practice, nothing was behind it.

This pack is what a fresh workspace starts with. Three rules, each one a row an
admin can read, loosen, or switch off:

  * deletions wait for a person;
  * outward-facing or irreversible actions wait for a person — sending,
    publishing, inviting, removing members, changing roles, connecting or
    disconnecting integrations, anything to do with money;
  * every write in workspace administration or provider integrations waits.

Reads are never touched: governance only sees mutating calls.

**Opting out is deactivating, not deleting.** Seeding is "only if this
workspace has no workspace-wide policies at all", including inactive ones, so
a switched-off default is respected and stays visible as a choice somebody
made. Deleting all three would look, to the seeder, exactly like a workspace
nobody has configured yet.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.agent_policy import AgentPolicy, PolicyType

logger = logging.getLogger(__name__)

# Marker in `config` so a default can be told apart from a policy an admin
# wrote. Lives in the JSONB rather than a column because the engine already
# ignores keys it does not know, and the alternative was a migration for one
# string.
DEFAULT_KEY = "default_key"

DEFAULT_POLICY_PACK: list[dict[str, Any]] = [
    {
        DEFAULT_KEY: "deletions",
        "name": "Deletions need approval",
        "description": (
            "Any operation that deletes something waits for a person in this "
            "workspace to approve it. Shipped as a default; deactivate to let "
            "agents delete unattended."
        ),
        "policy_type": PolicyType.TOOL_REQUIRE_APPROVAL.value,
        "config": {"methods": ["DELETE"]},
        "priority": 10,
    },
    {
        DEFAULT_KEY: "outward_facing",
        "name": "Outward-facing and irreversible actions need approval",
        "description": (
            "Sending, publishing, inviting, removing members, changing roles, "
            "connecting or disconnecting integrations, and anything involving "
            "money wait for a person. Shipped as a default."
        ),
        "policy_type": PolicyType.TOOL_REQUIRE_APPROVAL.value,
        "config": {
            "action_patterns": [
                r"(^|_)send(_|$)",
                r"(^|_)email(_|$)|(^|_)sms(_|$)|(^|_)whatsapp(_|$)",
                r"(^|_)publish(_|$)",
                r"(^|_)invite(_|$)",
                r"remove_member",
                r"update_role|assign_role|change_role",
                r"(^|_)connect(_|$)|(^|_)disconnect(_|$)",
                r"charge|refund|payout|terminate",
                r"bulk_delete|purge",
            ]
        },
        "priority": 20,
    },
    {
        DEFAULT_KEY: "admin_and_integrations",
        "name": "Administration and integration writes need approval",
        "description": (
            "Every write in workspace administration, billing and provider "
            "integrations waits for a person. Shipped as a default."
        ),
        "policy_type": PolicyType.TOOL_REQUIRE_APPROVAL.value,
        "config": {"capabilities": ["mcp.admin", "mcp.integrations"]},
        "priority": 30,
    },
]


def build_default_policies(workspace_id: str) -> list[AgentPolicy]:
    """The pack as unsaved rows for one workspace."""
    rows: list[AgentPolicy] = []
    for spec in DEFAULT_POLICY_PACK:
        config = dict(spec["config"])
        config[DEFAULT_KEY] = spec[DEFAULT_KEY]
        rows.append(
            AgentPolicy(
                id=str(uuid4()),
                workspace_id=workspace_id,
                name=spec["name"],
                description=spec["description"],
                agent_id=None,
                policy_type=spec["policy_type"],
                config=config,
                priority=spec["priority"],
                is_active=True,
                created_by_id=None,
            )
        )
    return rows


async def ensure_default_policies(
    db: AsyncSession, workspace_id: str
) -> list[AgentPolicy]:
    """Seed the pack if this workspace has no workspace-wide policies at all.

    Returns the rows added (empty when nothing was needed). Flushes but does
    not commit; the caller's transaction decides.
    """
    existing = (
        await db.execute(
            select(AgentPolicy.id)
            .where(AgentPolicy.workspace_id == workspace_id)
            .where(AgentPolicy.agent_id.is_(None))
            .limit(1)
        )
    ).first()
    if existing:
        return []

    rows = build_default_policies(workspace_id)
    for row in rows:
        db.add(row)
    await db.flush()
    logger.info(
        "Seeded %d default agent policies for workspace %s", len(rows), workspace_id
    )
    return rows
