"""LLM analysis dedup cache.

Keyed on a content-hash of (prompt_version + input payload) so that identical
re-analyses (same commit message + diff + prompt template) reuse a stored
result instead of burning tokens. Used by the GitHub AI pipeline (Phase 1+).
"""

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from aexy.core.database import Base


class LlmAnalysisCache(Base):
    """Cache of LLM analysis outputs, deduped by prompt hash."""

    __tablename__ = "llm_analysis_cache"

    prompt_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    analysis: Mapped[dict] = mapped_column(JSONB, nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(50), nullable=False)
    token_usage: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
