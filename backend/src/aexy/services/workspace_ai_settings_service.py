"""Workspace AI governance — the kill switch and bring-your-own provider.

Read path (``resolve_ai_config``) is called by ``aexy.llm.gateway`` on every LLM
call, so it is deliberately a single indexed lookup with no caching: an
administrator who turns AI off expects the next call to stop, not the next call
after a TTL expires. An LLM round-trip costs hundreds of milliseconds, so one
primary-key-ish SELECT is not the thing to optimise here.

Write path is Pro/Enterprise-only and owner/admin-only. Enforcement of an
existing ``ai_enabled = false`` is **not** plan-gated — see the model docstring.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.encryption import decrypt_credentials, encrypt_credentials
from aexy.models.plan import PlanTier
from aexy.models.workspace import Workspace
from aexy.models.workspace_ai_settings import (
    AI_PROVIDERS_REQUIRING_KEY,
    SUPPORTED_AI_PROVIDERS,
    WorkspaceAISettings,
)
from aexy.schemas.workspace_ai_settings import (
    AIConnectionTestResult,
    AISettingsResponse,
    AISettingsUpdate,
)

if TYPE_CHECKING:
    from aexy.llm.base import LLMConfig

logger = logging.getLogger(__name__)

# Tiers allowed to *edit* AI settings.
AI_SETTINGS_TIERS: frozenset[str] = frozenset(
    {PlanTier.PRO.value, PlanTier.ENTERPRISE.value, PlanTier.CUSTOM.value}
)

# The envelope key used inside the Fernet payload.
_KEY_FIELD = "api_key"


class AIDisabledError(RuntimeError):
    """Raised when a workspace has switched AI off.

    A distinct type (not ValueError) because Temporal's ``LLM_RETRY`` policy
    treats ValueError/KeyError as non-retryable and everything else as worth
    retrying — and a disabled workspace must not be retried for an hour. Callers
    that dispatch through Temporal should catch this and stop.
    """


@dataclass(frozen=True)
class WorkspaceAIConfig:
    """Resolved AI configuration for one workspace.

    ``config is None`` means "use the deployment default" — *not* "no AI". The
    distinction matters: only ``enabled`` decides whether a call may happen.
    """

    enabled: bool
    config: "LLMConfig | None"
    allow_platform_fallback: bool
    # "workspace" | "platform" | "disabled" — what the UI reports as in force.
    source: str


_missing_table_warned = False


async def _get_row(db: AsyncSession, workspace_id: str) -> WorkspaceAISettings | None:
    """The workspace's settings row, or None when it has none.

    Runs in a savepoint so that the one environment where this table may not
    exist — a database that has the new code but not yet
    ``migrate_workspace_ai_settings.sql`` — degrades to "platform default"
    instead of poisoning the caller's transaction and taking down every AI
    feature. Fail-open is only acceptable for *this* error: any other failure
    propagates, because silently ignoring it would mean ignoring a kill switch
    somebody deliberately turned on.
    """
    global _missing_table_warned
    from sqlalchemy.exc import OperationalError, ProgrammingError

    try:
        async with db.begin_nested():
            return (
                await db.execute(
                    select(WorkspaceAISettings).where(
                        WorkspaceAISettings.workspace_id == workspace_id
                    )
                )
            ).scalar_one_or_none()
    except (ProgrammingError, OperationalError) as exc:
        if not _missing_table_warned:
            _missing_table_warned = True
            logger.error(
                "workspace_ai_settings is unreadable (%s). Run "
                "scripts/migrate_workspace_ai_settings.sql — until then every "
                "workspace falls back to the platform AI defaults.",
                exc,
            )
        return None


async def workspace_plan_tier(db: AsyncSession, workspace_id: str) -> str | None:
    """The tier the workspace is billed against.

    Same rule as ``LimitsService._get_workspace_plan``: prefer the workspace's
    own ``plan_id``, otherwise fall back to the owner's developer plan so a
    workspace that was never explicitly assigned a plan still resolves.
    """
    from aexy.models.plan import Plan
    from aexy.services.limits_service import LimitsService

    ws = await db.get(Workspace, workspace_id)
    if ws is None:
        return None
    if ws.plan_id:
        plan = await db.get(Plan, ws.plan_id)
        if plan is not None:
            return plan.tier
    if ws.owner_id:
        owner_plan = await LimitsService(db).get_plan(ws.owner_id)
        return owner_plan.tier if owner_plan else None
    return None


async def resolve_ai_config(db: AsyncSession, workspace_id: str) -> WorkspaceAIConfig:
    """What AI this workspace may use, and through whose credential.

    Never raises for missing rows — a workspace with no settings row is the
    default state (AI on, platform provider).
    """
    from aexy.llm.base import LLMConfig

    row = await _get_row(db, workspace_id)
    if row is None:
        return WorkspaceAIConfig(True, None, True, "platform")

    if not row.ai_enabled:
        return WorkspaceAIConfig(False, None, False, "disabled")

    if not row.provider:
        return WorkspaceAIConfig(True, None, True, "platform")

    api_key: str | None = None
    if row.encrypted_api_key:
        try:
            api_key = decrypt_credentials(row.encrypted_api_key).get(_KEY_FIELD)
        except Exception:  # noqa: BLE001 — a key we cannot read is a key we don't have
            # Happens if SECRET_KEY was rotated. Log loudly: the workspace is
            # about to behave as if it never configured a provider.
            logger.error(
                "Workspace %s AI credential could not be decrypted; falling back per policy",
                workspace_id,
            )

    if row.provider in AI_PROVIDERS_REQUIRING_KEY and not api_key:
        # Configured but unusable. Honour the workspace's own choice about
        # whether platform credentials may stand in.
        if row.allow_platform_fallback:
            return WorkspaceAIConfig(True, None, True, "platform")
        return WorkspaceAIConfig(False, None, False, "disabled")

    config = LLMConfig(
        provider=row.provider,
        model=row.model or _default_model_for(row.provider),
        api_key=api_key,
        base_url=row.base_url or _default_base_url_for(row.provider),
        max_tokens=_platform_max_tokens(),
        temperature=0.0,
    )
    return WorkspaceAIConfig(True, config, row.allow_platform_fallback, "workspace")


def _platform_max_tokens() -> int:
    from aexy.core.config import get_settings

    settings = get_settings()
    return getattr(getattr(settings, "llm", None), "max_tokens_per_request", 4096)


def _default_model_for(provider: str) -> str:
    """The model to use when the workspace named a provider but not a model.

    Only borrows the deployment's configured model when the workspace picked the
    *same* provider the deployment runs. Otherwise it returns "" so the provider
    class applies its own DEFAULT_MODEL — handing a Gemini model name to Claude
    (which is what borrowing unconditionally does on a Gemini deployment) fails
    at the API with a confusing "model not found".
    """
    from aexy.core.config import get_settings

    llm = getattr(get_settings(), "llm", None)
    if provider == "lmstudio":
        return getattr(llm, "lmstudio_model", "") or "local-model"
    if provider == getattr(llm, "llm_provider", None):
        return getattr(llm, "llm_model", "") or ""
    return ""


def _default_base_url_for(provider: str) -> str | None:
    from aexy.core.config import get_settings

    llm = getattr(get_settings(), "llm", None)
    if provider == "ollama":
        return getattr(llm, "ollama_base_url", None)
    if provider == "lmstudio":
        return getattr(llm, "lmstudio_base_url", None)
    return None


async def is_ai_enabled(db: AsyncSession, workspace_id: str) -> bool:
    """The kill switch, for callers that want to bail out before doing work."""
    return (await resolve_ai_config(db, workspace_id)).enabled


async def ensure_ai_enabled(db: AsyncSession, workspace_id: str) -> None:
    """403 when the workspace has AI switched off. For API entry points."""
    if not await is_ai_enabled(db, workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AI features are disabled for this workspace",
        )


class WorkspaceAISettingsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------ read

    async def get(self, workspace_id: str, developer_id: str) -> AISettingsResponse:
        from aexy.services.workspace_service import WorkspaceService

        row = await _get_row(self.db, workspace_id)
        can_manage = await WorkspaceService(self.db).check_permission(
            workspace_id, developer_id, "admin"
        )
        tier = await workspace_plan_tier(self.db, workspace_id)
        resolved = await resolve_ai_config(self.db, workspace_id)

        if row is None:
            return AISettingsResponse(
                workspace_id=workspace_id,
                can_manage=can_manage,
                plan_allows=tier in AI_SETTINGS_TIERS if tier else False,
                plan_tier=tier,
                effective_source=resolved.source,
            )

        return AISettingsResponse(
            workspace_id=workspace_id,
            ai_enabled=row.ai_enabled,
            provider=row.provider,
            model=row.model,
            base_url=row.base_url,
            allow_platform_fallback=row.allow_platform_fallback,
            has_api_key=bool(row.encrypted_api_key),
            key_hint=row.key_hint,
            key_set_at=row.key_set_at,
            disabled_reason=row.disabled_reason,
            disabled_at=row.disabled_at,
            updated_at=row.updated_at,
            can_manage=can_manage,
            plan_allows=tier in AI_SETTINGS_TIERS if tier else False,
            plan_tier=tier,
            effective_source=resolved.source,
        )

    # ----------------------------------------------------------------- write

    async def _require_manager(self, workspace_id: str, developer_id: str) -> None:
        """Owner or admin only.

        ``check_permission`` is rank-based and "owner" outranks "admin", so this
        single check covers both without a separate owner branch.
        """
        from aexy.services.workspace_service import WorkspaceService

        if not await WorkspaceService(self.db).check_permission(
            workspace_id, developer_id, "admin"
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the workspace owner or an admin can change AI settings",
            )

    async def _require_plan(self, workspace_id: str) -> None:
        tier = await workspace_plan_tier(self.db, workspace_id)
        if tier not in AI_SETTINGS_TIERS:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=(
                    "Workspace AI settings are available on the Pro and Enterprise "
                    "plans. Upgrade to disable AI workspace-wide or use your own "
                    "provider keys."
                ),
            )

    async def update(
        self, workspace_id: str, data: AISettingsUpdate, developer_id: str
    ) -> AISettingsResponse:
        await self._require_manager(workspace_id, developer_id)
        await self._require_plan(workspace_id)

        workspace = await self.db.get(Workspace, workspace_id)
        if workspace is None:
            raise HTTPException(status_code=404, detail="Workspace not found")

        # The demo workspace's kill switch is not the demo user's to lift. The
        # account is shared and is an owner, so without this any visitor could
        # turn AI on and every session after them would spend the operator's
        # credential. Refused rather than undone at the next sign-in, which is
        # too late.
        if data.ai_enabled:
            from aexy.core.config import get_settings
            from aexy.services.demo_login_service import demo_workspace_ai_locked

            if demo_workspace_ai_locked(get_settings(), workspace):
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "AI is held off for the demo workspace. Turn off "
                        "AEXY_DEMO_LOGIN, or use a workspace of your own."
                    ),
                )

        row = await _get_row(self.db, workspace_id)
        if row is None:
            row = WorkspaceAISettings(workspace_id=workspace_id)
            self.db.add(row)

        payload = data.model_dump(exclude_unset=True)
        now = datetime.now(timezone.utc)

        if "ai_enabled" in payload and payload["ai_enabled"] is not None:
            new_state = bool(payload["ai_enabled"])
            if new_state != row.ai_enabled:
                row.disabled_at = None if new_state else now
                logger.warning(
                    "Workspace %s AI access %s by %s (%s)",
                    workspace_id,
                    "enabled" if new_state else "DISABLED",
                    developer_id,
                    payload.get("disabled_reason") or "no reason given",
                )
            row.ai_enabled = new_state

        if "disabled_reason" in payload:
            row.disabled_reason = payload["disabled_reason"]

        if data.clear_provider:
            # Hand the workspace back to the platform default and take the
            # credential with it — leaving an orphaned key installed against no
            # provider is the kind of state nobody remembers to clean up.
            row.provider = None
            row.model = None
            row.base_url = None
            self._clear_key(row)
        else:
            if "provider" in payload and payload["provider"] is not None:
                if payload["provider"] not in SUPPORTED_AI_PROVIDERS:
                    raise HTTPException(
                        status_code=400, detail=f"Unsupported provider: {payload['provider']}"
                    )
                row.provider = payload["provider"]
            if "model" in payload:
                row.model = payload["model"] or None
            if "base_url" in payload:
                row.base_url = payload["base_url"] or None

            if "api_key" in payload:
                raw = (payload["api_key"] or "").strip()
                if raw:
                    self._set_key(row, raw)
                else:
                    self._clear_key(row)

        if "allow_platform_fallback" in payload and payload["allow_platform_fallback"] is not None:
            row.allow_platform_fallback = bool(payload["allow_platform_fallback"])

        # Reject a configuration that cannot possibly work, rather than storing
        # it and breaking every AI feature in the workspace silently.
        if (
            row.provider
            and row.provider in AI_PROVIDERS_REQUIRING_KEY
            and not row.encrypted_api_key
        ):
            raise HTTPException(
                status_code=400,
                detail=f"An API key is required to use {row.provider}",
            )

        row.updated_by_id = developer_id
        await self.db.flush()
        return await self.get(workspace_id, developer_id)

    def _set_key(self, row: WorkspaceAISettings, raw: str) -> None:
        row.encrypted_api_key = encrypt_credentials({_KEY_FIELD: raw})
        row.key_hint = raw[-4:] if len(raw) >= 4 else None
        row.key_set_at = datetime.now(timezone.utc)

    def _clear_key(self, row: WorkspaceAISettings) -> None:
        row.encrypted_api_key = None
        row.key_hint = None
        row.key_set_at = None

    # ------------------------------------------------------------------ probe

    async def test_connection(
        self, workspace_id: str, developer_id: str
    ) -> AIConnectionTestResult:
        """Send a trivial prompt through whatever this workspace resolves to.

        Worth its own endpoint: a wrong key or an unreachable self-hosted
        endpoint otherwise surfaces as a batch of features quietly degrading
        hours later, with the failure buried in a worker log.
        """
        await self._require_manager(workspace_id, developer_id)

        resolved = await resolve_ai_config(self.db, workspace_id)
        if not resolved.enabled:
            return AIConnectionTestResult(
                ok=False, detail="AI is disabled for this workspace"
            )
        if resolved.config is None:
            return AIConnectionTestResult(
                ok=False,
                detail="No workspace provider configured — the platform default is in use",
            )

        from aexy.llm.gateway import create_provider

        provider = None
        try:
            provider = create_provider(resolved.config)
            text, *_ = await provider._call_api("Reply with the single word: ok", "ping")
            return AIConnectionTestResult(
                ok=bool(text),
                provider=resolved.config.provider,
                # The provider's *effective* model, not the stored value: when
                # the workspace didn't name one, "" would tell the admin nothing
                # about what actually ran.
                model=provider.model_name,
                detail=(text or "")[:200] or None,
            )
        except Exception as exc:  # noqa: BLE001 — the message is the whole point
            return AIConnectionTestResult(
                ok=False,
                provider=resolved.config.provider,
                model=getattr(provider, "model_name", None) or resolved.config.model or None,
                detail=str(exc)[:500],
            )
