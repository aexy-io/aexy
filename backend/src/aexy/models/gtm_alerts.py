"""GTM Alert models: Alert configurations and delivery logs."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base


class GTMAlertConfig(Base):
    """Configurable alert rules that match GTM events and route to channels."""

    __tablename__ = "gtm_alert_configs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)

    # Conditions for matching (JSONB array of {field, op, value})
    conditions: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Delivery channel
    channel_type: Mapped[str] = mapped_column(String(20), nullable=False, default="slack")
    channel_config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    message_template: Mapped[str | None] = mapped_column(Text, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    # Relationships
    logs: Mapped[list["GTMAlertLog"]] = relationship(
        "GTMAlertLog", back_populates="alert_config", lazy="noload",
    )

    __table_args__ = (
        Index("ix_gtm_alert_configs_ws_event", "workspace_id", "event_type"),
    )


class GTMAlertLog(Base):
    """Log of dispatched alert deliveries."""

    __tablename__ = "gtm_alert_logs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    alert_config_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("gtm_alert_configs.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Relationships
    alert_config: Mapped["GTMAlertConfig"] = relationship(
        "GTMAlertConfig", back_populates="logs", lazy="selectin",
    )

    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    event_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    channel_type: Mapped[str] = mapped_column(String(20), nullable=False)
    delivery_status: Mapped[str] = mapped_column(String(20), nullable=False, default="sent")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    __table_args__ = (
        Index("ix_gtm_alert_logs_ws_created", "workspace_id", "created_at"),
    )
