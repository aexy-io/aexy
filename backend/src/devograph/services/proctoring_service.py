"""Service for managing proctoring during assessments."""

import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.llm.gateway import get_llm_gateway
from devograph.llm.prompts import PROCTORING_BEHAVIOR_ANALYSIS_PROMPT
from devograph.models.assessment import (
    ProctoringEvent,
    AssessmentAttempt,
    ProctoringEventSeverity,
)

logger = logging.getLogger(__name__)


# Event type severity mappings
EVENT_SEVERITY = {
    "tab_switch": ProctoringEventSeverity.WARNING,
    "face_not_detected": ProctoringEventSeverity.WARNING,
    "multiple_faces": ProctoringEventSeverity.CRITICAL,
    "face_out_of_frame": ProctoringEventSeverity.WARNING,
    "copy_paste_attempt": ProctoringEventSeverity.INFO,
    "fullscreen_exit": ProctoringEventSeverity.CRITICAL,
    "browser_resize": ProctoringEventSeverity.INFO,
    "right_click": ProctoringEventSeverity.INFO,
    "devtools_open": ProctoringEventSeverity.CRITICAL,
    "window_blur": ProctoringEventSeverity.WARNING,
    "suspicious_behavior": ProctoringEventSeverity.CRITICAL,
}

# Trust score deductions per event type
TRUST_SCORE_DEDUCTIONS = {
    "tab_switch": 5,  # Max -25
    "face_not_detected": 2,  # Per 10 seconds
    "multiple_faces": 15,
    "fullscreen_exit": 10,
    "devtools_open": 20,
    "copy_paste_attempt": 3,
    "window_blur": 3,
    "right_click": 1,
    "browser_resize": 1,
    "face_out_of_frame": 2,
    "suspicious_behavior": 10,
}

# Maximum deductions per event type
MAX_DEDUCTIONS = {
    "tab_switch": 25,
    "face_not_detected": 30,
    "copy_paste_attempt": 15,
    "window_blur": 15,
    "right_click": 5,
    "browser_resize": 5,
    "face_out_of_frame": 20,
}


