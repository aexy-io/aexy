"""Uptime monitoring service for managing monitors, checks, and incidents."""

import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.uptime import (
    UptimeMonitor,
    UptimeCheck,
    UptimeIncident,
    UptimeMonitorStatus,
    UptimeIncidentStatus,
)
from aexy.models.ticketing import (
    Ticket,
    TicketResponse as TicketResponseModel,
    TicketForm,
    TicketStatus,
    TicketPriority,
    TicketSeverity,
)
from aexy.schemas.uptime import (
    UptimeMonitorCreate,
    UptimeMonitorUpdate,
    UptimeIncidentUpdate,
    UptimeIncidentResolve,
    UptimeMonitorStats,
    WorkspaceUptimeStats,
)
from aexy.services.uptime_checker import CheckResult

logger = logging.getLogger(__name__)


class UptimeServiceError(Exception):
    """Base exception for uptime service errors."""
    pass


class MonitorNotFoundError(UptimeServiceError):
    """Monitor not found error."""
    pass


class IncidentNotFoundError(UptimeServiceError):
    """Incident not found error."""
    pass


class UptimeService:
    """Service for managing uptime monitoring."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ==========================================================================
    # MONITOR CRUD
    # ==========================================================================

    async def create_monitor(
        self,
        workspace_id: str,
        data: UptimeMonitorCreate,
        created_by_id: str | None = None,
    ) -> UptimeMonitor:
        """Create a new uptime monitor.

        Args:
            workspace_id: Workspace ID.
            data: Monitor configuration.
            created_by_id: Developer ID creating the monitor.

        Returns:
            Created UptimeMonitor.
        """
        # Calculate first check time
        now = datetime.now(timezone.utc)
        next_check_at = now + timedelta(seconds=30)  # First check in 30 seconds

        monitor = UptimeMonitor(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=data.name,
            description=data.description,
            check_type=data.check_type.value,
            url=data.url,
            host=data.host,
            port=data.port,
            http_method=data.http_method,
            expected_status_codes=data.expected_status_codes,
            request_headers=data.request_headers,
            request_body=data.request_body,
            verify_ssl=data.verify_ssl,
            follow_redirects=data.follow_redirects,
            ws_message=data.ws_message,
            ws_expected_response=data.ws_expected_response,
            check_interval_seconds=data.check_interval_seconds,
            timeout_seconds=data.timeout_seconds,
            consecutive_failures_threshold=data.consecutive_failures_threshold,
            notification_channels=data.notification_channels,
            slack_channel_id=data.slack_channel_id,
            webhook_url=data.webhook_url,
            notify_on_recovery=data.notify_on_recovery,
            team_id=data.team_id,
            current_status=UptimeMonitorStatus.UNKNOWN.value,
            next_check_at=next_check_at,
            is_active=True,
            created_by_id=created_by_id,
        )

        self.db.add(monitor)
        await self.db.flush()
        await self.db.refresh(monitor)
        return monitor

    async def get_monitor(self, monitor_id: str) -> UptimeMonitor | None:
        """Get a monitor by ID.

        Args:
            monitor_id: Monitor ID.

        Returns:
            UptimeMonitor or None.
        """
        stmt = (
            select(UptimeMonitor)
            .where(UptimeMonitor.id == monitor_id)
            .options(
                selectinload(UptimeMonitor.team),
                selectinload(UptimeMonitor.created_by),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_monitor_by_name(
        self,
        workspace_id: str,
        name: str,
    ) -> UptimeMonitor | None:
        """Get a monitor by name within a workspace.

        Args:
            workspace_id: Workspace ID.
            name: Monitor name.

        Returns:
            UptimeMonitor or None.
        """
        stmt = (
            select(UptimeMonitor)
            .where(
                and_(
                    UptimeMonitor.workspace_id == workspace_id,
                    UptimeMonitor.name == name,
                )
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_monitors(
        self,
        workspace_id: str,
        active_only: bool = False,
        status: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[UptimeMonitor], int]:
        """List monitors for a workspace.

        Args:
            workspace_id: Workspace ID.
            active_only: Only return active monitors.
            status: Filter by status.
            limit: Maximum results.
            offset: Skip count.

        Returns:
            Tuple of (monitors, total_count).
        """
        base_stmt = select(UptimeMonitor).where(
            UptimeMonitor.workspace_id == workspace_id
        )

        if active_only:
            base_stmt = base_stmt.where(UptimeMonitor.is_active == True)

        if status:
            base_stmt = base_stmt.where(UptimeMonitor.current_status == status)

        # Count total
        count_stmt = select(func.count()).select_from(base_stmt.subquery())
        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar() or 0

        # Get paginated results
        stmt = (
            base_stmt
            .options(selectinload(UptimeMonitor.team))
            .order_by(UptimeMonitor.name)
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        monitors = list(result.scalars().all())

        return monitors, total

    async def update_monitor(
        self,
        monitor_id: str,
        data: UptimeMonitorUpdate,
    ) -> UptimeMonitor:
        """Update a monitor.

        Args:
            monitor_id: Monitor ID.
            data: Update data.

        Returns:
            Updated UptimeMonitor.

        Raises:
            MonitorNotFoundError: If monitor not found.
        """
        monitor = await self.get_monitor(monitor_id)
        if not monitor:
            raise MonitorNotFoundError(f"Monitor {monitor_id} not found")

        update_data = data.model_dump(exclude_unset=True)

        # Handle check_type enum
        if "check_type" in update_data and update_data["check_type"]:
            update_data["check_type"] = update_data["check_type"].value

        for field, value in update_data.items():
            setattr(monitor, field, value)

        await self.db.flush()
        await self.db.refresh(monitor)
        return monitor

    async def delete_monitor(self, monitor_id: str) -> bool:
        """Delete a monitor.

        Args:
            monitor_id: Monitor ID.

        Returns:
            True if deleted, False if not found.
        """
        monitor = await self.get_monitor(monitor_id)
        if not monitor:
            return False

        await self.db.delete(monitor)
        await self.db.flush()
        return True

    async def pause_monitor(self, monitor_id: str) -> UptimeMonitor:
        """Pause a monitor.

        Args:
            monitor_id: Monitor ID.

        Returns:
            Updated UptimeMonitor.

        Raises:
            MonitorNotFoundError: If monitor not found.
        """
        monitor = await self.get_monitor(monitor_id)
        if not monitor:
            raise MonitorNotFoundError(f"Monitor {monitor_id} not found")

        monitor.is_active = False
        monitor.current_status = UptimeMonitorStatus.PAUSED.value
        monitor.next_check_at = None

        await self.db.flush()
        await self.db.refresh(monitor)
        return monitor

    async def resume_monitor(self, monitor_id: str) -> UptimeMonitor:
        """Resume a paused monitor.

        Args:
            monitor_id: Monitor ID.

        Returns:
            Updated UptimeMonitor.

        Raises:
            MonitorNotFoundError: If monitor not found.
        """
        monitor = await self.get_monitor(monitor_id)
        if not monitor:
            raise MonitorNotFoundError(f"Monitor {monitor_id} not found")

        now = datetime.now(timezone.utc)
        monitor.is_active = True
        monitor.current_status = UptimeMonitorStatus.UNKNOWN.value
        monitor.next_check_at = now + timedelta(seconds=30)  # Check in 30 seconds

        await self.db.flush()
        await self.db.refresh(monitor)
        return monitor

    # ==========================================================================
    # CHECK PROCESSING
    # ==========================================================================

    async def get_due_monitors(self, limit: int = 100) -> list[UptimeMonitor]:
        """Get monitors that are due for a check.

        Args:
            limit: Maximum number of monitors to return.

        Returns:
            List of monitors due for checking.
        """
        now = datetime.now(timezone.utc)
        stmt = (
            select(UptimeMonitor)
            .where(
                and_(
                    UptimeMonitor.is_active == True,
                    UptimeMonitor.next_check_at <= now,
                )
            )
            .order_by(UptimeMonitor.next_check_at)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def record_check_result(
        self,
        monitor_id: str,
        check_result: CheckResult,
    ) -> tuple[UptimeCheck, UptimeIncident | None, bool]:
        """Record a check result and handle incident logic.

        Args:
            monitor_id: Monitor ID.
            check_result: Result from the checker.

        Returns:
            Tuple of (UptimeCheck, UptimeIncident or None, is_new_incident).

        Raises:
            MonitorNotFoundError: If monitor not found.
        """
        monitor = await self.get_monitor(monitor_id)
        if not monitor:
            raise MonitorNotFoundError(f"Monitor {monitor_id} not found")

        now = datetime.now(timezone.utc)

        # Create check record
        check = UptimeCheck(
            id=str(uuid4()),
            monitor_id=monitor_id,
            is_up=check_result.is_up,
            status_code=check_result.status_code,
            response_time_ms=check_result.response_time_ms,
            error_message=check_result.error_message,
            error_type=check_result.error_type,
            ssl_expiry_days=check_result.ssl_expiry_days,
            ssl_issuer=check_result.ssl_issuer,
            response_body_snippet=check_result.response_body_snippet,
            response_headers=check_result.response_headers,
            checked_at=check_result.checked_at or now,
        )
        self.db.add(check)

        # Update monitor state
        monitor.last_check_at = now
        monitor.next_check_at = now + timedelta(seconds=monitor.check_interval_seconds)
        monitor.last_response_time_ms = check_result.response_time_ms
        monitor.last_error_message = check_result.error_message if not check_result.is_up else None

        incident = None
        is_new_incident = False
        recovery_occurred = False

        if check_result.is_up:
            # Check passed - handle recovery
            old_consecutive_failures = monitor.consecutive_failures
            monitor.consecutive_failures = 0
            monitor.current_status = UptimeMonitorStatus.UP.value

            # Check for recovery from incident
            if old_consecutive_failures >= monitor.consecutive_failures_threshold:
                incident = await self._handle_recovery(monitor)
                recovery_occurred = True
        else:
            # Check failed
            monitor.consecutive_failures += 1

            if monitor.consecutive_failures >= monitor.consecutive_failures_threshold:
                monitor.current_status = UptimeMonitorStatus.DOWN.value

                # Check for existing incident or create new one
                incident, is_new_incident = await self._handle_failure(
                    monitor,
                    check_result,
                )
            else:
                # Not at threshold yet
                monitor.current_status = UptimeMonitorStatus.DEGRADED.value

        await self.db.flush()
        await self.db.refresh(check)
        if incident:
            await self.db.refresh(incident)

        return check, incident, is_new_incident

    async def _handle_failure(
        self,
        monitor: UptimeMonitor,
        check_result: CheckResult,
    ) -> tuple[UptimeIncident | None, bool]:
        """Handle a check failure at or above threshold.

        Args:
            monitor: The monitor.
            check_result: The failed check result.

        Returns:
            Tuple of (incident, is_new).
        """
        # Look for existing ongoing incident
        existing_incident = await self.get_ongoing_incident(monitor.id)

        if existing_incident:
            # Update existing incident
            existing_incident.last_error_message = check_result.error_message
            existing_incident.last_error_type = check_result.error_type
            existing_incident.total_checks += 1
            existing_incident.failed_checks += 1

            # Add comment to linked ticket
            if existing_incident.ticket_id:
                await self._add_ticket_comment(
                    existing_incident.ticket_id,
                    f"Service is still down. Error: {check_result.error_message or 'Unknown error'}",
                )

            return existing_incident, False
        else:
            # Create new incident
            incident = UptimeIncident(
                id=str(uuid4()),
                monitor_id=monitor.id,
                workspace_id=monitor.workspace_id,
                status=UptimeIncidentStatus.ONGOING.value,
                first_error_message=check_result.error_message,
                first_error_type=check_result.error_type,
                last_error_message=check_result.error_message,
                last_error_type=check_result.error_type,
                total_checks=1,
                failed_checks=1,
            )
            self.db.add(incident)
            await self.db.flush()

            # Create ticket for the incident
            if "ticket" in monitor.notification_channels:
                ticket = await self._create_incident_ticket(monitor, incident, check_result)
                if ticket:
                    incident.ticket_id = ticket.id

            await self.db.refresh(incident)
            return incident, True

    async def _handle_recovery(self, monitor: UptimeMonitor) -> UptimeIncident | None:
        """Handle recovery from an incident.

        Args:
            monitor: The monitor that recovered.

        Returns:
            Resolved incident or None.
        """
        incident = await self.get_ongoing_incident(monitor.id)
        if not incident:
            return None

        now = datetime.now(timezone.utc)
        incident.status = UptimeIncidentStatus.RESOLVED.value
        incident.resolved_at = now

        # Auto-close linked ticket
        if incident.ticket_id:
            await self._close_incident_ticket(incident)

        return incident

    # ==========================================================================
    # TICKET INTEGRATION
    # ==========================================================================

    async def _create_incident_ticket(
        self,
        monitor: UptimeMonitor,
        incident: UptimeIncident,
        check_result: CheckResult,
    ) -> Ticket | None:
        """Create a ticket for an uptime incident.

        Args:
            monitor: The monitor.
            incident: The incident.
            check_result: The failed check result.

        Returns:
            Created Ticket or None if no form available.
        """
        try:
            # Get default form for workspace (first active form)
            form_stmt = (
                select(TicketForm)
                .where(
                    and_(
                        TicketForm.workspace_id == monitor.workspace_id,
                        TicketForm.is_active == True,
                    )
                )
                .order_by(TicketForm.created_at)
                .limit(1)
            )
            form_result = await self.db.execute(form_stmt)
            form = form_result.scalar_one_or_none()

            if not form:
                logger.warning(
                    f"No ticket form found for workspace {monitor.workspace_id}, "
                    f"skipping ticket creation for incident {incident.id}"
                )
                return None

            # Get next ticket number
            number_stmt = (
                select(func.max(Ticket.ticket_number))
                .where(Ticket.workspace_id == monitor.workspace_id)
            )
            number_result = await self.db.execute(number_stmt)
            max_number = number_result.scalar() or 0
            ticket_number = max_number + 1

            # Build ticket title and description
            endpoint = monitor.url or f"{monitor.host}:{monitor.port}"
            title = f"[UPTIME] {monitor.name} is down"
            description = f"""**Monitor:** {monitor.name}
