"""Storage and resolution for workflow secrets.

Deliberately write-only from the outside. Secrets can be created, overwritten
and deleted, and their names listed — but no API path returns a value, to an
admin or anyone else. Rotation is an overwrite. The only reader is
`resolve_references`, called by the executors while a step is running.

That asymmetry is the point: the reason webhook headers were a problem is that
anything readable through the API is readable by everyone who can reach the
API, and a credential should not be in that set.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.encryption import decrypt_credentials, encrypt_credentials
from aexy.models.workspace_secret import WorkspaceSecret

# {{secrets.NAME}} — the only namespace whose value never appears in a graph.
SECRET_REFERENCE_RE = re.compile(r"\{\{\s*secrets\.([A-Za-z0-9_-]+)\s*\}\}")

# Same character set the reference accepts, so a name that can be stored can
# always be referenced.
_VALID_NAME_RE = re.compile(r"^[A-Za-z0-9_-]{1,120}$")


class UnknownSecretError(LookupError):
    """A step referenced a secret this workspace does not have."""


class WorkspaceSecretService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def upsert(
        self,
        workspace_id: str,
        name: str,
        value: str,
        *,
        description: str | None = None,
        created_by_id: str | None = None,
    ) -> WorkspaceSecret:
        """Create a secret or replace its value. Rotation is an overwrite."""
        if not _VALID_NAME_RE.match(name or ""):
            raise ValueError(
                "Secret name may contain only letters, numbers, underscore and "
                "hyphen, so that it can be referenced as {{secrets.NAME}}"
            )
        if not (value or "").strip():
            raise ValueError("Secret value cannot be empty")

        existing = (
            await self.db.execute(
                select(WorkspaceSecret).where(
                    WorkspaceSecret.workspace_id == workspace_id,
                    WorkspaceSecret.name == name,
                )
            )
        ).scalar_one_or_none()

        # The envelope helper takes a dict; one key keeps the stored shape the
        # same as every other encrypted column in the codebase.
        encrypted = encrypt_credentials({"value": value})

        if existing:
            existing.encrypted_value = encrypted
            if description is not None:
                existing.description = description
            return existing

        secret = WorkspaceSecret(
            workspace_id=workspace_id,
            name=name,
            encrypted_value=encrypted,
            description=description,
            created_by_id=created_by_id,
        )
        self.db.add(secret)
        await self.db.flush()
        return secret

    async def list_names(self, workspace_id: str) -> list[WorkspaceSecret]:
        """Every secret in the workspace — metadata only, never the value."""
        return list(
            (
                await self.db.execute(
                    select(WorkspaceSecret)
                    .where(WorkspaceSecret.workspace_id == workspace_id)
                    .order_by(WorkspaceSecret.name)
                )
            ).scalars()
        )

    async def delete(self, workspace_id: str, name: str) -> bool:
        secret = (
            await self.db.execute(
                select(WorkspaceSecret).where(
                    WorkspaceSecret.workspace_id == workspace_id,
                    WorkspaceSecret.name == name,
                )
            )
        ).scalar_one_or_none()
        if not secret:
            return False
        await self.db.delete(secret)
        return True

    async def resolve_references(self, workspace_id: str, template: str) -> str:
        rendered, _ = await self.resolve_and_collect(workspace_id, template)
        return rendered

    async def resolve_and_collect(
        self, workspace_id: str, template: str
    ) -> tuple[str, set[str]]:
        """Substitute every ``{{secrets.NAME}}`` in *template*.

        Returns the rendered string *and the values it substituted in*, so the
        caller can scrub them from anything it stores. That is not paranoia: a
        webhook receiver commonly echoes the request back, and the webhook step
        records the response body in run history — so a resolved credential
        came straight back out through the run log. Found by pointing a live
        step at a real echo server; a mocked response never shows it.

        Raises rather than leaving a reference unresolved: a half-substituted
        Authorization header would be sent to the provider as literal
        `{{secrets.X}}` text, which fails confusingly at the far end instead of
        clearly here.
        """
        names = set(SECRET_REFERENCE_RE.findall(template or ""))
        if not names:
            return template, set()

        rows = list(
            (
                await self.db.execute(
                    select(WorkspaceSecret).where(
                        WorkspaceSecret.workspace_id == workspace_id,
                        WorkspaceSecret.name.in_(names),
                    )
                )
            ).scalars()
        )
        found = {
            row.name: decrypt_credentials(row.encrypted_value).get("value", "")
            for row in rows
        }

        missing = sorted(names - set(found))
        if missing:
            raise UnknownSecretError(
                f"No secret named {', '.join(missing)} in this workspace"
            )

        # Touched, not read back: enough to retire an unused secret later
        # without recording what it was used for.
        await self.db.execute(
            update(WorkspaceSecret)
            .where(
                WorkspaceSecret.workspace_id == workspace_id,
                WorkspaceSecret.name.in_(names),
            )
            .values(last_used_at=datetime.now(timezone.utc))
        )

        rendered = SECRET_REFERENCE_RE.sub(lambda m: found[m.group(1)], template)
        return rendered, {v for v in found.values() if v}


def redact_secrets(text: str, values: set[str]) -> str:
    """Blank out resolved secret values before anything is stored or logged."""
    if not text or not values:
        return text
    for value in values:
        if value:
            text = text.replace(value, "[redacted secret]")
    return text
