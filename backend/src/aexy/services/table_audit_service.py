"""Audit trail service for data table operations."""

import secrets
from datetime import datetime, timedelta, timezone

import bcrypt

from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.crm import TableAuditLog, TableShareLink, CRMObject


class TableAuditService:
    """Records and queries audit trail entries for tables."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def log(
        self,
        table_id: str,
        actor_id: str,
        action: str,
        record_id: str | None = None,
        changes: dict | None = None,
        ip_address: str | None = None,
    ) -> TableAuditLog | None:
        """Record an audit entry if auditing is enabled for this table."""
        # Check if auditing is enabled
        result = await self.db.execute(
            select(CRMObject.audit_config).where(CRMObject.id == table_id)
        )
        config = result.scalar_one_or_none()
        if not config or not config.get("enabled", False):
            return None

        entry = TableAuditLog(
            table_id=table_id,
            record_id=record_id,
            actor_id=actor_id,
            action=action,
            changes=changes,
            ip_address=ip_address,
        )
        self.db.add(entry)
        await self.db.flush()
        return entry

    async def get_table_log(
        self,
        table_id: str,
        limit: int = 50,
        offset: int = 0,
        action_filter: str | None = None,
        record_id: str | None = None,
    ) -> tuple[list[TableAuditLog], int]:
        """Get audit log entries for a table."""
        query = select(TableAuditLog).where(TableAuditLog.table_id == table_id)

        if action_filter:
            query = query.where(TableAuditLog.action == action_filter)
        if record_id:
            query = query.where(TableAuditLog.record_id == record_id)

        count_query = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_query)).scalar() or 0

        query = query.order_by(desc(TableAuditLog.created_at)).offset(offset).limit(limit)
        result = await self.db.execute(query)
        entries = list(result.scalars().all())

        return entries, total

    async def cleanup_expired(
        self, table_id: str, retention_days: int
    ) -> int:
        """Delete audit entries older than retention period."""
        from sqlalchemy import delete

        cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
        stmt = (
            delete(TableAuditLog)
            .where(TableAuditLog.table_id == table_id)
            .where(TableAuditLog.created_at < cutoff)
        )
        result = await self.db.execute(stmt)
        return result.rowcount


class TableShareService:
    """Manages share links for tables."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_share_link(
        self,
        table_id: str,
        created_by_id: str,
        permission: str = "view",
        password: str | None = None,
        expires_at: datetime | None = None,
        max_uses: int | None = None,
        view_id: str | None = None,
        hidden_columns: list[str] | None = None,
        row_filter: dict | None = None,
    ) -> TableShareLink:
        """Create a new share link for a table."""
        token = secrets.token_urlsafe(48)

        password_hash = None
        if password:
            password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

        link = TableShareLink(
            table_id=table_id,
            token=token,
            permission=permission,
            password_hash=password_hash,
            expires_at=expires_at,
            max_uses=max_uses,
            view_id=view_id,
            hidden_columns=hidden_columns or [],
            row_filter=row_filter,
            created_by_id=created_by_id,
        )
        self.db.add(link)
        await self.db.flush()
        return link

    async def get_by_token(self, token: str) -> TableShareLink | None:
        """Get an active share link by token."""
        result = await self.db.execute(
            select(TableShareLink).where(
                TableShareLink.token == token,
                TableShareLink.is_active == True,
            )
        )
        link = result.scalar_one_or_none()
        if not link:
            return None

        # Check expiry
        if link.expires_at and link.expires_at < datetime.now(timezone.utc):
            return None

        # Check usage limit
        if link.max_uses and link.use_count >= link.max_uses:
            return None

        return link

    async def increment_usage(self, link_id: str) -> None:
        """Increment the use count of a share link."""
        result = await self.db.execute(
            select(TableShareLink).where(TableShareLink.id == link_id)
        )
        link = result.scalar_one_or_none()
        if link:
            link.use_count += 1

    async def list_links(self, table_id: str) -> list[TableShareLink]:
        """List all share links for a table."""
        result = await self.db.execute(
            select(TableShareLink)
            .where(TableShareLink.table_id == table_id)
            .order_by(desc(TableShareLink.created_at))
        )
        return list(result.scalars().all())

    async def revoke_link(self, link_id: str) -> bool:
        """Deactivate a share link."""
        result = await self.db.execute(
            select(TableShareLink).where(TableShareLink.id == link_id)
        )
        link = result.scalar_one_or_none()
        if link:
            link.is_active = False
            return True
        return False

    async def verify_password(self, link: TableShareLink, password: str) -> bool:
        """Check if the password matches the share link."""
        if not link.password_hash:
            return True  # No password required
        return bcrypt.checkpw(password.encode(), link.password_hash.encode())
