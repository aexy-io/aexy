"""Service for managing API tokens."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.api_token import ApiToken
from aexy.schemas.api_token import ApiTokenCreate


class ApiTokenService:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _generate_token() -> str:
        """Generate a raw token in format: aexy_<32 hex chars>."""
        return f"aexy_{secrets.token_hex(16)}"

    @staticmethod
    def _hash_token(raw_token: str) -> str:
        """SHA-256 hash a raw token."""
        return hashlib.sha256(raw_token.encode()).hexdigest()

    async def create(self, developer_id: str, data: ApiTokenCreate) -> tuple[ApiToken, str]:
        """Create a new API token. Returns (token_model, raw_token)."""
        raw_token = self._generate_token()
        token_hash = self._hash_token(raw_token)
        token_prefix = raw_token[:12]  # "aexy_" + first 7 hex chars

        expires_at = None
        if data.expires_in_days is not None:
            expires_at = datetime.now(timezone.utc) + timedelta(days=data.expires_in_days)

        api_token = ApiToken(
            developer_id=developer_id,
            name=data.name,
            token_hash=token_hash,
            token_prefix=token_prefix,
            expires_at=expires_at,
        )
        self.db.add(api_token)
        await self.db.flush()
        return api_token, raw_token

    async def list(self, developer_id: str) -> list[ApiToken]:
        """List all tokens for a developer."""
        stmt = (
            select(ApiToken)
            .where(ApiToken.developer_id == developer_id)
            .order_by(ApiToken.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def revoke(self, developer_id: str, token_id: str) -> ApiToken | None:
        """Revoke a token (set is_active=False)."""
        stmt = select(ApiToken).where(
            ApiToken.id == token_id,
            ApiToken.developer_id == developer_id,
        )
        result = await self.db.execute(stmt)
        token = result.scalar_one_or_none()
        if token is None:
            return None
        token.is_active = False
        await self.db.flush()
        return token

    async def delete(self, developer_id: str, token_id: str) -> bool:
        """Hard-delete a token."""
        stmt = select(ApiToken).where(
            ApiToken.id == token_id,
            ApiToken.developer_id == developer_id,
        )
        result = await self.db.execute(stmt)
        token = result.scalar_one_or_none()
        if token is None:
            return False
        await self.db.delete(token)
        await self.db.flush()
        return True

    async def validate(self, raw_token: str) -> ApiToken | None:
        """Validate a raw token. Returns the token record if valid, else None."""
        token_hash = self._hash_token(raw_token)
        stmt = select(ApiToken).where(
            ApiToken.token_hash == token_hash,
            ApiToken.is_active == True,  # noqa: E712
        )
        result = await self.db.execute(stmt)
        token = result.scalar_one_or_none()
        if token is None:
            return None

        # Check expiry
        if token.expires_at and token.expires_at < datetime.now(timezone.utc):
            return None

        # Update last_used_at
        token.last_used_at = datetime.now(timezone.utc)
        await self.db.flush()
        return token
