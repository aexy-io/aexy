"""Workspace-wide AI governance: the kill switch and bring-your-own provider.

Two controls that a workspace owner/admin needs and previously had nowhere to
express:

* **``ai_enabled``** — one switch that stops the workspace from reaching any
  LLM. Individual features each had their own opt-in (``service_desk``'s
  ``ai_classification_enabled``, agent toggles, …), so "no AI on our data"
  meant hunting through every module and hoping none were added later. This is
  enforced in ``aexy.llm.gateway`` at the point a provider is resolved, so it
  covers API requests, Temporal activities and background jobs alike rather
  than only the screens someone remembered to guard.

* **A provider + credential of their own.** Without this every workspace shares
  the deployment's key, which means the platform's Anthropic/Gemini account
  carries their traffic and their prompts. An org that has its own contract, or
  a data-residency requirement, needs its own key to be the one in use.

The credential is stored with the same Fernet envelope as integration
credentials (``aexy.core.encryption``) and there is no read path — the API only
ever returns ``key_hint``. Rotating means overwriting.

Editing these settings is a Pro/Enterprise capability, but *enforcement* is
not: a workspace that turned AI off keeps it off after a downgrade. Silently
resuming LLM calls on someone's data because their card expired would be the
worst possible failure mode for this particular switch.
"""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from aexy.core.database import Base

# Providers the gateway can actually construct (see llm/gateway.create_provider).
# Kept here because it is also the API's validation allowlist: a value outside
# this set would be accepted, stored, and then fail at call time — after AI had
# already been silently broken for the whole workspace.
SUPPORTED_AI_PROVIDERS: tuple[str, ...] = (
    "claude",
    "gemini",
    "openrouter",
    "deepseek",
    "ollama",
    "lmstudio",
)

# Providers that are useless without a key, so the API refuses to select them
# until one is supplied. Ollama and LM Studio are self-hosted and reached by URL.
AI_PROVIDERS_REQUIRING_KEY: frozenset[str] = frozenset(
    {"claude", "gemini", "openrouter", "deepseek"}
)


class WorkspaceAISettings(Base):
    """One row per workspace holding its AI kill switch and provider override."""

    __tablename__ = "workspace_ai_settings"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    # Unique: these are the workspace's settings, not a list of them.
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # The kill switch. Default True so an absent row means "unchanged, platform
    # behaviour" — no backfill needed and no workspace loses AI on deploy.
    ai_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Bring-your-own provider. NULL provider = use the deployment default.
    provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # {"_encrypted": "...", "_version": 1} — see aexy.core.encryption.
    encrypted_api_key: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Last four characters, so the UI can show *which* key is installed without
    # the value ever leaving the server.
    key_hint: Mapped[str | None] = mapped_column(String(8), nullable=True)
    key_set_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # When the org's own provider errors, should traffic silently continue on the
    # platform's key? Defaults to False: an org that supplied a key did so
    # precisely so its prompts would not travel through our account, and a quiet
    # fallback would defeat that without anyone noticing.
    allow_platform_fallback: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    # Audit — who turned AI off and why, so the answer to "why is nothing
    # working?" is in the row rather than in someone's memory.
    disabled_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    disabled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