**Type:** {monitor.check_type.upper()}
**Endpoint:** {endpoint}
**Error:** {check_result.error_message or 'Unknown error'}
**Error Type:** {check_result.error_type or 'Unknown'}
**Incident Started:** {incident.started_at.isoformat()}

This ticket was automatically created by the uptime monitoring system.
"""

            ticket = Ticket(
                id=str(uuid4()),
                form_id=form.id,
                workspace_id=monitor.workspace_id,
                ticket_number=ticket_number,
                field_values={
                    "title": title,
                    "description": description,
                    "monitor_id": monitor.id,
                    "incident_id": incident.id,
                },
                status=TicketStatus.NEW.value,
                priority=TicketPriority.URGENT.value,
                severity=TicketSeverity.HIGH.value,
                team_id=monitor.team_id,
            )
            self.db.add(ticket)
            await self.db.flush()
            await self.db.refresh(ticket)

            logger.info(
                f"Created ticket #{ticket_number} for uptime incident {incident.id}"
            )
            return ticket

        except Exception as e:
            logger.exception(f"Failed to create ticket for incident {incident.id}: {e}")
            return None

    async def _close_incident_ticket(self, incident: UptimeIncident) -> None:
        """Close the ticket linked to a resolved incident.

        Args:
            incident: The resolved incident.
        """
        if not incident.ticket_id:
            return

        try:
            ticket_stmt = select(Ticket).where(Ticket.id == incident.ticket_id)
            ticket_result = await self.db.execute(ticket_stmt)
            ticket = ticket_result.scalar_one_or_none()

            if not ticket:
                return

            # Skip if already closed
            if ticket.status == TicketStatus.CLOSED.value:
                return

            # Calculate duration
            duration_seconds = 0
            if incident.resolved_at and incident.started_at:
                duration_seconds = int(
                    (incident.resolved_at - incident.started_at).total_seconds()
                )

            # Format duration
            if duration_seconds < 60:
                duration_str = f"{duration_seconds} seconds"
            elif duration_seconds < 3600:
                duration_str = f"{duration_seconds // 60} minutes"
            else:
                hours = duration_seconds // 3600
                minutes = (duration_seconds % 3600) // 60
                duration_str = f"{hours}h {minutes}m"

            # Add resolution comment
            comment = f"""**Service has recovered.**

