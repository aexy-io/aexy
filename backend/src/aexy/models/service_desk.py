"""Bimaplan Service Desk models — email-intake ticketing on top of `Ticket`.

Adds the Service-Desk-specific layer the generic ticketing module lacks:
master data (partners/insurers/LOBs + their email domains), the per-ticket
extension (`ServiceDeskTicket`), the timestamped "Pending With" ledger
(`TicketPendingSegment`), and the shared-mailbox registry.

See ``prds/BIMAPLAN_SERVICE_DESK_PLAN.md`` §4–§6.
"""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.ticketing import Ticket


class RequestType(str, Enum):
    """The four Service Desk request types."""

    QUERY = "query"
    POLICY_ISSUANCE = "policy_issuance"
    CLAIMS = "claims"
    PAYOUT = "payout"


class PendingWith(str, Enum):
    """Who currently needs to act on a ticket."""

    INSURER = "insurer"
    PARTNER = "partner"
    SALES = "sales"
    THIRD_PARTY = "third_party"
    FINANCE = "finance"
    KAM = "kam"
    MARKETING = "marketing"
    CLOSED = "closed"


# Internal pending-with states that map to an org function (Department.function_key).
INTERNAL_PENDING_WITH = {
    PendingWith.SALES.value: "sales",
    PendingWith.FINANCE.value: "finance",
    PendingWith.MARKETING.value: "marketing",
    PendingWith.KAM.value: "ops_kam",
}


class TicketOrigin(str, Enum):
    """How the ticket entered the system."""

    EMAIL = "email"
    MANUAL = "manual"
    INTERNAL = "internal"


class MailboxChannel(str, Enum):
    """How a shared mailbox is ingested."""

    WEBHOOK = "webhook"
    GMAIL_SYNC = "gmail_sync"


class ServiceDeskPartner(Base):
    """A distribution partner (external, email-only) with an assigned KAM."""

    __tablename__ = "service_desk_partners"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    assigned_kam_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    domains: Mapped[list["ServiceDeskPartnerDomain"]] = relationship(
        "ServiceDeskPartnerDomain", back_populates="partner", cascade="all, delete-orphan", lazy="selectin"
    )
    assigned_kam: Mapped["Developer"] = relationship("Developer", lazy="selectin")

    __table_args__ = (UniqueConstraint("workspace_id", "name", name="uq_service_desk_partner_name"),)


class ServiceDeskPartnerDomain(Base):
    """An email domain that identifies a partner (e.g. abcfinance.com)."""

    __tablename__ = "service_desk_partner_domains"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    partner_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("service_desk_partners.id", ondelete="CASCADE"), nullable=False, index=True
    )
    domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    partner: Mapped["ServiceDeskPartner"] = relationship("ServiceDeskPartner", back_populates="domains")

    __table_args__ = (UniqueConstraint("workspace_id", "domain", name="uq_service_desk_partner_domain"),)


class ServiceDeskInsurer(Base):
    """An insurer (external, email-only). Used to tag insurer-originated mail."""

    __tablename__ = "service_desk_insurers"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    domains: Mapped[list["ServiceDeskInsurerDomain"]] = relationship(
        "ServiceDeskInsurerDomain", back_populates="insurer", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (UniqueConstraint("workspace_id", "name", name="uq_service_desk_insurer_name"),)


class ServiceDeskInsurerDomain(Base):
    """An email domain that identifies an insurer."""

    __tablename__ = "service_desk_insurer_domains"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    insurer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("service_desk_insurers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    insurer: Mapped["ServiceDeskInsurer"] = relationship("ServiceDeskInsurer", back_populates="domains")

    __table_args__ = (UniqueConstraint("workspace_id", "domain", name="uq_service_desk_insurer_domain"),)


class ServiceDeskLOB(Base):
    """A line of business / product (Credit Life, GPA, Travel, …). Master data."""

    __tablename__ = "service_desk_lobs"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("workspace_id", "name", name="uq_service_desk_lob_name"),)


class ServiceDeskMailbox(Base):
    """A shared mailbox whose incoming mail becomes Service Desk tickets."""

    __tablename__ = "service_desk_mailboxes"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    address: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    channel: Mapped[str] = mapped_column(String(20), default=MailboxChannel.WEBHOOK.value, nullable=False)
    integration_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("google_integrations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (UniqueConstraint("workspace_id", "address", name="uq_service_desk_mailbox_address"),)


class ServiceDeskTicket(Base):
    """1:1 extension of `Ticket` holding Service-Desk-specific fields."""

    __tablename__ = "service_desk_tickets"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    ticket_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )

    lob_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("service_desk_lobs.id", ondelete="SET NULL"), nullable=True
    )
    partner_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("service_desk_partners.id", ondelete="SET NULL"), nullable=True, index=True
    )
    insurer_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("service_desk_insurers.id", ondelete="SET NULL"), nullable=True
    )

    request_type: Mapped[str] = mapped_column(String(30), default=RequestType.QUERY.value, nullable=False, index=True)
    pending_with: Mapped[str] = mapped_column(String(20), default=PendingWith.KAM.value, nullable=False, index=True)
    origin: Mapped[str] = mapped_column(String(20), default=TicketOrigin.EMAIL.value, nullable=False)

    needs_triage: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    ai_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Which shared mailbox this ticket arrived on — needed to reply in-thread
    # from the right sender when a workspace runs more than one mailbox.
    mailbox_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("service_desk_mailboxes.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Threading / idempotency
    thread_ref: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    source_message_id: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    ticket: Mapped["Ticket"] = relationship("Ticket", lazy="selectin")
    partner: Mapped["ServiceDeskPartner"] = relationship("ServiceDeskPartner", lazy="selectin")
    lob: Mapped["ServiceDeskLOB"] = relationship("ServiceDeskLOB", lazy="selectin")
    insurer: Mapped["ServiceDeskInsurer"] = relationship("ServiceDeskInsurer", lazy="selectin")


class TicketPendingSegment(Base):
    """One 'Pending With' interval on a ticket (the timestamped handoff ledger).

    Exactly one open segment (``exited_at IS NULL``) per ticket at any time.
    """

    __tablename__ = "ticket_pending_segments"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ticket_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    pending_with: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    exited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    changed_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="SET NULL"), nullable=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ServiceDeskIngestedMessage(Base):
    """Every inbound message id we have already processed, new ticket or reply.

    Intake idempotency needs to cover replies too, not just the first message of
    a thread: inbound-parse providers retry on any non-2xx, so without this a
    redelivered reply would be appended to the ticket a second time. The unique
    constraint — not the preceding SELECT — is what actually makes ingest
    idempotent under concurrent delivery of the same message.
    """

    __tablename__ = "service_desk_ingested_messages"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    message_id: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    ticket_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("workspace_id", "message_id", name="uq_sd_ingested_message"),
    )
