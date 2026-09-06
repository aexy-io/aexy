"""Creating, scoping and authenticating agent principals.

See `models/agent_principal.py` for what a principal is and why it acts
through a synthetic developer. This module owns the three invariants that
make that safe:

  * a principal's capabilities are stored on it **and** mirrored into its
    member row's app overrides, so the REST API enforces the same scope the
    MCP transport does — a principal token that bypasses MCP and calls an
    endpoint directly still reaches only its declared apps;
  * a principal has at most one live token at a time — issuing a new one
    revokes the old, so "rotate" is the only operation and a leaked token has
    a short remaining life;
  * deactivating a principal revokes its tokens and suspends its membership in
    the same transaction, so nothing can act as it a moment later.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.agent_principal import AGENT_ACCOUNT_TYPE, AgentPrincipal
from aexy.models.api_token import ApiToken
from aexy.models.app_definitions import APP_CATALOG
from aexy.models.developer import Developer
from aexy.models.workspace import WorkspaceMember
from aexy.services.mcp_catalog import PLATFORM_CAPABILITIES

# The domain is not routable on purpose; the address exists only to satisfy a
# unique column and to make an agent row unmistakable in a member list.
PRINCIPAL_EMAIL_DOMAIN = "agents.aexy.invalid"

# From `AppAccessService`; duplicated as a literal rather than imported so the
# principal service does not depend on the access resolver's internals.
MEMBER_ACCESS_VERSION = 2


class PrincipalError(ValueError):
    pass


def overrides_for_capabilities(capabilities: list[str]) -> dict:
    """The member app overrides that grant exactly these capabilities.

    Every app is decided explicitly, on or off, so the principal's baseline
    (whatever role bundle a plain member would inherit) never leaks through.
    The three platform capabilities are modules on the `mcp` app.
    """
    caps = set(capabilities)
    overrides: dict[str, dict] = {}
    for app_id in APP_CATALOG:
        if app_id == "mcp":
            modules = {
                module: f"mcp.{module}" in caps for module in PLATFORM_CAPABILITIES
            }
            overrides[app_id] = {"enabled": any(modules.values()), "modules": modules}
        else:
            overrides[app_id] = {"enabled": f"mcp.{app_id}" in caps}
    return {"version": MEMBER_ACCESS_VERSION, "overrides": overrides}


def known_capabilities() -> set[str]:
    apps = {f"mcp.{app_id}" for app_id in APP_CATALOG if app_id != "mcp"}
    return apps | {f"mcp.{cap}" for cap in PLATFORM_CAPABILITIES}


class AgentPrincipalService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # Lookup
    # ------------------------------------------------------------------

    async def list(self, workspace_id: str) -> list[AgentPrincipal]:
        rows = await self.db.execute(
            select(AgentPrincipal)
            .where(AgentPrincipal.workspace_id == workspace_id)
            .order_by(AgentPrincipal.created_at.asc())
        )
        return list(rows.scalars().all())

    async def get(self, workspace_id: str, principal_id: str) -> AgentPrincipal | None:
        return (
            await self.db.execute(
                select(AgentPrincipal)
                .where(AgentPrincipal.id == principal_id)
                .where(AgentPrincipal.workspace_id == workspace_id)
            )
        ).scalar_one_or_none()

    async def get_by_id(self, principal_id: str) -> AgentPrincipal | None:
        return (
            await self.db.execute(
                select(AgentPrincipal).where(AgentPrincipal.id == principal_id)
            )
        ).scalar_one_or_none()

    async def active_token_counts(self, workspace_id: str) -> dict[str, int]:
        rows = await self.db.execute(
            select(ApiToken.principal_id, func.count(ApiToken.id))
            .join(AgentPrincipal, AgentPrincipal.id == ApiToken.principal_id)
            .where(AgentPrincipal.workspace_id == workspace_id)
            .where(ApiToken.is_active.is_(True))
            .group_by(ApiToken.principal_id)
        )
        return {str(pid): int(count) for pid, count in rows.all()}

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def _validate_capabilities(
        self, capabilities: list[str], grantable: set[str] | None = None
    ) -> list[str]:
        unknown = sorted(set(capabilities) - known_capabilities())
        if unknown:
            raise PrincipalError(f"Unknown capabilities: {', '.join(unknown)}")
        if grantable is not None:
            # A principal's scope is a subset of what the workspace holds. The
            # gate would clip anything else at call time, but a principal that
            # advertises CRM in a workspace without CRM is a lie in the admin
            # screen, and lies in admin screens get trusted.
            unheld = sorted(set(capabilities) - grantable)
            if unheld:
                raise PrincipalError(
                    "This workspace does not hold: " + ", ".join(unheld)
                    + ". Enable the app first, or leave it out."
                )
        return sorted(set(capabilities))

    async def create(
        self,
        *,
        workspace_id: str,
        name: str,
        description: str | None,
        capabilities: list[str],
        created_by_id: str,
        grantable: set[str] | None = None,
    ) -> AgentPrincipal:
        capabilities = self._validate_capabilities(capabilities, grantable)
        principal_id = str(uuid4())

        developer = Developer(
            id=str(uuid4()),
            email=f"agent-{principal_id[:8]}@{PRINCIPAL_EMAIL_DOMAIN}",
            name=name,
            account_type=AGENT_ACCOUNT_TYPE,
            has_completed_onboarding=True,
        )
        self.db.add(developer)
        await self.db.flush()

        now = datetime.now(timezone.utc)
        member = WorkspaceMember(
            id=str(uuid4()),
            workspace_id=workspace_id,
            developer_id=developer.id,
            role="member",
            status="active",
            is_billable=False,
            joined_at=now,
            invited_by_id=created_by_id,
            invited_at=now,
        )
        member.app_permissions = overrides_for_capabilities(capabilities)
        self.db.add(member)

        principal = AgentPrincipal(
            id=principal_id,
            workspace_id=workspace_id,
            developer_id=developer.id,
            name=name,
            description=description,
            capabilities=capabilities,
            is_active=True,
            created_by_id=created_by_id,
        )
        self.db.add(principal)
        await self.db.flush()
        # Server-side timestamps are unloaded after the flush; a response model
        # reading them lazily from an async session cannot.
        await self.db.refresh(principal)
        return principal

    async def update(
        self,
        principal: AgentPrincipal,
        *,
        name: str | None = None,
        description: str | None = None,
        capabilities: list[str] | None = None,
        is_active: bool | None = None,
        grantable: set[str] | None = None,
    ) -> AgentPrincipal:
        member = await self._member(principal)

        if name is not None:
            principal.name = name
            developer = await self.db.get(Developer, principal.developer_id)
            if developer is not None:
                developer.name = name
        if description is not None:
            principal.description = description
        if capabilities is not None:
            principal.capabilities = self._validate_capabilities(capabilities, grantable)
            if member is not None:
                member.app_permissions = overrides_for_capabilities(principal.capabilities)
        if is_active and member is not None and member.status == "removed":
            # Removal keeps the row for the ledger's sake; it is not a pause.
            raise PrincipalError("This principal was removed and cannot be reactivated.")
        if is_active is not None and is_active != principal.is_active:
            principal.is_active = is_active
            if member is not None:
                member.status = "active" if is_active else "suspended"
            if not is_active:
                await self._revoke_all_tokens(principal.id)

        await self.db.flush()
        await self.db.refresh(principal)
        self._invalidate_access_cache(principal)
        return principal

    async def remove(self, principal: AgentPrincipal) -> None:
        """Deactivate and detach. Rows are kept: the ledger points at them."""
        await self.update(principal, is_active=False)
        member = await self._member(principal)
        if member is not None:
            member.status = "removed"
        await self.db.flush()

    # ------------------------------------------------------------------
    # Tokens
    # ------------------------------------------------------------------

    async def list_tokens(self, principal_id: str) -> list[ApiToken]:
        rows = await self.db.execute(
            select(ApiToken)
            .where(ApiToken.principal_id == principal_id)
            .order_by(ApiToken.created_at.desc())
        )
        return list(rows.scalars().all())

    async def rotate_token(
        self,
        principal: AgentPrincipal,
        *,
        name: str | None = None,
        expires_in_days: int | None = None,
    ) -> tuple[ApiToken, str]:
        """Issue a fresh token and revoke every earlier one.

        One live token per principal: two would mean one could leak unnoticed
        while the other kept working, and "which one is the schedule using"
        becomes a question nobody can answer.
        """
        if not principal.is_active:
            raise PrincipalError("This principal is inactive; reactivate it first.")

        await self._revoke_all_tokens(principal.id)

        raw = f"aexy_{secrets.token_hex(16)}"
        token = ApiToken(
            id=str(uuid4()),
            developer_id=principal.developer_id,
            principal_id=principal.id,
            name=name or f"{principal.name} token",
            token_hash=hashlib.sha256(raw.encode()).hexdigest(),
            token_prefix=raw[:12],
            expires_at=(
                datetime.now(timezone.utc) + timedelta(days=expires_in_days)
                if expires_in_days
                else None
            ),
            scopes=list(principal.capabilities),
        )
        self.db.add(token)
        await self.db.flush()
        return token, raw

    async def touch(self, principal: AgentPrincipal) -> None:
        now = datetime.now(timezone.utc)
        last = principal.last_used_at
        if last is not None and last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if last is None or (now - last).total_seconds() > 300:
            principal.last_used_at = now
            await self.db.flush()

    # ------------------------------------------------------------------

    async def _member(self, principal: AgentPrincipal) -> WorkspaceMember | None:
        return (
            await self.db.execute(
                select(WorkspaceMember)
                .where(WorkspaceMember.workspace_id == principal.workspace_id)
                .where(WorkspaceMember.developer_id == principal.developer_id)
            )
        ).scalar_one_or_none()

    async def _revoke_all_tokens(self, principal_id: str) -> None:
        rows = await self.db.execute(
            select(ApiToken)
            .where(ApiToken.principal_id == principal_id)
            .where(ApiToken.is_active.is_(True))
        )
        for token in rows.scalars().all():
            token.is_active = False
        await self.db.flush()

    @staticmethod
    def _invalidate_access_cache(principal: AgentPrincipal) -> None:
        """The access resolver caches per (workspace, developer) briefly; a
        scope change must not wait it out."""
        try:
            from aexy.services.app_access_service import _effective_access_cache

            _effective_access_cache.pop(
                (str(principal.workspace_id), str(principal.developer_id)), None
            )
        except Exception:  # pragma: no cover - cache is an optimisation
            pass