**Duration:** {duration_str}
**Started:** {incident.started_at.isoformat()}
**Resolved:** {incident.resolved_at.isoformat()}
**Total checks during incident:** {incident.total_checks}
**Failed checks:** {incident.failed_checks}

This ticket was automatically closed by the uptime monitoring system.
"""

            response = TicketResponseModel(
                id=str(uuid4()),
                ticket_id=ticket.id,
                is_internal=False,
                content=comment,
                old_status=ticket.status,
                new_status=TicketStatus.CLOSED.value,
            )
            self.db.add(response)

            # Close the ticket
            ticket.status = TicketStatus.CLOSED.value
            ticket.closed_at = incident.resolved_at
            ticket.resolved_at = incident.resolved_at

            await self.db.flush()

            logger.info(
                f"Closed ticket #{ticket.ticket_number} for resolved incident {incident.id}"
            )

        except Exception as e:
            logger.exception(
                f"Failed to close ticket for incident {incident.id}: {e}"
            )

    async def _add_ticket_comment(
        self,
        ticket_id: str,
        content: str,
    ) -> None:
        """Add an internal comment to a ticket.

        Args:
            ticket_id: Ticket ID.
            content: Comment content.
        """
        try:
            response = TicketResponseModel(
                id=str(uuid4()),
                ticket_id=ticket_id,
                is_internal=True,
                content=content,
            )
            self.db.add(response)
            await self.db.flush()
        except Exception as e:
            logger.warning(f"Failed to add comment to ticket {ticket_id}: {e}")

    # ==========================================================================
    # INCIDENT MANAGEMENT
    # ==========================================================================

    async def get_ongoing_incident(self, monitor_id: str) -> UptimeIncident | None:
        """Get the ongoing incident for a monitor.

        Args:
            monitor_id: Monitor ID.

        Returns:
            Ongoing UptimeIncident or None.
        """
        stmt = (
            select(UptimeIncident)
            .where(
                and_(
                    UptimeIncident.monitor_id == monitor_id,
                    UptimeIncident.status == UptimeIncidentStatus.ONGOING.value,
                )
            )
            .order_by(UptimeIncident.started_at.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_incident(self, incident_id: str) -> UptimeIncident | None:
        """Get an incident by ID.

        Args:
            incident_id: Incident ID.

        Returns:
            UptimeIncident or None.
        """
        stmt = (
            select(UptimeIncident)
            .where(UptimeIncident.id == incident_id)
            .options(
                selectinload(UptimeIncident.monitor),
                selectinload(UptimeIncident.ticket),
                selectinload(UptimeIncident.acknowledged_by),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_incidents(
        self,
        workspace_id: str,
        monitor_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[UptimeIncident], int]:
        """List incidents for a workspace.

        Args:
            workspace_id: Workspace ID.
            monitor_id: Optional filter by monitor.
            status: Optional filter by status.
            limit: Maximum results.
            offset: Skip count.

        Returns:
            Tuple of (incidents, total_count).
        """
        base_stmt = select(UptimeIncident).where(
            UptimeIncident.workspace_id == workspace_id
        )

        if monitor_id:
            base_stmt = base_stmt.where(UptimeIncident.monitor_id == monitor_id)

        if status:
            base_stmt = base_stmt.where(UptimeIncident.status == status)

        # Count total
        count_stmt = select(func.count()).select_from(base_stmt.subquery())
        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar() or 0

        # Get paginated results
        stmt = (
            base_stmt
            .options(
                selectinload(UptimeIncident.monitor),
                selectinload(UptimeIncident.ticket),
            )
            .order_by(UptimeIncident.started_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        incidents = list(result.scalars().all())

        return incidents, total

    async def update_incident(
        self,
        incident_id: str,
        data: UptimeIncidentUpdate,
    ) -> UptimeIncident:
        """Update an incident's post-mortem details.

        Args:
            incident_id: Incident ID.
            data: Update data.

        Returns:
            Updated UptimeIncident.

        Raises:
            IncidentNotFoundError: If incident not found.
        """
        incident = await self.get_incident(incident_id)
        if not incident:
            raise IncidentNotFoundError(f"Incident {incident_id} not found")

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(incident, field, value)

        await self.db.flush()
        await self.db.refresh(incident)
        return incident

    async def resolve_incident(
        self,
        incident_id: str,
        data: UptimeIncidentResolve,
        resolved_by_id: str | None = None,
    ) -> UptimeIncident:
        """Manually resolve an incident.

        Args:
            incident_id: Incident ID.
            data: Resolution data.
            resolved_by_id: Developer ID resolving.

        Returns:
            Resolved UptimeIncident.

        Raises:
            IncidentNotFoundError: If incident not found.
        """
        incident = await self.get_incident(incident_id)
        if not incident:
            raise IncidentNotFoundError(f"Incident {incident_id} not found")

        now = datetime.now(timezone.utc)
        incident.status = UptimeIncidentStatus.RESOLVED.value
        incident.resolved_at = now

        if data.resolution_notes:
            incident.resolution_notes = data.resolution_notes
        if data.root_cause:
            incident.root_cause = data.root_cause

        # Reset monitor state
        monitor = await self.get_monitor(incident.monitor_id)
        if monitor:
            monitor.consecutive_failures = 0
            # Don't change current_status - let the next check determine it

        # Close linked ticket
        await self._close_incident_ticket(incident)

        await self.db.flush()
        await self.db.refresh(incident)
        return incident

    async def acknowledge_incident(
        self,
        incident_id: str,
        acknowledged_by_id: str,
    ) -> UptimeIncident:
        """Acknowledge an incident.

        Args:
            incident_id: Incident ID.
            acknowledged_by_id: Developer ID acknowledging.

        Returns:
            Updated UptimeIncident.

        Raises:
            IncidentNotFoundError: If incident not found.
        """
        incident = await self.get_incident(incident_id)
        if not incident:
            raise IncidentNotFoundError(f"Incident {incident_id} not found")

        incident.acknowledged_at = datetime.now(timezone.utc)
        incident.acknowledged_by_id = acknowledged_by_id

        await self.db.flush()
        await self.db.refresh(incident)
        return incident

    # ==========================================================================
    # CHECK HISTORY
    # ==========================================================================

    async def list_checks(
        self,
        monitor_id: str,
        limit: int = 100,
        offset: int = 0,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
    ) -> tuple[list[UptimeCheck], int]:
        """List check results for a monitor.

        Args:
            monitor_id: Monitor ID.
            limit: Maximum results.
            offset: Skip count.
            start_time: Optional start time filter.
            end_time: Optional end time filter.

        Returns:
            Tuple of (checks, total_count).
        """
        base_stmt = select(UptimeCheck).where(UptimeCheck.monitor_id == monitor_id)

        if start_time:
            base_stmt = base_stmt.where(UptimeCheck.checked_at >= start_time)
        if end_time:
            base_stmt = base_stmt.where(UptimeCheck.checked_at <= end_time)

        # Count total
        count_stmt = select(func.count()).select_from(base_stmt.subquery())
        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar() or 0

        # Get paginated results
        stmt = (
            base_stmt
            .order_by(UptimeCheck.checked_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        checks = list(result.scalars().all())

        return checks, total

    async def cleanup_old_checks(
        self,
        retention_days: int = 30,
    ) -> int:
        """Delete check records older than retention period.

        Args:
            retention_days: Number of days to retain checks.

        Returns:
            Number of deleted records.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)

        # Count before delete
        count_stmt = (
            select(func.count())
            .select_from(UptimeCheck)
            .where(UptimeCheck.checked_at < cutoff)
        )
        count_result = await self.db.execute(count_stmt)
        count = count_result.scalar() or 0

        if count > 0:
            from sqlalchemy import delete
            delete_stmt = delete(UptimeCheck).where(UptimeCheck.checked_at < cutoff)
            await self.db.execute(delete_stmt)
            await self.db.flush()

            logger.info(f"Deleted {count} old uptime checks (older than {retention_days} days)")

        return count

    # ==========================================================================
    # STATISTICS
    # ==========================================================================

    async def get_monitor_stats(
        self,
        monitor_id: str,
    ) -> UptimeMonitorStats | None:
        """Get statistics for a monitor.

        Args:
            monitor_id: Monitor ID.

        Returns:
            UptimeMonitorStats or None.
        """
        monitor = await self.get_monitor(monitor_id)
        if not monitor:
            return None

        now = datetime.now(timezone.utc)
        day_ago = now - timedelta(days=1)
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)

        # Calculate uptime percentages
        uptime_24h = await self._calculate_uptime(monitor_id, day_ago, now)
        uptime_7d = await self._calculate_uptime(monitor_id, week_ago, now)
        uptime_30d = await self._calculate_uptime(monitor_id, month_ago, now)

        # Calculate average response times
        avg_response_24h = await self._calculate_avg_response_time(monitor_id, day_ago, now)
        avg_response_7d = await self._calculate_avg_response_time(monitor_id, week_ago, now)

        # Count checks
        checks_24h = await self._count_checks(monitor_id, day_ago, now)
        checks_7d = await self._count_checks(monitor_id, week_ago, now)

        # Count incidents
        incidents_30d = await self._count_incidents(monitor_id, month_ago, now)

        return UptimeMonitorStats(
            monitor_id=monitor_id,
            monitor_name=monitor.name,
            uptime_percentage_24h=uptime_24h,
            uptime_percentage_7d=uptime_7d,
            uptime_percentage_30d=uptime_30d,
            avg_response_time_ms_24h=avg_response_24h,
            avg_response_time_ms_7d=avg_response_7d,
            total_checks_24h=checks_24h,
            total_checks_7d=checks_7d,
            total_incidents_30d=incidents_30d,
            current_status=monitor.current_status,
            last_check_at=monitor.last_check_at,
        )

    async def get_workspace_stats(
        self,
        workspace_id: str,
    ) -> WorkspaceUptimeStats:
        """Get aggregate statistics for a workspace.

        Args:
            workspace_id: Workspace ID.

        Returns:
            WorkspaceUptimeStats.
        """
        now = datetime.now(timezone.utc)
        day_ago = now - timedelta(days=1)
        week_ago = now - timedelta(days=7)

        # Count monitors by status
        status_stmt = (
            select(UptimeMonitor.current_status, func.count())
            .where(UptimeMonitor.workspace_id == workspace_id)
            .group_by(UptimeMonitor.current_status)
        )
        status_result = await self.db.execute(status_stmt)
        status_counts = dict(status_result.all())

        total_monitors = sum(status_counts.values())
        active_stmt = (
            select(func.count())
            .select_from(UptimeMonitor)
            .where(
                and_(
                    UptimeMonitor.workspace_id == workspace_id,
                    UptimeMonitor.is_active == True,
                )
            )
        )
        active_result = await self.db.execute(active_stmt)
        active_monitors = active_result.scalar() or 0

        # Count ongoing incidents
        ongoing_stmt = (
            select(func.count())
            .select_from(UptimeIncident)
            .where(
                and_(
                    UptimeIncident.workspace_id == workspace_id,
                    UptimeIncident.status == UptimeIncidentStatus.ONGOING.value,
                )
            )
        )
        ongoing_result = await self.db.execute(ongoing_stmt)
        ongoing_incidents = ongoing_result.scalar() or 0

        # Count resolved incidents in last 24h
        resolved_stmt = (
            select(func.count())
            .select_from(UptimeIncident)
            .where(
                and_(
                    UptimeIncident.workspace_id == workspace_id,
                    UptimeIncident.status == UptimeIncidentStatus.RESOLVED.value,
                    UptimeIncident.resolved_at >= day_ago,
                )
            )
        )
        resolved_result = await self.db.execute(resolved_stmt)
        resolved_24h = resolved_result.scalar() or 0

        # Calculate average uptime and response time across all monitors
        avg_uptime_24h = 0.0
        avg_uptime_7d = 0.0
        avg_response_24h = None

        monitors, _ = await self.list_monitors(workspace_id, active_only=True)
        if monitors:
            uptimes_24h = []
            uptimes_7d = []
            responses_24h = []

            for monitor in monitors:
                u24 = await self._calculate_uptime(monitor.id, day_ago, now)
                u7d = await self._calculate_uptime(monitor.id, week_ago, now)
                r24 = await self._calculate_avg_response_time(monitor.id, day_ago, now)

                uptimes_24h.append(u24)
                uptimes_7d.append(u7d)
                if r24 is not None:
                    responses_24h.append(r24)

            avg_uptime_24h = sum(uptimes_24h) / len(uptimes_24h) if uptimes_24h else 0.0
            avg_uptime_7d = sum(uptimes_7d) / len(uptimes_7d) if uptimes_7d else 0.0
            avg_response_24h = sum(responses_24h) / len(responses_24h) if responses_24h else None

        return WorkspaceUptimeStats(
            total_monitors=total_monitors,
            active_monitors=active_monitors,
            monitors_up=status_counts.get(UptimeMonitorStatus.UP.value, 0),
            monitors_down=status_counts.get(UptimeMonitorStatus.DOWN.value, 0),
            monitors_degraded=status_counts.get(UptimeMonitorStatus.DEGRADED.value, 0),
            monitors_paused=status_counts.get(UptimeMonitorStatus.PAUSED.value, 0),
            ongoing_incidents=ongoing_incidents,
            resolved_incidents_24h=resolved_24h,
            avg_uptime_percentage_24h=avg_uptime_24h,
            avg_uptime_percentage_7d=avg_uptime_7d,
            avg_response_time_ms_24h=avg_response_24h,
        )

    async def _calculate_uptime(
        self,
        monitor_id: str,
        start: datetime,
        end: datetime,
    ) -> float:
        """Calculate uptime percentage for a period.

        Args:
            monitor_id: Monitor ID.
            start: Start time.
            end: End time.

        Returns:
            Uptime percentage (0-100).
        """
        total_stmt = (
            select(func.count())
            .select_from(UptimeCheck)
            .where(
                and_(
                    UptimeCheck.monitor_id == monitor_id,
                    UptimeCheck.checked_at >= start,
                    UptimeCheck.checked_at <= end,
                )
            )
        )
        total_result = await self.db.execute(total_stmt)
        total = total_result.scalar() or 0

        if total == 0:
            return 100.0  # No checks = assume up

        up_stmt = (
            select(func.count())
            .select_from(UptimeCheck)
            .where(
                and_(
                    UptimeCheck.monitor_id == monitor_id,
                    UptimeCheck.checked_at >= start,
                    UptimeCheck.checked_at <= end,
                    UptimeCheck.is_up == True,
                )
            )
        )
        up_result = await self.db.execute(up_stmt)
        up = up_result.scalar() or 0

        return round((up / total) * 100, 2)

    async def _calculate_avg_response_time(
        self,
        monitor_id: str,
        start: datetime,
        end: datetime,
    ) -> float | None:
        """Calculate average response time for a period.

        Args:
            monitor_id: Monitor ID.
            start: Start time.
            end: End time.

        Returns:
            Average response time in ms or None.
        """
        stmt = (
            select(func.avg(UptimeCheck.response_time_ms))
            .where(
                and_(
                    UptimeCheck.monitor_id == monitor_id,
                    UptimeCheck.checked_at >= start,
                    UptimeCheck.checked_at <= end,
                    UptimeCheck.is_up == True,
                    UptimeCheck.response_time_ms != None,
                )
            )
        )
        result = await self.db.execute(stmt)
        avg = result.scalar()
        return round(float(avg), 2) if avg else None

    async def _count_checks(
        self,
        monitor_id: str,
        start: datetime,
        end: datetime,
    ) -> int:
        """Count checks in a period.

        Args:
            monitor_id: Monitor ID.
            start: Start time.
            end: End time.

        Returns:
            Check count.
        """
        stmt = (
            select(func.count())
            .select_from(UptimeCheck)
            .where(
                and_(
                    UptimeCheck.monitor_id == monitor_id,
                    UptimeCheck.checked_at >= start,
                    UptimeCheck.checked_at <= end,
                )
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def _count_incidents(
        self,
        monitor_id: str,
        start: datetime,
        end: datetime,
    ) -> int:
        """Count incidents in a period.

        Args:
            monitor_id: Monitor ID.
            start: Start time.
            end: End time.

        Returns:
            Incident count.
        """
        stmt = (
            select(func.count())
            .select_from(UptimeIncident)
            .where(
                and_(
                    UptimeIncident.monitor_id == monitor_id,
                    UptimeIncident.started_at >= start,
                    UptimeIncident.started_at <= end,
                )
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0
