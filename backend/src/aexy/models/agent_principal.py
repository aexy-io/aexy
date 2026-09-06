"""An agent that acts as itself.

Every MCP call used to run as a person: an OAuth grant needs somebody at a
consent screen, and an API token is minted against a developer. So a scheduled
triage run was "Bhanu did this" in every audit trail, revoking Bhanu revoked
the automation, and nothing could run for a workspace rather than for one of
its members.

A principal is a workspace-owned identity with a capability scope that can
only ever be a subset of what the workspace grants. It has its own tokens,
its own rows in the ledger, and it is always an agent — a token issued to a
principal carries `actor=agent` on every request, so the review gate and
governance apply whether the call arrives over MCP or straight at the REST API.

How it exists inside the rest of the app. Every `created_by_id`,
`requested_by_id` and `actor_developer_id` column points at `developers`, and
teaching all of them about a second kind of actor would be a very large diff
for no behavioural gain. So each principal owns one synthetic `Developer` row
(`account_type = "agent"`) and one `WorkspaceMember` row whose app overrides
mirror the principal's capabilities. The synthetic developer is a member of
exactly one workspace, can sign in nowhere, and exists so that the columns
the application already has can name the agent.
"""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from aexy.core.database import Base

AGENT_ACCOUNT_TYPE = "agent"


class AgentPrincipal(Base):
    __tablename__ = "agent_principals"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # The synthetic developer this principal acts through. One per principal,
    # created with it; the rest of the application sees this id.
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Capabilities this principal may use, e.g. ["mcp.service_desk",
    # "mcp.tickets"]. Intersected with what the workspace grants at every
    # call; never a superset of it.
    capabilities: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
