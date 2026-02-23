"""GTM Compliance models: Contact consent, suppression lists, and audit logging."""

from datetime import datetime
from enum import Enum
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from aexy.core.database import Base


# =============================================================================
# ENUMS
# =============================================================================

class ConsentType(str, Enum):
    """Types of consent for contact communication."""
    EXPLICIT_OPT_IN = "explicit_opt_in"
    LEGITIMATE_INTEREST = "legitimate_interest"
    IMPLIED = "implied"


class Jurisdiction(str, Enum):
    """Regulatory jurisdictions."""
    GDPR = "gdpr"
    CAN_SPAM = "can_spam"
    CASL = "casl"
    OTHER = "other"


class SuppressionReason(str, Enum):
    """Reasons for suppression list entries."""
    UNSUBSCRIBE = "unsubscribe"
    BOUNCE = "bounce"
    COMPLAINT = "complaint"
    MANUAL = "manual"
    LEGAL = "legal"


class ComplianceAction(str, Enum):
    """Audit log action types."""
    SEND_APPROVED = "send_approved"
    SEND_BLOCKED = "send_blocked"
    CONSENT_RECORDED = "consent_recorded"
    CONSENT_REVOKED = "consent_revoked"
    SUPPRESSION_ADDED = "suppression_added"
    ERASURE_COMPLETED = "erasure_completed"


# =============================================================================
# CONTACT CONSENT
# =============================================================================

class ContactConsent(Base):
    """Tracks opt-in/opt-out per contact per jurisdiction."""

    __tablename__ = "contact_consents"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Contact identity
    record_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    # Consent details
    consent_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default=ConsentType.EXPLICIT_OPT_IN.value,
    )
    consent_source: Mapped[str] = mapped_column(String(100), nullable=False)
    jurisdiction: Mapped[str] = mapped_column(
        String(20), nullable=False, default=Jurisdiction.CAN_SPAM.value,
    )

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    opted_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Dates
    consent_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    expiry_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Extra data
    extra_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    __table_args__ = (
        Index("ix_contact_consents_ws_email", "workspace_id", "email"),
    )


# =============================================================================
# SUPPRESSION LIST
# =============================================================================

class SuppressionList(Base):
    """Global and workspace suppression entries."""

    __tablename__ = "suppression_lists"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Suppression target
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    domain: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Reason and source
    reason: Mapped[str] = mapped_column(
        String(20), nullable=False, default=SuppressionReason.MANUAL.value,
    )
    source: Mapped[str] = mapped_column(String(100), nullable=False, default="manual")

    # Who added it
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    added_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    __table_args__ = (
        Index("ix_suppression_lists_ws_email", "workspace_id", "email"),
    )


# =============================================================================
# COMPLIANCE AUDIT LOG
# =============================================================================

class ComplianceAuditLog(Base):
    """Every send decision logged for compliance trail."""

    __tablename__ = "compliance_audit_logs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Target
    record_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)

    # Action details
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    jurisdiction: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Extra data
    extra_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    __table_args__ = (
        Index("ix_compliance_audit_ws_email", "workspace_id", "email"),
        Index("ix_compliance_audit_ws_action", "workspace_id", "action"),
        Index("ix_compliance_audit_ws_created", "workspace_id", created_at.desc()),
    )
