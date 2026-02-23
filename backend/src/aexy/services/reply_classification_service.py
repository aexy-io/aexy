"""Reply classification service -- LLM-powered reply categorization with auto-actions."""

import json
import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select, update, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.gtm_outreach import (
    OutreachSequence,
    OutreachEnrollment,
    OutreachStepExecution,
    EnrollmentStatus,
)

logger = logging.getLogger(__name__)

# Classification categories
REPLY_CATEGORIES = {
    "interested": {
        "description": "Prospect shows interest, wants to learn more or schedule a call",
        "action": "route_to_sales",
        "stop_sequence": True,
    },
    "ooo": {
        "description": "Out of office / auto-reply, prospect is away",
        "action": "pause_and_retry",
        "stop_sequence": False,
    },
    "not_interested": {
        "description": "Prospect declines, not a fit, bad timing",
        "action": "mark_not_interested",
        "stop_sequence": True,
    },
    "wrong_person": {
        "description": "Wrong contact, not the right person for this",
        "action": "flag_wrong_contact",
        "stop_sequence": True,
    },
    "unsubscribe": {
        "description": "Prospect wants to unsubscribe / stop receiving emails",
        "action": "unsubscribe",
        "stop_sequence": True,
    },
    "question": {
        "description": "Prospect has questions but hasn't committed either way",
        "action": "flag_for_review",
        "stop_sequence": False,
    },
    "referral": {
        "description": "Prospect refers to someone else at their company",
        "action": "flag_referral",
        "stop_sequence": True,
    },
}

# LLM classification system prompt
CLASSIFICATION_SYSTEM_PROMPT = """You are an email reply classifier for sales outreach sequences. Your job is to classify prospect replies into exactly one category.

Categories:
{categories}

Respond with ONLY valid JSON in this exact format:
{{"category": "<category_key>", "confidence": <0.0-1.0>, "reasoning": "<brief explanation>"}}

Rules:
- confidence should be between 0.0 and 1.0
- Use "interested" for replies showing genuine buying interest, wanting demos, calls, or more info
- Use "ooo" for auto-replies, vacation notices, or out-of-office messages
- Use "not_interested" for polite or firm declines, bad timing, not relevant
- Use "wrong_person" when the person says they're not the right contact
- Use "unsubscribe" when someone explicitly asks to be removed from emails
- Use "question" when they ask questions without clear interest or disinterest
- Use "referral" when they point to someone else (e.g., "talk to John instead")
"""

CLASSIFICATION_USER_PROMPT = """Classify this email reply:

---
{reply_text}
---

{context}"""


