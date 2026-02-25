"""Temporal activities for table operations.

Handles periodic cleanup of expired audit logs based on per-table retention config.
"""

import logging
from dataclasses import dataclass

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


@dataclass
class CleanupExpiredAuditLogsInput:
    pass


@activity.defn
async def cleanup_expired_audit_logs(_input: CleanupExpiredAuditLogsInput) -> dict:
    """Delete audit log entries past their per-table retention period.

    Each table has audit_config.retention_days. Entries older than that are purged.
    Tables with audit_config.enabled=false or no retention_days are skipped.
    """
    from sqlalchemy import delete, select, text
    from sqlalchemy.sql import func

    from aexy.models.crm import CRMObject, TableAuditLog

    async with async_session_maker() as db:
        # Find tables with audit enabled and retention configured
        stmt = select(CRMObject.id, CRMObject.audit_config).where(
            CRMObject.audit_config.isnot(None),
        )
        result = await db.execute(stmt)
        tables = result.all()

        total_deleted = 0
        tables_cleaned = 0

        for table_id, audit_config in tables:
            if not isinstance(audit_config, dict):
                continue
            if not audit_config.get("enabled", False):
                continue
            retention_days = audit_config.get("retention_days")
            if not retention_days or retention_days <= 0:
                continue

            # Delete entries older than retention period
            cutoff = func.now() - text(f"interval '{int(retention_days)} days'")
            delete_stmt = (
                delete(TableAuditLog)
                .where(TableAuditLog.table_id == table_id)
                .where(TableAuditLog.created_at < cutoff)
            )
            result = await db.execute(delete_stmt)
            deleted = result.rowcount
            if deleted > 0:
                total_deleted += deleted
                tables_cleaned += 1
                logger.info(
                    "Cleaned %d audit entries for table %s (retention: %d days)",
                    deleted,
                    table_id,
                    retention_days,
                )

        await db.commit()

        logger.info(
            "Audit cleanup complete: %d entries deleted across %d tables",
            total_deleted,
            tables_cleaned,
        )
        return {"deleted": total_deleted, "tables_cleaned": tables_cleaned}
