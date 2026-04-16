"""Tools for querying Aexy data (sprints, tickets, CRM metrics)."""

from typing import Any

from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field


class QuerySprintsInput(BaseModel):
    workspace_id: str = Field(description="Workspace ID")
    limit: int = Field(default=5, description="Number of recent sprints")


class QuerySprintsTool(BaseTool):
    """Query sprint and velocity data from Aexy."""

    name: str = "query_sprints"
    description: str = "Query recent sprint data including velocity, completion rate, and tasks"
    args_schema: type[BaseModel] = QuerySprintsInput

    db: Any = None

    def _run(self, **kwargs) -> str:
        raise NotImplementedError("Use async")

    async def _arun(self, workspace_id: str, limit: int = 5) -> str:
        import json
        from sqlalchemy import select
        from aexy.models.sprint import Sprint

        if not self.db:
            return "Database not available"

        result = await self.db.execute(
            select(Sprint)
            .where(Sprint.workspace_id == workspace_id)
            .order_by(Sprint.created_at.desc())
            .limit(limit)
        )
        sprints = result.scalars().all()
        return json.dumps(
            [
                {
                    "id": s.id,
                    "name": s.name,
                    "status": s.status,
                    "start_date": str(s.start_date) if s.start_date else None,
                    "end_date": str(s.end_date) if s.end_date else None,
                }
                for s in sprints
            ],
            default=str,
        )


class QueryTicketsInput(BaseModel):
    workspace_id: str = Field(description="Workspace ID")
    status: str | None = Field(default=None, description="Filter by status")
    limit: int = Field(default=20, description="Max tickets to return")


class QueryTicketsTool(BaseTool):
    """Query tickets/tasks from Aexy."""

    name: str = "query_tickets"
    description: str = "Query tickets or tasks with optional status filter"
    args_schema: type[BaseModel] = QueryTicketsInput

    db: Any = None

    def _run(self, **kwargs) -> str:
        raise NotImplementedError("Use async")

    async def _arun(
        self, workspace_id: str, status: str | None = None, limit: int = 20
    ) -> str:
        import json
        from sqlalchemy import select
        from aexy.models.ticket import Ticket

        if not self.db:
            return "Database not available"

        stmt = (
            select(Ticket)
            .where(Ticket.workspace_id == workspace_id)
            .order_by(Ticket.created_at.desc())
            .limit(limit)
        )
        if status:
            stmt = stmt.where(Ticket.status == status)

        result = await self.db.execute(stmt)
        tickets = result.scalars().all()
        return json.dumps(
            [
                {
                    "id": t.id,
                    "title": t.title,
                    "status": t.status,
                    "priority": getattr(t, "priority", None),
                    "assignee_id": getattr(t, "assignee_id", None),
                }
                for t in tickets
            ],
            default=str,
        )


class QueryCRMInput(BaseModel):
    workspace_id: str = Field(description="Workspace ID")
    object_slug: str = Field(default="contacts", description="CRM object slug")
    limit: int = Field(default=20, description="Max records to return")


class QueryCRMTool(BaseTool):
    """Query CRM pipeline and contact data."""

    name: str = "query_crm"
    description: str = "Query CRM records (contacts, deals, companies) from Aexy"
    args_schema: type[BaseModel] = QueryCRMInput

    db: Any = None

    def _run(self, **kwargs) -> str:
        raise NotImplementedError("Use async")

    async def _arun(
        self, workspace_id: str, object_slug: str = "contacts", limit: int = 20
    ) -> str:
        import json
        from sqlalchemy import select
        from aexy.models.crm import CRMObject, CRMRecord

        if not self.db:
            return "Database not available"

        # Find the CRM object
        obj_result = await self.db.execute(
            select(CRMObject).where(
                CRMObject.workspace_id == workspace_id,
                CRMObject.slug == object_slug,
            )
        )
        crm_obj = obj_result.scalar_one_or_none()
        if not crm_obj:
            return f"CRM object '{object_slug}' not found"

        # Get records
        result = await self.db.execute(
            select(CRMRecord)
            .where(CRMRecord.object_id == crm_obj.id)
            .order_by(CRMRecord.created_at.desc())
            .limit(limit)
        )
        records = result.scalars().all()
        return json.dumps(
            [
                {
                    "id": r.id,
                    "values": r.values if hasattr(r, "values") else {},
                    "created_at": str(r.created_at),
                }
                for r in records
            ],
            default=str,
        )
