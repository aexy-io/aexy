"""Named, encrypted secrets a workflow step can reference by name."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from aexy.core.database import Base


class WorkspaceSecret(Base):
    """A credential held outside the workflow graph.

    A webhook header template is stored verbatim in the workflow definition and
    reading a workflow only needs `member`, so a pasted token was visible to
    everyone in the workspace. There was nowhere else to put it, so the builder
    could only warn about it.

    A step references ``{{secrets.NAME}}`` instead. The reference is not
    sensitive and can live in the graph; the value is encrypted here with the
    same Fernet envelope used for integration credentials, resolved at
    execution time, and never returned by the API — not even to an admin.
    Rotating means overwriting, which is why there is no read path at all.
    """

    __tablename__ = "workspace_secrets"
    __table_args__ = (
        UniqueConstraint("workspace_id", "name", name="uq_workspace_secret_name"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # {"_encrypted": "...", "_version": 1} — see aexy.core.encryption
    encrypted_value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Set when a run resolves this secret, so an unused one can be found and
    # retired rather than left lying around forever.
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