class ProctoringService:
    """Service for managing proctoring events and trust scores."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.gateway = get_llm_gateway()

    async def log_event(
        self,
        attempt_id: str,
        event_type: str,
        data: dict[str, Any] | None = None,
        screenshot_url: str | None = None,
    ) -> ProctoringEvent:
        """Log a proctoring event.

        Args:
            attempt_id: The assessment attempt ID.
            event_type: Type of event (e.g., 'tab_switch', 'face_not_detected').
            data: Additional event data.
            screenshot_url: URL to screenshot if captured.

        Returns:
            Created proctoring event.
        """
        severity = EVENT_SEVERITY.get(event_type, ProctoringEventSeverity.INFO)

        event = ProctoringEvent(
            attempt_id=attempt_id,
            event_type=event_type,
            severity=severity,
            data=data or {},
            screenshot_url=screenshot_url,
            timestamp=datetime.now(timezone.utc),
        )

        self.db.add(event)
        await self.db.commit()
        await self.db.refresh(event)

        # Update trust score after logging event
        await self.update_trust_score(attempt_id)

        return event

    async def get_events(
        self,
        attempt_id: str,
        event_type: str | None = None,
        severity: ProctoringEventSeverity | None = None,
    ) -> list[ProctoringEvent]:
        """Get proctoring events for an attempt.

        Args:
            attempt_id: The assessment attempt ID.
            event_type: Filter by event type.
            severity: Filter by severity.

        Returns:
            List of proctoring events.
        """
        query = select(ProctoringEvent).where(ProctoringEvent.attempt_id == attempt_id)

        if event_type:
            query = query.where(ProctoringEvent.event_type == event_type)
        if severity:
            query = query.where(ProctoringEvent.severity == severity)

        query = query.order_by(ProctoringEvent.timestamp)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def calculate_trust_score(self, attempt_id: str) -> int:
        """Calculate trust score based on proctoring events.

        Base score is 100. Points are deducted based on event types and frequency.

        Args:
            attempt_id: The assessment attempt ID.

        Returns:
            Trust score (0-100).
        """
        events = await self.get_events(attempt_id)

        # Group events by type and count
        event_counts: dict[str, int] = {}
        for event in events:
            event_type = event.event_type
            event_counts[event_type] = event_counts.get(event_type, 0) + 1

        # Calculate deductions
        total_deduction = 0
        deduction_breakdown = {}

        for event_type, count in event_counts.items():
            deduction_per_event = TRUST_SCORE_DEDUCTIONS.get(event_type, 0)
            max_deduction = MAX_DEDUCTIONS.get(event_type, 100)

            # Calculate total deduction for this event type
            type_deduction = min(count * deduction_per_event, max_deduction)
            total_deduction += type_deduction
            deduction_breakdown[event_type] = type_deduction

        # Calculate final score
        trust_score = max(0, 100 - total_deduction)

        return trust_score

    async def update_trust_score(self, attempt_id: str) -> int:
        """Update the trust score for an attempt.

        Args:
            attempt_id: The assessment attempt ID.

        Returns:
            Updated trust score.
        """
        trust_score = await self.calculate_trust_score(attempt_id)

        # Update the attempt
        attempt_query = select(AssessmentAttempt).where(AssessmentAttempt.id == attempt_id)
        result = await self.db.execute(attempt_query)
        attempt = result.scalar_one_or_none()

        if attempt:
            attempt.trust_score = trust_score
            await self.db.commit()

        return trust_score

    async def get_trust_score_breakdown(self, attempt_id: str) -> dict[str, Any]:
        """Get detailed breakdown of trust score calculation.

        Args:
            attempt_id: The assessment attempt ID.

        Returns:
            Detailed breakdown including events and deductions.
        """
        events = await self.get_events(attempt_id)

        # Group events by type
        event_summary: dict[str, dict[str, Any]] = {}
        for event in events:
            event_type = event.event_type
            if event_type not in event_summary:
                event_summary[event_type] = {
                    "count": 0,
                    "severity": event.severity.value,
                    "timestamps": [],
                }
            event_summary[event_type]["count"] += 1
            event_summary[event_type]["timestamps"].append(
                event.timestamp.isoformat() if event.timestamp else None
            )

        # Calculate deductions
        deductions = {}
        total_deduction = 0

        for event_type, summary in event_summary.items():
            count = summary["count"]
            deduction_per_event = TRUST_SCORE_DEDUCTIONS.get(event_type, 0)
            max_deduction = MAX_DEDUCTIONS.get(event_type, 100)

            type_deduction = min(count * deduction_per_event, max_deduction)
            deductions[event_type] = {
                "count": count,
                "deduction_per_event": deduction_per_event,
                "max_deduction": max_deduction,
                "actual_deduction": type_deduction,
            }
            total_deduction += type_deduction

        trust_score = max(0, 100 - total_deduction)

        # Determine trust level
        if trust_score >= 90:
            trust_level = "excellent"
        elif trust_score >= 70:
            trust_level = "good"
        elif trust_score >= 50:
            trust_level = "fair"
        else:
            trust_level = "poor"

        return {
            "trust_score": trust_score,
            "trust_level": trust_level,
            "base_score": 100,
            "total_deduction": total_deduction,
            "event_summary": event_summary,
            "deductions": deductions,
            "total_events": len(events),
            "critical_events": sum(
                1 for e in events if e.severity == ProctoringEventSeverity.CRITICAL
            ),
        }

    async def analyze_behavior(self, attempt_id: str) -> dict[str, Any] | None:
        """Analyze proctoring events using AI to detect patterns.

        Args:
            attempt_id: The assessment attempt ID.

        Returns:
            AI analysis of behavior patterns or None if unavailable.
        """
        if not self.gateway:
            return None

        events = await self.get_events(attempt_id)

        if not events:
            return {
                "trust_score": 100,
                "trust_level": "high",
                "integrity_assessment": {"concerns": [], "likely_explanations": [], "red_flags": []},
                "patterns_detected": [],
                "technical_issues_detected": [],
                "recommendation": {
                    "action": "proceed",
                    "reason": "No proctoring events recorded",
                },
                "summary": "No suspicious activity detected during the assessment.",
            }

        # Get attempt for duration
        attempt_query = select(AssessmentAttempt).where(AssessmentAttempt.id == attempt_id)
        result = await self.db.execute(attempt_query)
        attempt = result.scalar_one_or_none()

        duration = 0
        if attempt and attempt.started_at:
            end_time = attempt.completed_at or datetime.now(timezone.utc)
            duration = int((end_time - attempt.started_at).total_seconds() / 60)

        # Format events for AI
        events_data = []
        for event in events:
            events_data.append({
                "type": event.event_type,
                "severity": event.severity.value,
                "timestamp": event.timestamp.isoformat() if event.timestamp else None,
                "data": event.data,
            })

        prompt = PROCTORING_BEHAVIOR_ANALYSIS_PROMPT.format(
            events=json.dumps(events_data, indent=2),
            duration=duration,
            event_count=len(events),
        )

        try:
            provider = self.gateway.provider
            messages = [
                {"role": "user", "content": prompt},
            ]

            if hasattr(provider, 'client'):
                response = await provider.client.messages.create(
                    model=provider.model_name,
                    max_tokens=2048,
                    messages=messages,
                )
                response_text = response.content[0].text
            elif hasattr(provider, '_call_api'):
                response_text = await provider._call_api(messages)
            else:
                return None

            try:
                return json.loads(response_text)
            except json.JSONDecodeError:
                start = response_text.find('{')
                end = response_text.rfind('}') + 1
                if start >= 0 and end > start:
                    return json.loads(response_text[start:end])
                return None

        except Exception as e:
            logger.error(f"Behavior analysis failed: {e}")
            return None

    async def check_violations(
        self,
        attempt_id: str,
        threshold: int = 50,
    ) -> dict[str, Any]:
        """Check if an attempt has significant violations.

        Args:
            attempt_id: The assessment attempt ID.
            threshold: Trust score threshold for flagging.

        Returns:
            Violation check result.
        """
        trust_score = await self.calculate_trust_score(attempt_id)
        events = await self.get_events(attempt_id)

        # Count critical events
        critical_events = [
            e for e in events if e.severity == ProctoringEventSeverity.CRITICAL
        ]

        # Determine if flagged
        is_flagged = trust_score < threshold or len(critical_events) >= 3

        # Determine action
        if trust_score < 30 or len(critical_events) >= 5:
            recommended_action = "manual_review_required"
        elif trust_score < 50 or len(critical_events) >= 3:
            recommended_action = "flag_for_review"
        elif trust_score < 70:
            recommended_action = "minor_concerns"
        else:
            recommended_action = "proceed"

        return {
            "trust_score": trust_score,
            "is_flagged": is_flagged,
            "critical_event_count": len(critical_events),
            "total_event_count": len(events),
            "recommended_action": recommended_action,
            "violations": [
                {
                    "type": e.event_type,
                    "severity": e.severity.value,
                    "timestamp": e.timestamp.isoformat() if e.timestamp else None,
                }
                for e in critical_events
            ],
        }

    async def get_session_summary(self, attempt_id: str) -> dict[str, Any]:
        """Get a summary of the proctoring session.

        Args:
            attempt_id: The assessment attempt ID.

        Returns:
            Session summary with all relevant information.
        """
        # Get trust score breakdown
        breakdown = await self.get_trust_score_breakdown(attempt_id)

        # Get violations check
        violations = await self.check_violations(attempt_id)

        # Get AI analysis if available
        ai_analysis = await self.analyze_behavior(attempt_id)

        # Get attempt info
        attempt_query = select(AssessmentAttempt).where(AssessmentAttempt.id == attempt_id)
        result = await self.db.execute(attempt_query)
        attempt = result.scalar_one_or_none()

        session_info = {}
        if attempt:
            session_info = {
                "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
                "completed_at": attempt.completed_at.isoformat() if attempt.completed_at else None,
                "status": attempt.status.value if attempt.status else None,
            }

        return {
            "session": session_info,
            "trust_score": breakdown["trust_score"],
            "trust_level": breakdown["trust_level"],
            "event_summary": breakdown["event_summary"],
            "deductions": breakdown["deductions"],
            "violations": violations,
            "ai_analysis": ai_analysis,
        }
