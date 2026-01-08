"""Celery tasks for Google Gmail and Calendar sync."""

import logging
from datetime import datetime, timezone
from typing import Any

from celery import shared_task

from aexy.processing.tasks import run_async

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
)
def sync_gmail_task(
    self,
    job_id: str,
    workspace_id: str,
    integration_id: str,
    max_messages: int = 500,
) -> dict[str, Any]:
    """Async Gmail sync task.

    Args:
        job_id: The GoogleSyncJob ID
        workspace_id: Workspace ID
        integration_id: Google Integration ID
        max_messages: Maximum messages to sync

    Returns:
        Sync result summary
    """
    logger.info(f"Starting Gmail sync job {job_id} for workspace {workspace_id}")

    try:
        result = run_async(
            _sync_gmail(
                job_id=job_id,
                workspace_id=workspace_id,
                integration_id=integration_id,
                max_messages=max_messages,
            )
        )
        return result
    except Exception as exc:
        logger.error(f"Gmail sync task failed: {exc}")
        # Update job status on failure
        run_async(_update_job_failed(job_id, str(exc)))
        raise self.retry(exc=exc)


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
)
def sync_calendar_task(
    self,
    job_id: str,
    workspace_id: str,
    integration_id: str,
    calendar_ids: list[str] | None = None,
    days_back: int = 30,
    days_forward: int = 90,
) -> dict[str, Any]:
    """Async Calendar sync task.

    Args:
        job_id: The GoogleSyncJob ID
        workspace_id: Workspace ID
        integration_id: Google Integration ID
        calendar_ids: Calendar IDs to sync
        days_back: Days in past to sync
        days_forward: Days in future to sync

    Returns:
        Sync result summary
    """
    logger.info(f"Starting Calendar sync job {job_id} for workspace {workspace_id}")

    try:
        result = run_async(
            _sync_calendar(
                job_id=job_id,
                workspace_id=workspace_id,
                integration_id=integration_id,
                calendar_ids=calendar_ids,
                days_back=days_back,
                days_forward=days_forward,
            )
        )
        return result
    except Exception as exc:
        logger.error(f"Calendar sync task failed: {exc}")
        # Update job status on failure
        run_async(_update_job_failed(job_id, str(exc)))
        raise self.retry(exc=exc)


async def _update_job_progress(
    job_id: str,
    processed: int,
    total: int | None = None,
    message: str | None = None,
) -> None:
    """Update job progress in the database."""
    from sqlalchemy import select

    from aexy.core.database import async_session_maker
    from aexy.models.google_integration import GoogleSyncJob

    async with async_session_maker() as db:
        result = await db.execute(
            select(GoogleSyncJob).where(GoogleSyncJob.id == job_id)
        )
        job = result.scalar_one_or_none()
        if job:
            job.processed_items = processed
            if total is not None:
                job.total_items = total
            if message:
                job.progress_message = message
            await db.commit()


async def _update_job_failed(job_id: str, error: str) -> None:
    """Mark job as failed."""
    from sqlalchemy import select

    from aexy.core.database import async_session_maker
    from aexy.models.google_integration import GoogleSyncJob

    async with async_session_maker() as db:
        result = await db.execute(
            select(GoogleSyncJob).where(GoogleSyncJob.id == job_id)
        )
        job = result.scalar_one_or_none()
        if job:
            job.status = "failed"
            job.error = error
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()


async def _sync_gmail(
    job_id: str,
    workspace_id: str,
    integration_id: str,
    max_messages: int,
) -> dict[str, Any]:
    """Async implementation of Gmail sync with progress updates."""
    from sqlalchemy import select

    from aexy.core.database import async_session_maker
    from aexy.models.google_integration import GoogleIntegration, GoogleSyncJob
    from aexy.services.gmail_sync_service import GmailSyncService

    async with async_session_maker() as db:
        # Get the job
        job_result = await db.execute(
            select(GoogleSyncJob).where(GoogleSyncJob.id == job_id)
        )
        job = job_result.scalar_one_or_none()
        if not job:
            return {"error": "Job not found"}

        # Update job status
        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        job.progress_message = "Starting Gmail sync..."
        await db.commit()

        # Get integration
        int_result = await db.execute(
            select(GoogleIntegration).where(GoogleIntegration.id == integration_id)
        )
        integration = int_result.scalar_one_or_none()
        if not integration:
            job.status = "failed"
            job.error = "Google integration not found"
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()
            return {"error": "Integration not found"}

        # Do the sync
        service = GmailSyncService(db)

        try:
            # Update progress
            job.progress_message = "Fetching emails from Gmail..."
            await db.commit()

            # Sync with progress callback
            result = await _sync_gmail_with_progress(
                service, integration, job, db, max_messages
            )

            # Mark complete
            job.status = "completed"
            job.completed_at = datetime.now(timezone.utc)
            job.result = result
            job.progress_message = f"Synced {result.get('messages_synced', 0)} emails"
            await db.commit()

            return result

        except Exception as e:
            logger.error(f"Gmail sync error: {e}")
            job.status = "failed"
            job.error = str(e)
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()
            raise