class ReplyClassificationService:
    """LLM-powered reply classification with auto-actions for outreach sequences."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # CLASSIFY REPLY
    # =========================================================================

    async def classify_reply(
        self,
        workspace_id: str,
        enrollment_id: str,
        reply_text: str,
        reply_from: str | None = None,
    ) -> dict:
        """Classify an email reply using LLM and optionally execute auto-actions.

        Args:
            workspace_id: Workspace ID.
            enrollment_id: Enrollment being replied to.
            reply_text: The reply email text.
            reply_from: Optional sender email address.

        Returns:
            Dict with category, confidence, reasoning, action_taken, auto_actioned.
        """
        # Build context from enrollment
        context_parts = []
        enrollment = (await self.db.execute(
            select(OutreachEnrollment).where(
                and_(
                    OutreachEnrollment.id == enrollment_id,
                    OutreachEnrollment.workspace_id == workspace_id,
                )
            )
        )).scalar_one_or_none()

        if enrollment:
            context_parts.append(f"Contact: {enrollment.contact_name or enrollment.email}")
            # Get sequence name
            sequence = (await self.db.execute(
                select(OutreachSequence).where(OutreachSequence.id == enrollment.sequence_id)
            )).scalar_one_or_none()
            if sequence:
                context_parts.append(f"Sequence: {sequence.name}")
            context_parts.append(f"Step: {enrollment.current_step_index}")

        if reply_from:
            context_parts.append(f"Reply from: {reply_from}")

        context = "\n".join(context_parts) if context_parts else "No additional context."

        # Build prompts
        categories_text = "\n".join(
            f"- {key}: {info['description']}"
            for key, info in REPLY_CATEGORIES.items()
        )
        system_prompt = CLASSIFICATION_SYSTEM_PROMPT.format(categories=categories_text)
        user_prompt = CLASSIFICATION_USER_PROMPT.format(
            reply_text=reply_text[:2000],  # Truncate very long replies
            context=context,
        )

        # Call LLM
        category = "question"
        confidence = 0.3
        reasoning = "Failed to classify"

        try:
            from aexy.llm.gateway import get_llm_gateway

            gateway = get_llm_gateway()
            if gateway:
                response_text, _total, _input, _output = await gateway.call_llm(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    tokens_estimate=500,
                    workspace_id=workspace_id,
                )

                # Parse JSON from response
                parsed = self._parse_llm_response(response_text)
                category = parsed["category"]
                confidence = parsed["confidence"]
                reasoning = parsed["reasoning"]
            else:
                logger.warning("LLM gateway not available, defaulting to 'question'")
                reasoning = "LLM gateway not available"

        except Exception as e:
            logger.exception(f"LLM classification failed for enrollment {enrollment_id}")
            reasoning = f"LLM error: {str(e)[:200]}"

        # Execute auto-action if confidence is high enough
        action_taken = None
        auto_actioned = False

        if confidence >= 0.7 and enrollment:
            try:
                action_result = await self.execute_action(workspace_id, enrollment_id, category)
                action_taken = action_result.get("action")
                auto_actioned = True
            except Exception as e:
                logger.exception(f"Auto-action failed for enrollment {enrollment_id}")
                action_taken = f"failed: {str(e)[:200]}"

        return {
            "category": category,
            "confidence": confidence,
            "reasoning": reasoning,
            "action_taken": action_taken,
            "auto_actioned": auto_actioned,
        }

    def _parse_llm_response(self, response_text: str) -> dict:
        """Parse the LLM JSON response, handling errors gracefully."""
        try:
            # Try to extract JSON from the response
            text = response_text.strip()

            # Handle markdown code blocks
            if text.startswith("```"):
                lines = text.split("\n")
                # Remove first and last lines (```json and ```)
                json_lines = []
                in_block = False
                for line in lines:
                    if line.strip().startswith("```") and not in_block:
                        in_block = True
                        continue
                    elif line.strip() == "```" and in_block:
                        break
                    elif in_block:
                        json_lines.append(line)
                text = "\n".join(json_lines)

            parsed = json.loads(text)

            category = parsed.get("category", "question")
            if category not in REPLY_CATEGORIES:
                category = "question"

            confidence = float(parsed.get("confidence", 0.5))
            confidence = max(0.0, min(1.0, confidence))

            reasoning = parsed.get("reasoning", "No reasoning provided")

            return {
                "category": category,
                "confidence": confidence,
                "reasoning": reasoning,
            }

        except (json.JSONDecodeError, ValueError, TypeError) as e:
            logger.warning(f"Failed to parse LLM response: {e}")
            return {
                "category": "question",
                "confidence": 0.3,
                "reasoning": f"Parse error: {str(e)[:100]}",
            }

    # =========================================================================
    # EXECUTE ACTION
    # =========================================================================

    async def execute_action(
        self,
        workspace_id: str,
        enrollment_id: str,
        category: str,
    ) -> dict:
        """Execute the auto-action for a classification category.

        Args:
            workspace_id: Workspace ID.
            enrollment_id: Enrollment ID.
            category: Classification category key.

        Returns:
            Dict with action name and details.
        """
        if category not in REPLY_CATEGORIES:
            return {"action": "none", "reason": f"Unknown category: {category}"}

        cat_config = REPLY_CATEGORIES[category]
        action = cat_config["action"]

        enrollment = (await self.db.execute(
            select(OutreachEnrollment).where(
                and_(
                    OutreachEnrollment.id == enrollment_id,
                    OutreachEnrollment.workspace_id == workspace_id,
                )
            )
        )).scalar_one_or_none()

        if not enrollment:
            return {"action": action, "reason": "Enrollment not found"}

        now = datetime.now(timezone.utc)

        if action == "route_to_sales":
            return await self._action_route_to_sales(enrollment, now, workspace_id)

        elif action == "pause_and_retry":
            return await self._action_pause_and_retry(enrollment, now)

        elif action == "mark_not_interested":
            return await self._action_exit_enrollment(
                enrollment, now, workspace_id, "not_interested",
            )

        elif action == "flag_wrong_contact":
            return await self._action_exit_enrollment(
                enrollment, now, workspace_id, "wrong_person",
            )

        elif action == "unsubscribe":
            return await self._action_unsubscribe(enrollment, now, workspace_id)

        elif action == "flag_for_review":
            return await self._action_flag_for_review(enrollment, now, category)

        elif action == "flag_referral":
            return await self._action_flag_referral(enrollment, now, workspace_id)

        return {"action": action, "reason": "No handler for action"}

    async def _action_route_to_sales(
        self, enrollment: OutreachEnrollment, now: datetime, workspace_id: str,
    ) -> dict:
        """Route to sales: mark as replied, update step execution, stop all sequences."""
        enrollment.status = EnrollmentStatus.REPLIED.value
        enrollment.completed_at = now
        enrollment.exit_reason = "replied_interested"

        # Update the latest step execution with replied_at
        latest_exec = (await self.db.execute(
            select(OutreachStepExecution)
            .where(OutreachStepExecution.enrollment_id == enrollment.id)
            .order_by(OutreachStepExecution.step_index.desc())
            .limit(1)
        )).scalar_one_or_none()

        if latest_exec:
            latest_exec.replied_at = now

        # Stop all other sequences for this contact
        stopped = await self.stop_all_sequences_for_contact(workspace_id, enrollment.email)

        # Signal Temporal workflow to exit
        await self._signal_exit_sequence(enrollment)

        logger.info(
            f"Routed enrollment {enrollment.id} to sales, "
            f"stopped {stopped} other enrollments for {enrollment.email}"
        )

        return {
            "action": "route_to_sales",
            "enrollment_id": enrollment.id,
            "other_sequences_stopped": stopped,
        }

    async def _action_pause_and_retry(
        self, enrollment: OutreachEnrollment, now: datetime,
    ) -> dict:
        """Pause and retry: keep active but delay next step by 3 days."""
        retry_at = now + timedelta(days=3)
        enrollment.next_step_at = retry_at

        logger.info(
            f"OOO pause for enrollment {enrollment.id}, retry at {retry_at.isoformat()}"
        )

        return {
            "action": "pause_and_retry",
            "enrollment_id": enrollment.id,
            "retry_at": retry_at.isoformat(),
        }

    async def _action_exit_enrollment(
        self,
        enrollment: OutreachEnrollment,
        now: datetime,
        workspace_id: str,
        exit_reason: str,
    ) -> dict:
        """Exit enrollment with a given reason."""
        enrollment.status = EnrollmentStatus.EXITED.value
        enrollment.exit_reason = exit_reason
        enrollment.completed_at = now

        # Signal Temporal workflow to exit
        await self._signal_exit_sequence(enrollment)

        logger.info(f"Exited enrollment {enrollment.id} with reason: {exit_reason}")

        return {
            "action": f"exit_{exit_reason}",
            "enrollment_id": enrollment.id,
            "exit_reason": exit_reason,
        }

    async def _action_unsubscribe(
        self, enrollment: OutreachEnrollment, now: datetime, workspace_id: str,
    ) -> dict:
        """Unsubscribe: add to suppression list, then exit enrollment."""
        from aexy.services.gtm_compliance_service import GTMComplianceService

        compliance = GTMComplianceService(self.db)
        await compliance.process_unsubscribe(workspace_id, enrollment.email)

        enrollment.status = EnrollmentStatus.UNSUBSCRIBED.value
        enrollment.exit_reason = "unsubscribed"
        enrollment.completed_at = now

        # Stop all sequences for this contact
        stopped = await self.stop_all_sequences_for_contact(workspace_id, enrollment.email)

        # Signal Temporal workflow to exit
        await self._signal_exit_sequence(enrollment)

        logger.info(
            f"Unsubscribed {enrollment.email} via enrollment {enrollment.id}, "
            f"stopped {stopped} other enrollments"
        )

        return {
            "action": "unsubscribe",
            "enrollment_id": enrollment.id,
            "email": enrollment.email,
            "other_sequences_stopped": stopped,
        }

    async def _action_flag_for_review(
        self, enrollment: OutreachEnrollment, now: datetime, category: str,
    ) -> dict:
        """Flag for review: store classification in extra_data, no auto-action."""
        # Update the latest step execution with classification info
        latest_exec = (await self.db.execute(
            select(OutreachStepExecution)
            .where(OutreachStepExecution.enrollment_id == enrollment.id)
            .order_by(OutreachStepExecution.step_index.desc())
            .limit(1)
        )).scalar_one_or_none()

        if latest_exec:
            extra = dict(latest_exec.extra_data or {})
            extra["reply_classification"] = {
                "category": category,
                "flagged_at": now.isoformat(),
                "needs_review": True,
            }
            latest_exec.extra_data = extra

        logger.info(f"Flagged enrollment {enrollment.id} for review (category: {category})")

        return {
            "action": "flag_for_review",
            "enrollment_id": enrollment.id,
            "category": category,
        }

    async def _action_flag_referral(
        self, enrollment: OutreachEnrollment, now: datetime, workspace_id: str,
    ) -> dict:
        """Flag referral: exit enrollment and store referral info."""
        enrollment.status = EnrollmentStatus.EXITED.value
        enrollment.exit_reason = "referral"
        enrollment.completed_at = now

        extra = dict(enrollment.extra_data or {})
        extra["referral"] = {
            "flagged_at": now.isoformat(),
            "original_contact": enrollment.email,
            "needs_followup": True,
        }
        enrollment.extra_data = extra

        # Signal Temporal workflow to exit
        await self._signal_exit_sequence(enrollment)

        logger.info(f"Flagged referral for enrollment {enrollment.id}")

        return {
            "action": "flag_referral",
            "enrollment_id": enrollment.id,
        }

    async def _signal_exit_sequence(self, enrollment: OutreachEnrollment) -> None:
        """Signal the Temporal workflow to exit the sequence, if workflow ID exists."""
        if not enrollment.temporal_workflow_id:
            return

        try:
            from aexy.temporal.client import get_temporal_client

            client = await get_temporal_client()
            handle = client.get_workflow_handle(enrollment.temporal_workflow_id)
            await handle.signal("exit_sequence")
            logger.info(
                f"Signaled exit_sequence for workflow {enrollment.temporal_workflow_id}"
            )
        except Exception:
            logger.exception(
                f"Failed to signal Temporal workflow {enrollment.temporal_workflow_id}"
            )

    # =========================================================================
    # STOP ALL SEQUENCES FOR CONTACT
    # =========================================================================

    async def stop_all_sequences_for_contact(
        self, workspace_id: str, email: str,
    ) -> int:
        """Stop ALL active enrollments for an email across all sequences.

        Args:
            workspace_id: Workspace ID.
            email: Contact email address.

        Returns:
            Number of enrollments stopped.
        """
        active_enrollments = (await self.db.execute(
            select(OutreachEnrollment).where(
                and_(
                    OutreachEnrollment.workspace_id == workspace_id,
                    OutreachEnrollment.email == email,
                    OutreachEnrollment.status.in_([
                        EnrollmentStatus.ACTIVE.value,
                        EnrollmentStatus.PAUSED.value,
                    ]),
                )
            )
        )).scalars().all()

        now = datetime.now(timezone.utc)
        stopped = 0

        for enr in active_enrollments:
            enr.status = EnrollmentStatus.EXITED.value
            enr.exit_reason = "contact_replied_elsewhere"
            enr.completed_at = now
            stopped += 1

            # Signal each Temporal workflow
            await self._signal_exit_sequence(enr)

        if stopped:
            logger.info(f"Stopped {stopped} enrollments for {email} in workspace {workspace_id}")

        return stopped

    # =========================================================================
    # CLASSIFICATION STATS
    # =========================================================================

    async def get_classification_stats(
        self, workspace_id: str, days: int = 30,
    ) -> dict:
        """Get aggregate classification statistics for a workspace.

        Args:
            workspace_id: Workspace ID.
            days: Number of days to look back.

        Returns:
            Dict with category counts, auto-action rate, avg confidence.
        """
        since = datetime.now(timezone.utc) - timedelta(days=days)

        # Get all step executions with reply classifications in extra_data
        # Also count enrollments by exit_reason as a proxy for classifications
        results = (await self.db.execute(
            select(
                OutreachEnrollment.exit_reason,
                func.count(OutreachEnrollment.id).label("count"),
            )
            .where(
                and_(
                    OutreachEnrollment.workspace_id == workspace_id,
                    OutreachEnrollment.completed_at >= since,
                    OutreachEnrollment.exit_reason.isnot(None),
                )
            )
            .group_by(OutreachEnrollment.exit_reason)
        )).all()

        # Map exit reasons back to categories
        exit_to_category = {
            "replied_interested": "interested",
            "not_interested": "not_interested",
            "wrong_person": "wrong_person",
            "unsubscribed": "unsubscribe",
            "referral": "referral",
            "contact_replied_elsewhere": "interested",  # stopped by another reply
        }

        category_counts: dict[str, int] = {key: 0 for key in REPLY_CATEGORIES}
        total = 0
        for row in results:
            reason = row[0]
            count = row[1]
            cat = exit_to_category.get(reason)
            if cat and cat in category_counts:
                category_counts[cat] += count
                total += count

        # Get count of flagged-for-review from step executions
        review_count = (await self.db.execute(
            select(func.count(OutreachStepExecution.id))
            .where(
                and_(
                    OutreachStepExecution.workspace_id == workspace_id,
                    OutreachStepExecution.created_at >= since,
                    OutreachStepExecution.extra_data["reply_classification"].isnot(None),
                )
            )
        )).scalar() or 0

        category_counts["question"] += review_count
        total += review_count

        # Calculate auto-action rate (categories with stop_sequence=True are auto-actioned)
        auto_actioned = sum(
            category_counts[cat]
            for cat, config in REPLY_CATEGORIES.items()
            if config["stop_sequence"]
        )
        auto_action_rate = (auto_actioned / total * 100) if total > 0 else 0.0

        return {
            "period_days": days,
            "total_classified": total,
            "category_counts": category_counts,
            "auto_actioned": auto_actioned,
            "auto_action_rate": round(auto_action_rate, 1),
        }
