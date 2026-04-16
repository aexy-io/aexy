"""Agent Workspace models for the Agent Canvas Framework."""

from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.agent import CRMAgent
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace


class AgentWorkspaceStatus(str, Enum):
    """Status of an agent workspace."""
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"
    COMPLETED = "completed"
    FAILED = "failed"


class BlockType(str, Enum):
    """Types of workspace blocks."""
    MARKDOWN = "markdown"
    JSON = "json"
    TABLE = "table"
    IMAGE = "image"
    PDF = "pdf"
    TEXT = "text"
    CODE = "code"
    HANDOFF = "handoff"
    HUMAN_INPUT = "human_input"
    WEB_PAGE = "web_page"


class BlockStatus(str, Enum):
    """Status of a workspace block."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    WAITING_HUMAN = "waiting_human"


class AgentWorkspace(Base):
    """Agent workspace for orchestrated multi-agent task execution."""

    __tablename__ = "agent_workspaces"

    id: Mapped[str] = mapped_column(
        UUID, primary_key=True, default=lambda: str(uuid4())
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default=AgentWorkspaceStatus.ACTIVE.value
    )
    source_module: Mapped[str | None] = mapped_column(String(100), nullable=True)
    source_record_id: Mapped[str | None] = mapped_column(UUID, nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(
        UUID, ForeignKey("developers.id", ondelete="SET NULL"), nullable=True
    )
    temporal_workflow_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship(
        "Workspace", foreign_keys=[workspace_id], lazy="selectin"
    )
    created_by: Mapped["Developer | None"] = relationship(
        "Developer", foreign_keys=[created_by_id], lazy="selectin"
    )
    blocks: Mapped[list["AgentWorkspaceBlock"]] = relationship(
        "AgentWorkspaceBlock",
        back_populates="agent_workspace",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="AgentWorkspaceBlock.sort_order",
    )


class AgentWorkspaceBlock(Base):
    """A block within an agent workspace — represents a unit of work/output."""

    __tablename__ = "agent_workspace_blocks"

    id: Mapped[str] = mapped_column(
        UUID, primary_key=True, default=lambda: str(uuid4())
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID,
        ForeignKey("agent_workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    parent_id: Mapped[str | None] = mapped_column(
        UUID,
        ForeignKey("agent_workspace_blocks.id", ondelete="SET NULL"),
        nullable=True,
    )
    block_type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default=BlockStatus.PENDING.value
    )
    agent_id: Mapped[str | None] = mapped_column(
        UUID, ForeignKey("crm_agents.id", ondelete="SET NULL"), nullable=True
    )
    execution_id: Mapped[str | None] = mapped_column(UUID, nullable=True)
    content: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    file_key: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    file_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    file_mime_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    dependencies: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    handoff_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    token_usage: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    agent_workspace: Mapped["AgentWorkspace"] = relationship(
        "AgentWorkspace", back_populates="blocks"
    )
    parent: Mapped["AgentWorkspaceBlock | None"] = relationship(
        "AgentWorkspaceBlock",
        remote_side="AgentWorkspaceBlock.id",
        foreign_keys=[parent_id],
        lazy="selectin",
    )
    agent: Mapped["CRMAgent | None"] = relationship(
        "CRMAgent", foreign_keys=[agent_id], lazy="selectin"
    )
