"""Service Desk models — email-intake ticketing on top of `Ticket`.

Adds the Service-Desk-specific layer the generic ticketing module lacks:

* **Taxonomy** — the stakeholders a ticket can be pending with, and the request
  types it can be triaged into. Both are per-workspace rows rather than Python
  enums, because "who owes the next action" is a business's own vocabulary. See
  ``services/service_desk_industry_templates.py`` for the starting points and
  ``services/service_desk_taxonomy.py`` for the resolver.
* **Master data** — accounts and vendors (external counterparties, identified by
  email domain), products, and which products each account is served for.
* The per-ticket extension (`ServiceDeskTicket`), the timestamped "Pending With"
  ledger (`TicketPendingSegment`), and the shared-mailbox registry.

Nothing here is industry-specific. An insurance broker labels an account
"Partner", a vendor "Insurer" and a product "Line of Business"; a software
company labels them "Customer", "Vendor" and "Product". Those are display labels
resolved from the workspace's terminology, not table names.
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
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.ticketing import Ticket


class TicketOrigin(str, Enum):
    """How the ticket entered the system."""

    EMAIL = "email"
    MANUAL = "manual"
    INTERNAL = "internal"


class MailboxChannel(str, Enum):
    """How a shared mailbox is ingested."""

    WEBHOOK = "webhook"
    GMAIL_SYNC = "gmail_sync"


class ServiceDeskStakeholder(Base):
    """One "pending with" bucket a ticket can sit in, defined per workspace.

    This replaced a ``PendingWith`` Python enum. The enum meant the set of
    parties a request could be waiting on was fixed at deploy time — adding
    "Legal" needed a code change, a migration and a release.

    ``semantics`` is the part code is allowed to branch on: ``internal`` (a
    department owes the action, scoped by ``function_key``), ``external`` (a
    counterparty owes it) or ``closed`` (terminal — the breach clock stops).
    ``slug`` and ``label`` belong to the workspace, so renaming "Insurer" to
    "Underwriter" cannot change TAT maths. Same split as
    ``WorkspaceStatusCategory.semantics`` for sprint statuses.
    """

    __tablename__ = "service_desk_stakeholders"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Stored on tickets and segments as a plain string — see the note on
    # `ServiceDeskTicket.pending_with` for why this isn't a foreign key.
    slug: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    semantics: Mapped[str] = mapped_column(String(20), nullable=False, default="internal", index=True)

    # Which department owns this bucket, matched against `Department.function_key`.
    # Only meaningful when semantics == "internal"; it decides whose tickets a
    # member of that department can see.
    function_key: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    # Which master-data table an EXTERNAL bucket speaks for: "account", "vendor",
    # or NULL for one that has records of neither kind (a loss adjuster, say).
    # Without it the desk had to guess from the bucket's label, which silently
    # did the wrong thing for any workspace that renamed its nouns. Decides
    # which table a reply's sender is matched against when the ticket is handed
    # back, and which stage writing to an address implies.
    links_to: Mapped[str | None] = mapped_column(String(16), nullable=True)

    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_service_desk_stakeholder_slug"),
    )


class ServiceDeskRequestType(Base):
    """One triage category for an incoming request, defined per workspace.

    Replaced a ``RequestType`` enum whose four members were an insurance
    broker's: query, policy issuance, claims, payout.
    """

    __tablename__ = "service_desk_request_types"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )

    slug: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)

    # What untriaged mail becomes. At most one per workspace.
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_service_desk_request_type_slug"),
        # At most one default per workspace, enforced where it matters rather
        # than by hoping every write path remembers to clear the previous one.
        Index(
            "uq_service_desk_request_type_default",
            "workspace_id",
            unique=True,
            postgresql_where=text("is_default"),
            sqlite_where=text("is_default"),
        ),
    )


class ServiceDeskAccount(Base):
    """An external organisation the desk serves, with an assigned owner.

    Identified by email domain, so inbound mail can be attributed without the
    sender being a user. An insurance broker calls these Partners, a software
    company calls them Customers.
    """

    __tablename__ = "service_desk_accounts"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    assigned_owner_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    domains: Mapped[list["ServiceDeskAccountDomain"]] = relationship(
        "ServiceDeskAccountDomain", back_populates="account", cascade="all, delete-orphan", lazy="selectin"
    )
    products: Mapped[list["ServiceDeskAccountProduct"]] = relationship(
        "ServiceDeskAccountProduct", back_populates="account", cascade="all, delete-orphan", lazy="selectin"
    )
    assigned_owner: Mapped["Developer"] = relationship("Developer", lazy="selectin")

    __table_args__ = (UniqueConstraint("workspace_id", "name", name="uq_service_desk_account_name"),)


class ServiceDeskAccountDomain(Base):
    """An email domain that identifies an account (e.g. acme.com)."""

    __tablename__ = "service_desk_account_domains"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    account_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("service_desk_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    account: Mapped["ServiceDeskAccount"] = relationship("ServiceDeskAccount", back_populates="domains")

    __table_args__ = (UniqueConstraint("workspace_id", "domain", name="uq_service_desk_account_domain"),)


class ServiceDeskAccountProduct(Base):
    """Which products an account is served for, and who owns each of them.

    An account carried a single ``assigned_owner_id``, which says a partner is
    one person's to look after. Real desks split them: the same partner's motor
    work belongs to one owner and its health work to another, and before this the
    only way to express that was two accounts with the same domain — which the
    matcher would have resolved arbitrarily.

    ``assigned_owner_id`` here is optional and overrides the account's when set,
    so a desk that does not split anything never has to fill it in. The account's
    owner remains the answer for products with no row and for mail nothing has
    been classified as yet.

    The pairing also narrows classification: a partner served for two products is
    a much easier question than a workspace catalogue of forty, and one served
    for exactly one needs no model at all.
    """

    __tablename__ = "service_desk_account_products"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    account_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("service_desk_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("service_desk_products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Nullable: "this partner is served for this product" is worth recording on
    # its own, and most desks will never name a different owner for it.
    assigned_owner_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    account: Mapped["ServiceDeskAccount"] = relationship("ServiceDeskAccount", back_populates="products")
    product: Mapped["ServiceDeskProduct"] = relationship("ServiceDeskProduct", lazy="selectin")
    assigned_owner: Mapped["Developer"] = relationship("Developer", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("account_id", "product_id", name="uq_service_desk_account_product"),
    )


class ServiceDeskVendor(Base):
    """An external counterparty the desk escalates to, identified by domain.

    An insurance broker calls these Insurers; a software company calls them
    Vendors or upstream providers.
    """

    __tablename__ = "service_desk_vendors"

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

    domains: Mapped[list["ServiceDeskVendorDomain"]] = relationship(
        "ServiceDeskVendorDomain", back_populates="vendor", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (UniqueConstraint("workspace_id", "name", name="uq_service_desk_vendor_name"),)


class ServiceDeskVendorDomain(Base):
    """An email domain that identifies a vendor."""

    __tablename__ = "service_desk_vendor_domains"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vendor_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("service_desk_vendors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    vendor: Mapped["ServiceDeskVendor"] = relationship("ServiceDeskVendor", back_populates="domains")

    __table_args__ = (UniqueConstraint("workspace_id", "domain", name="uq_service_desk_vendor_domain"),)


class ServiceDeskProduct(Base):
    """A product or service line a request can be about. Master data.

    An insurance broker calls these Lines of Business.
    """

    __tablename__ = "service_desk_products"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("workspace_id", "name", name="uq_service_desk_product_name"),)


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
    # Canonical split-family relationship. ``Ticket.field_values`` still keeps
    # display metadata, but assignment and authorization must never trust JSON.
    split_parent_ticket_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("tickets.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    product_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("service_desk_products.id", ondelete="SET NULL"), nullable=True
    )
    account_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("service_desk_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    vendor_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("service_desk_vendors.id", ondelete="SET NULL"), nullable=True
    )

    # Taxonomy slugs, not foreign keys. A ticket's history has to stay readable
    # after a stakeholder or request type is retired, and the pending ledger
    # below carries the same slugs for closed segments going back years — a FK
    # with ON DELETE SET NULL would erase that history, and RESTRICT would make
    # retiring a bucket impossible. Writes are validated against the workspace's
    # active rows in the service layer.
    request_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    pending_with: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    origin: Mapped[str] = mapped_column(String(20), default=TicketOrigin.EMAIL.value, nullable=False)

    needs_triage: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    ai_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    # What the model originally answered, kept alongside what the ticket now
    # says. The pair is the only way to tell an AI classification a person
    # agreed with from one they silently corrected — `request_type` on its own
    # cannot, because a correction overwrites it and leaves no trace.
    #
    # Two things read this. "Is the classifier worth trusting?", which a desk
    # cannot answer by feel; and the classifier itself, which is shown recent
    # corrections so it stops making the same mistake on this workspace's mail.
    # NULL means the model never ran, which is not the same as agreeing.
    ai_request_type: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    ai_product_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("service_desk_products.id", ondelete="SET NULL"), nullable=True
    )

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

    # ``split_parent_ticket_id`` is a second FK to tickets, so this relationship
    # has to say which one it travels — otherwise mapper configuration fails.
    ticket: Mapped["Ticket"] = relationship(
        "Ticket", foreign_keys=[ticket_id], lazy="selectin"
    )
    account: Mapped["ServiceDeskAccount"] = relationship("ServiceDeskAccount", lazy="selectin")
    # `ai_product_id` is a second FK to the same table, so this relationship has
    # to say which one it travels — otherwise every join between these two
    # tables becomes ambiguous, including the ones written years ago.
    product: Mapped["ServiceDeskProduct"] = relationship(
        "ServiceDeskProduct", foreign_keys=[product_id], lazy="selectin"
    )
    vendor: Mapped["ServiceDeskVendor"] = relationship("ServiceDeskVendor", lazy="selectin")


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
    pending_with: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    exited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    changed_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="SET NULL"), nullable=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        # The "exactly one open segment" invariant this class documents. Declared
        # in the metadata as well as the migration so create_all enforces it too;
        # migration-only meant a Docker-first environment could accumulate two
        # open segments and the migration's index could then never be created.
        Index(
            "uq_ticket_open_segment",
            "ticket_id",
            unique=True,
            postgresql_where=text("exited_at IS NULL"),
            sqlite_where=text("exited_at IS NULL"),
        ),
    )


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