async def _sync_gmail_with_progress(
    service,
    integration,
    job,
    db,
    max_messages: int,
) -> dict[str, Any]:
    """Gmail sync with progress updates - uses incremental sync when possible."""
    from aexy.models.google_integration import EmailSyncCursor

    # Get or create the sync cursor to check if we have a history_id
    cursor = await service.get_or_create_sync_cursor(integration)

    messages_synced = 0
    is_incremental = cursor.history_id is not None

    if is_incremental:
        # INCREMENTAL SYNC - only new messages since last sync
        job.progress_message = "Checking for new emails..."
        await db.commit()

        try:
            response = await service._make_gmail_request(
                integration,
                "GET",
                "/users/me/history",
                params={
                    "startHistoryId": cursor.history_id,
                    "historyTypes": ["messageAdded"],
                },
            )

            history = response.get("history", [])
            new_history_id = response.get("historyId")

            # Collect unique message IDs
            message_ids = set()
            for record in history:
                for msg_added in record.get("messagesAdded", []):
                    message_ids.add(msg_added["message"]["id"])

            total_messages = len(message_ids)
            job.total_items = total_messages
            job.progress_message = f"Found {total_messages} new emails to sync..."
            await db.commit()

            # Sync each new message
            for idx, msg_id in enumerate(message_ids):
                try:
                    await service._sync_message(integration, msg_id)
                    messages_synced += 1

                    if messages_synced % 5 == 0 or messages_synced == total_messages:
                        job.processed_items = messages_synced
                        job.progress_message = f"Syncing new emails... ({messages_synced}/{total_messages})"
                        await db.commit()

                except Exception as e:
                    logger.error(f"Failed to sync message {msg_id}: {e}")
                    continue

            # Update history ID for next incremental sync
            if new_history_id:
                cursor.history_id = new_history_id
            cursor.last_sync_at = datetime.now(timezone.utc)
            cursor.last_error = None
            await db.flush()

        except Exception as e:
            error_str = str(e).lower()
            if "historyid" in error_str or "404" in error_str or "invalid" in error_str:
                # History ID expired or invalid - fall back to full sync
                logger.warning("History ID expired, falling back to full sync")
                cursor.history_id = None
                cursor.full_sync_completed = False
                await db.flush()
                is_incremental = False
            else:
                raise

    if not is_incremental:
        # FULL SYNC - first time or history expired
        job.progress_message = "Starting full email sync..."
        await db.commit()

        page_token = cursor.next_page_token  # Resume from where we left off

        while messages_synced < max_messages:
            params = {
                "maxResults": min(100, max_messages - messages_synced),
                "labelIds": ["INBOX"],
            }
            if page_token:
                params["pageToken"] = page_token

            response = await service._make_gmail_request(
                integration, "GET", "/users/me/messages", params=params
            )

            messages = response.get("messages", [])
            if not messages:
                break

            for msg_info in messages:
                try:
                    await service._sync_message(integration, msg_info["id"])
                    messages_synced += 1

                    if messages_synced % 10 == 0:
                        job.processed_items = messages_synced
                        job.progress_message = f"Syncing emails... ({messages_synced} synced)"
                        await db.commit()

                except Exception as e:
                    logger.error(f"Failed to sync message {msg_info['id']}: {e}")
                    continue

                if messages_synced >= max_messages:
                    break

            page_token = response.get("nextPageToken")
            if not page_token:
                cursor.full_sync_completed = True
                cursor.full_sync_completed_at = datetime.now(timezone.utc)
                break

            # Save progress for resume
            cursor.next_page_token = page_token

        # Get history ID for future incremental syncs
        profile_response = await service._make_gmail_request(
            integration, "GET", "/users/me/profile"
        )
        cursor.history_id = profile_response.get("historyId")
        cursor.messages_synced = (cursor.messages_synced or 0) + messages_synced
        cursor.last_sync_at = datetime.now(timezone.utc)
        cursor.last_error = None
        await db.flush()

    # Final progress update
    job.processed_items = messages_synced
    await db.commit()

    return {
        "status": "success",
        "messages_synced": messages_synced,
        "sync_type": "incremental" if is_incremental else "full",
    }


async def _sync_calendar(
    job_id: str,
    workspace_id: str,
    integration_id: str,
    calendar_ids: list[str] | None,
    days_back: int,
    days_forward: int,
) -> dict[str, Any]:
    """Async implementation of Calendar sync with progress updates."""
    from sqlalchemy import select

    from aexy.core.database import async_session_maker
    from aexy.models.google_integration import GoogleIntegration, GoogleSyncJob
    from aexy.services.calendar_sync_service import CalendarSyncService

    async with async_session_maker() as db:
        # Get the job
        job_result = await db.execute(
            select(GoogleSyncJob).where(GoogleSyncJob.id == job_id)
        )
        job = job_result.scalar_one_or_none()
        if not job:
            return {"error": "Job not found"}

        # Update job status
        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        job.progress_message = "Starting Calendar sync..."
        await db.commit()

        # Get integration
        int_result = await db.execute(
            select(GoogleIntegration).where(GoogleIntegration.id == integration_id)
        )
        integration = int_result.scalar_one_or_none()
        if not integration:
            job.status = "failed"
            job.error = "Google integration not found"
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()
            return {"error": "Integration not found"}

        # Do the sync
        service = CalendarSyncService(db)

        try:
            # Update progress
            job.progress_message = "Fetching calendar events..."
            await db.commit()

            # Sync calendars
            result = await service.start_calendar_sync(
                integration,
                calendar_ids=calendar_ids,
                days_back=days_back,
                days_forward=days_forward,
            )

            # Mark complete
            job.status = "completed"
            job.completed_at = datetime.now(timezone.utc)
            job.result = result
            job.processed_items = result.get("events_synced", 0)
            job.progress_message = f"Synced {result.get('events_synced', 0)} events"
            await db.commit()

            return result

        except Exception as e:
            logger.error(f"Calendar sync error: {e}")
            job.status = "failed"
            job.error = str(e)
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()
            raise
