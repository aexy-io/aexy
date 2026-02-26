"""GTM SEO Audit models: Technical SEO analysis results."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base


class SEOAudit(Base):
    """Top-level SEO audit for a target URL/domain."""

    __tablename__ = "seo_audits"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    target_url: Mapped[str] = mapped_column(Text, nullable=False)
    domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    record_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("crm_records.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Scores (0-100)
    overall_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    meta_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    headings_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    links_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    images_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    performance_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    findings: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    # [{severity, category, message}]
    recommendations: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    pages_crawled: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    triggered_by: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    # Relationships
    pages: Mapped[list["SEOAuditPage"]] = relationship(
        "SEOAuditPage", back_populates="audit", lazy="noload",
    )

    __table_args__ = (
        Index("ix_seo_audits_ws_domain", "workspace_id", "domain"),
    )


class SEOAuditPage(Base):
    """Individual page analysis within an SEO audit."""

    __tablename__ = "seo_audit_pages"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    audit_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("seo_audits.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Relationships
    audit: Mapped["SEOAudit"] = relationship(
        "SEOAudit", back_populates="pages", lazy="selectin",
    )

    url: Mapped[str] = mapped_column(Text, nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, default=200, nullable=False)
    page_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    meta_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    h1_text: Mapped[str | None] = mapped_column(String(500), nullable=True)

    word_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    page_size_kb: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    load_time_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # [{type, severity, detail}]
    issues: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
