"""Service for AI Feedback CRUD and Benchmarking aggregation."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import func, literal_column, select, text, union_all
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.agent import CRMAgentExecution
from aexy.models.ai_feedback import AIFeedback
from aexy.models.ask import AskConversation, AskMessage
from aexy.models.crm import CRMAutomationRun
from aexy.schemas.ai_feedback import (
    AIBenchmarkingResponse,
    AIFeedbackCreate,
    AgentMetrics,
    AskAIMetrics,
    AutomationMetrics,
    FeedbackSummary,
    VolumeSeries,
)

logger = logging.getLogger(__name__)


class AIFeedbackService:
    """Feedback CRUD and benchmarking aggregation for AI features."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Feedback CRUD ─────────────────────────────────────────────────

    async def submit_feedback(
        self,
        workspace_id: str,
        developer_id: str,
        data: AIFeedbackCreate,
    ) -> AIFeedback:
        """Upsert feedback — insert or update on (entity_type, entity_id, developer_id)."""
        tags_str = ",".join(data.tags) if data.tags else None

        stmt = pg_insert(AIFeedback).values(
            id=str(uuid4()),
            entity_type=data.entity_type,
            entity_id=data.entity_id,
            workspace_id=workspace_id,
            developer_id=developer_id,
            rating=data.rating,
            comment=data.comment,
            tags=tags_str,
        )
        stmt = stmt.on_conflict_do_update(
            constraint="uq_ai_feedback_entity_developer",
            set_={
                "rating": stmt.excluded.rating,
                "comment": stmt.excluded.comment,
                "tags": stmt.excluded.tags,
                "updated_at": func.now(),
            },
        )
        await self.db.execute(stmt)
        await self.db.flush()

        # Fetch the upserted row
        result = await self.db.execute(
            select(AIFeedback).where(
                AIFeedback.entity_type == data.entity_type,
                AIFeedback.entity_id == data.entity_id,
                AIFeedback.developer_id == developer_id,
            )
        )
        return result.scalar_one()

    async def get_feedback(
        self,
        entity_type: str,
        entity_id: str,
        developer_id: str,
    ) -> AIFeedback | None:
        """Get feedback for a specific entity by a specific user."""
        result = await self.db.execute(
            select(AIFeedback).where(
                AIFeedback.entity_type == entity_type,
                AIFeedback.entity_id == entity_id,
                AIFeedback.developer_id == developer_id,
            )
        )
        return result.scalar_one_or_none()

    async def delete_feedback(self, feedback_id: str, developer_id: str) -> bool:
        """Delete feedback by ID (only the owner can delete)."""
        result = await self.db.execute(
            select(AIFeedback).where(
                AIFeedback.id == feedback_id,
                AIFeedback.developer_id == developer_id,
            )
        )
        fb = result.scalar_one_or_none()
        if not fb:
            return False
        await self.db.delete(fb)
        await self.db.flush()
        return True

    async def list_feedback(
        self,
        workspace_id: str | None = None,
        entity_type: str | None = None,
        page: int = 1,
        limit: int = 50,
    ) -> dict:
        """List feedback with pagination (for admin review)."""
        conditions = []
        if workspace_id:
            conditions.append(AIFeedback.workspace_id == workspace_id)
        if entity_type:
            conditions.append(AIFeedback.entity_type == entity_type)

        # Count
        count_stmt = select(func.count()).select_from(AIFeedback)
        if conditions:
            count_stmt = count_stmt.where(*conditions)
        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar() or 0

        # Items
        stmt = select(AIFeedback)
        if conditions:
            stmt = stmt.where(*conditions)
        stmt = stmt.order_by(AIFeedback.created_at.desc())
        stmt = stmt.offset((page - 1) * limit).limit(limit)
        result = await self.db.execute(stmt)
        items = result.scalars().all()

        return {
            "items": items,
            "total": total,
            "page": page,
            "limit": limit,
        }

    # ── Benchmarking Aggregation ──────────────────────────────────────

    async def get_benchmarking(
        self, days: int = 30, group_by: str = "day"
    ) -> AIBenchmarkingResponse:
        """Get full benchmarking dashboard data."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        ask_ai, agents, automations, feedback, volume_trend = await asyncio.gather(
            self._ask_ai_metrics(cutoff, group_by),
            self._agent_metrics(cutoff),
            self._automation_metrics(cutoff),
            self._feedback_summary(cutoff),
            self._volume_trend(cutoff, group_by),
        )

        return AIBenchmarkingResponse(
            ask_ai=ask_ai,
            agents=agents,
            automations=automations,
            feedback=feedback,
            volume_trend=volume_trend,
        )

    async def _ask_ai_metrics(self, cutoff: datetime, group_by: str) -> AskAIMetrics:
        """Aggregate Ask AI metrics."""
        # Total conversations
        conv_count = await self.db.execute(
            select(func.count()).select_from(AskConversation).where(
                AskConversation.created_at >= cutoff
            )
        )
        total_conversations = conv_count.scalar() or 0

        # Messages stats (use raw SQL for JSONB token extraction)
        msg_stmt = text("""
            SELECT
                COUNT(*) AS total,
                AVG(latency_ms) AS avg_latency,
                SUM(COALESCE((token_usage->>'input_tokens')::integer, 0)) AS input_tokens,
                SUM(COALESCE((token_usage->>'output_tokens')::integer, 0)) AS output_tokens
            FROM ask_messages
            WHERE role = 'assistant' AND created_at >= :cutoff
        """)
        msg_result = await self.db.execute(msg_stmt, {"cutoff": cutoff})
        msg_row = msg_result.one()

        # p95 latency
        p95_stmt = select(
            func.percentile_cont(0.95).within_group(AskMessage.latency_ms)
        ).where(
            AskMessage.role == "assistant",
            AskMessage.created_at >= cutoff,
            AskMessage.latency_ms.isnot(None),
        )
        try:
            p95_result = await self.db.execute(p95_stmt)
            p95_latency = p95_result.scalar()
        except Exception:
            p95_latency = None

        # Token usage time series
        token_series_stmt = text(f"""
            SELECT
                date_trunc(:group_by, created_at) AS date,
                SUM(COALESCE((token_usage->>'input_tokens')::integer, 0)) AS input_tokens,
                SUM(COALESCE((token_usage->>'output_tokens')::integer, 0)) AS output_tokens
            FROM ask_messages
            WHERE role = 'assistant' AND created_at >= :cutoff
            GROUP BY date_trunc(:group_by, created_at)
            ORDER BY date_trunc(:group_by, created_at)
        """)
        token_series = await self.db.execute(
            token_series_stmt, {"cutoff": cutoff, "group_by": group_by}
        )
        token_usage_series = [
            {
                "date": str(row.date),
                "input_tokens": int(row.input_tokens or 0),
                "output_tokens": int(row.output_tokens or 0),
            }
            for row in token_series.all()
        ]

        # Tool usage (top tools by count)
        tool_usage: list[dict] = []
        try:
            tool_stmt = text("""
                SELECT
                    tc->>'tool_name' AS tool_name,
                    COUNT(*) AS call_count,
                    COUNT(*) FILTER (WHERE tc->>'status' = 'success') AS success_count
                FROM ask_messages,
                     jsonb_array_elements(tool_calls) AS tc
                WHERE role = 'assistant'
                  AND created_at >= :cutoff
                  AND tool_calls IS NOT NULL
                GROUP BY tc->>'tool_name'
                ORDER BY call_count DESC
                LIMIT 10
            """)
            tool_result = await self.db.execute(tool_stmt, {"cutoff": cutoff})
            tool_usage = [
                {
                    "tool_name": row.tool_name,
                    "call_count": row.call_count,
                    "success_count": row.success_count,
                    "success_rate": round(row.success_count / row.call_count * 100, 1) if row.call_count > 0 else 0,
                }
                for row in tool_result.all()
            ]
        except Exception as e:
            logger.warning(f"Tool usage query failed: {e}")

        return AskAIMetrics(
            total_conversations=total_conversations,
            total_messages=int(msg_row.total or 0),
            avg_latency_ms=float(msg_row.avg_latency) if msg_row.avg_latency else None,
            p95_latency_ms=float(p95_latency) if p95_latency else None,
            total_input_tokens=int(msg_row.input_tokens or 0),
            total_output_tokens=int(msg_row.output_tokens or 0),
            token_usage_series=token_usage_series,
            tool_usage=tool_usage,
        )

    async def _agent_metrics(self, cutoff: datetime) -> AgentMetrics:
        """Aggregate AI agent execution metrics."""
        stmt = select(
            func.count().label("total"),
            func.count().filter(CRMAgentExecution.status == "completed").label("completed"),
            func.count().filter(CRMAgentExecution.status == "failed").label("failed"),
            func.avg(CRMAgentExecution.duration_ms).label("avg_duration"),
        ).where(CRMAgentExecution.created_at >= cutoff)

        result = await self.db.execute(stmt)
        row = result.one()

        total = int(row.total or 0)
        completed = int(row.completed or 0)

        # Top agents by execution count
        from aexy.models.agent import CRMAgent

        top_stmt = (
            select(
                CRMAgent.name,
                func.count().label("executions"),
                func.count().filter(CRMAgentExecution.status == "completed").label("successes"),
                func.avg(CRMAgentExecution.duration_ms).label("avg_dur"),
            )
            .join(CRMAgent, CRMAgentExecution.agent_id == CRMAgent.id)
            .where(CRMAgentExecution.created_at >= cutoff)
            .group_by(CRMAgent.name)
            .order_by(func.count().desc())
            .limit(10)
        )
        top_result = await self.db.execute(top_stmt)
        top_agents = [
            {
                "name": r.name,
                "executions": r.executions,
                "success_rate": round(r.successes / r.executions * 100, 1) if r.executions > 0 else 0,
                "avg_duration_ms": round(float(r.avg_dur), 0) if r.avg_dur else None,
            }
            for r in top_result.all()
        ]

        return AgentMetrics(
            total_executions=total,
            completed=completed,
            failed=int(row.failed or 0),
            success_rate=round(completed / total * 100, 1) if total > 0 else None,
            avg_duration_ms=float(row.avg_duration) if row.avg_duration else None,
            top_agents=top_agents,
        )

    async def _automation_metrics(self, cutoff: datetime) -> AutomationMetrics:
        """Aggregate automation run metrics."""
        stmt = select(
            func.count().label("total"),
            func.count().filter(CRMAutomationRun.status == "completed").label("completed"),
            func.count().filter(CRMAutomationRun.status == "failed").label("failed"),
            func.avg(CRMAutomationRun.duration_ms).label("avg_duration"),
        ).where(CRMAutomationRun.created_at >= cutoff)

        result = await self.db.execute(stmt)
        row = result.one()

        total = int(row.total or 0)
        completed = int(row.completed or 0)

        # By module
        module_stmt = (
            select(
                CRMAutomationRun.module,
                func.count().label("runs"),
                func.count().filter(CRMAutomationRun.status == "completed").label("successes"),
                func.avg(CRMAutomationRun.duration_ms).label("avg_dur"),
            )
            .where(CRMAutomationRun.created_at >= cutoff)
            .group_by(CRMAutomationRun.module)
            .order_by(func.count().desc())
        )
        module_result = await self.db.execute(module_stmt)
        by_module = [
            {
                "module": r.module,
                "runs": r.runs,
                "success_rate": round(r.successes / r.runs * 100, 1) if r.runs > 0 else 0,
                "avg_duration_ms": round(float(r.avg_dur), 0) if r.avg_dur else None,
            }
            for r in module_result.all()
        ]

        return AutomationMetrics(
            total_runs=total,
            completed=completed,
            failed=int(row.failed or 0),
            success_rate=round(completed / total * 100, 1) if total > 0 else None,
            avg_duration_ms=float(row.avg_duration) if row.avg_duration else None,
            by_module=by_module,
        )

    async def _feedback_summary(self, cutoff: datetime) -> FeedbackSummary:
        """Aggregate feedback metrics."""
        # Overall counts
        stmt = select(
            func.count().label("total"),
            func.count().filter(AIFeedback.rating == 1).label("thumbs_up"),
            func.count().filter(AIFeedback.rating == -1).label("thumbs_down"),
        ).where(AIFeedback.created_at >= cutoff)

        result = await self.db.execute(stmt)
        row = result.one()
        total = int(row.total or 0)
        thumbs_up = int(row.thumbs_up or 0)
        thumbs_down = int(row.thumbs_down or 0)

        # By entity type
        by_type_stmt = (
            select(
                AIFeedback.entity_type,
                func.count().label("total"),
                func.count().filter(AIFeedback.rating == 1).label("thumbs_up"),
                func.count().filter(AIFeedback.rating == -1).label("thumbs_down"),
            )
            .where(AIFeedback.created_at >= cutoff)
            .group_by(AIFeedback.entity_type)
        )
        by_type_result = await self.db.execute(by_type_stmt)
        by_entity_type = [
            {
                "entity_type": r.entity_type,
                "total": r.total,
                "thumbs_up": r.thumbs_up,
                "thumbs_down": r.thumbs_down,
                "satisfaction_rate": round(r.thumbs_up / r.total * 100, 1) if r.total > 0 else 0,
            }
            for r in by_type_result.all()
        ]

        # Recent negative feedback
        neg_stmt = (
            select(AIFeedback)
            .where(
                AIFeedback.rating == -1,
                AIFeedback.created_at >= cutoff,
            )
            .order_by(AIFeedback.created_at.desc())
            .limit(20)
        )
        neg_result = await self.db.execute(neg_stmt)
        recent_negative = [
            {
                "id": str(fb.id),
                "entity_type": fb.entity_type,
                "entity_id": str(fb.entity_id),
                "comment": fb.comment,
                "tags": fb.tags,
                "created_at": fb.created_at.isoformat() if fb.created_at else None,
            }
            for fb in neg_result.scalars().all()
        ]

        return FeedbackSummary(
            total=total,
            thumbs_up=thumbs_up,
            thumbs_down=thumbs_down,
            satisfaction_rate=round(thumbs_up / total * 100, 1) if total > 0 else None,
            by_entity_type=by_entity_type,
            recent_negative=recent_negative,
        )

    async def _volume_trend(self, cutoff: datetime, group_by: str) -> list[VolumeSeries]:
        """Combined volume trend across all AI features."""
        trunc_ask = func.date_trunc(group_by, AskMessage.created_at)
        trunc_agent = func.date_trunc(group_by, CRMAgentExecution.created_at)
        trunc_auto = func.date_trunc(group_by, CRMAutomationRun.created_at)

        # Ask messages by date
        ask_stmt = (
            select(
                trunc_ask.label("date"),
                func.count().label("ask_messages"),
                literal_column("0").label("agent_executions"),
                literal_column("0").label("automation_runs"),
            )
            .where(
                AskMessage.role == "assistant",
                AskMessage.created_at >= cutoff,
            )
            .group_by(trunc_ask)
        )

        # Agent executions by date
        agent_stmt = (
            select(
                trunc_agent.label("date"),
                literal_column("0").label("ask_messages"),
                func.count().label("agent_executions"),
                literal_column("0").label("automation_runs"),
            )
            .where(CRMAgentExecution.created_at >= cutoff)
            .group_by(trunc_agent)
        )

        # Automation runs by date
        auto_stmt = (
            select(
                trunc_auto.label("date"),
                literal_column("0").label("ask_messages"),
                literal_column("0").label("agent_executions"),
                func.count().label("automation_runs"),
            )
            .where(CRMAutomationRun.created_at >= cutoff)
            .group_by(trunc_auto)
        )

        # Union and re-aggregate
        combined = union_all(ask_stmt, agent_stmt, auto_stmt).subquery()
        final_stmt = (
            select(
                combined.c.date,
                func.sum(combined.c.ask_messages).label("ask_messages"),
                func.sum(combined.c.agent_executions).label("agent_executions"),
                func.sum(combined.c.automation_runs).label("automation_runs"),
            )
            .group_by(combined.c.date)
            .order_by(combined.c.date)
        )
        result = await self.db.execute(final_stmt)

        return [
            VolumeSeries(
                date=str(row.date),
                ask_messages=int(row.ask_messages or 0),
                agent_executions=int(row.agent_executions or 0),
                automation_runs=int(row.automation_runs or 0),
            )
            for row in result.all()
        ]
