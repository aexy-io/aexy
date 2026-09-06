"""Outreach an agent can do on a person's behalf: email, Slack, SMS.

These used to be hand-written LangGraph tools with no API behind them, which
put them outside the catalogue, the governance gate and the ledger. As
endpoints they are ordinary CRM operations: `mcp.crm` grants them, the default
policy pack holds every send for a person to approve, and the ledger records
what was sent. Sending is queued through Temporal exactly as before.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.crm import check_workspace_permission
from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.crm import CRMActivity
from aexy.models.developer import Developer

router = APIRouter(prefix="/workspaces/{workspace_id}/crm/outreach", tags=["crm"])


class OutreachEmail(BaseModel):
    to: EmailStr
    subject: str = Field(min_length=1, max_length=500)
    body: str = Field(min_length=1)
    record_id: str | None = Field(default=None, description="CRM record to log the email against")


class SlackMessage(BaseModel):
    channel: str = Field(min_length=1, description="Channel name or id, e.g. `#sales` or `C0123`")
    message: str = Field(min_length=1)


class SmsMessage(BaseModel):
    phone_number: str = Field(pattern=r"^\+[1-9]\d{6,14}$", description="E.164, e.g. +14155551234")
    message: str = Field(min_length=1, max_length=1600)


class QueuedResponse(BaseModel):
    status: str = "queued"
    channel: str
    to: str
    detail: str


class EmailHistoryItem(BaseModel):
    activity_type: str
    subject: str
    occurred_at: str
    snippet: str
    record_id: str | None = None


@router.post("/email", response_model=QueuedResponse, status_code=202)
async def send_email(
    workspace_id: str,
    data: OutreachEmail,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Send an email to a contact, from the caller's connected mailbox.

    Queued, not sent inline; the CRM logs it as an activity when it goes. Under
    the default policy pack an agent's call here waits for a person's approval,
    which is the review step a "draft" used to stand in for.
    """
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.temporal.activities.integrations import SendCRMEmailInput
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    try:
        await dispatch(
            "send_crm_email",
            SendCRMEmailInput(
                workspace_id=workspace_id,
                user_id=str(current_user.id),
                to_email=str(data.to),
                subject=data.subject,
                body=data.body,
                record_id=data.record_id,
            ),
            task_queue=TaskQueue.INTEGRATIONS,
        )
    except Exception as exc:  # Temporal unreachable
        raise HTTPException(status_code=503, detail=f"Could not queue the email: {exc}")
    return QueuedResponse(channel="email", to=str(data.to), detail=f"Email to {data.to} queued: {data.subject!r}")


@router.get("/email-history", response_model=list[EmailHistoryItem])
async def get_email_history(
    workspace_id: str,
    email: EmailStr = Query(description="Address to show the conversation with"),
    limit: int = Query(default=10, ge=1, le=50),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Previous email activity with one address, newest first."""
    await check_workspace_permission(workspace_id, current_user, db)
    needle = str(email).lower()
    # The address has to be matched in the database, not after the fact. This
    # read the newest `limit * 5` email activities in the whole workspace and
    # filtered them in Python, so a workspace sending a few hundred mails a day
    # answered "the history with this contact" with an empty list whenever the
    # last exchange fell outside that window — and an agent reading no history
    # opens cold on a live thread.
    #
    # `activity_metadata` is JSONB, so the recipient is not a column to compare.
    # Casting the document to text and matching the address anywhere in it is a
    # coarse prefilter — it also catches an address quoted in the subject — but
    # it is a filter the database applies before ordering and limiting, which is
    # what makes the answer correct. The precise `to` / `from` check below still
    # decides what is returned. `autoescape` matters: an address may contain the
    # `_` that LIKE reads as a wildcard.
    rows = await db.execute(
        select(CRMActivity)
        .where(
            CRMActivity.workspace_id == workspace_id,
            CRMActivity.activity_type.in_(["email.sent", "email.received", "email.replied"]),
            func.lower(cast(CRMActivity.activity_metadata, String)).contains(
                needle, autoescape=True
            ),
        )
        .order_by(CRMActivity.occurred_at.desc())
        .limit(limit * 5)
    )
    out: list[EmailHistoryItem] = []
    for activity in rows.scalars().all():
        meta: dict[str, Any] = activity.activity_metadata or {}
        if needle not in str(meta.get("to", "")).lower() and needle not in str(meta.get("from", "")).lower():
            continue
        out.append(
            EmailHistoryItem(
                activity_type=activity.activity_type,
                subject=str(meta.get("subject") or "No subject"),
                occurred_at=activity.occurred_at.isoformat() if activity.occurred_at else "",
                snippet=(activity.description or "")[:200],
                record_id=str(activity.record_id) if getattr(activity, "record_id", None) else None,
            )
        )
        if len(out) >= limit:
            break
    return out


@router.post("/slack", response_model=QueuedResponse, status_code=202)
async def send_slack_message(
    workspace_id: str,
    data: SlackMessage,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Post a message to a Slack channel through the workspace's Slack integration."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.temporal.activities.integrations import SendSlackMessageInput
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    try:
        await dispatch(
            "send_slack_message",
            SendSlackMessageInput(workspace_id=workspace_id, channel=data.channel, message=data.message),
            task_queue=TaskQueue.INTEGRATIONS,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not queue the Slack message: {exc}")
    return QueuedResponse(channel="slack", to=data.channel, detail=f"Slack message to {data.channel} queued")


@router.post("/sms", response_model=QueuedResponse, status_code=202)
async def send_sms(
    workspace_id: str,
    data: SmsMessage,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Send an SMS through the workspace's SMS provider."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.temporal.activities.integrations import SendSMSInput
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    try:
        await dispatch(
            "send_sms",
            SendSMSInput(workspace_id=workspace_id, to=data.phone_number, body=data.message),
            task_queue=TaskQueue.INTEGRATIONS,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not queue the SMS: {exc}")
    return QueuedResponse(channel="sms", to=data.phone_number, detail=f"SMS to {data.phone_number} queued")
