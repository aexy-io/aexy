"""Seed fictional demo data so app pages photograph well.

Fills the first developer's workspace (the "E2E WS" that
`generate_test_token.py --first` tokens resolve to) with believable CRM
records, an active sprint with a realistic board, two enabled automations,
an active review cycle, and three real docs — enough that the CRM,
Planning, Automations, Reviews, and Docs pages all have something worth
screenshotting.

Idempotent: everything is looked up by name/title before insert, so
re-runs add nothing. Fictional data only.

Throwaway helper for demo/marketing databases — not part of the product.

WRITES REAL ROWS. It picks the first developer's first workspace and inserts
CRM records, a sprint, **enabled** automations, a review cycle, and docs. Run
against a production database it would drop fictional "Northwind Traders"
deals into a real customer workspace and switch on automations that then fire
on live records. So it refuses to run without an explicit `--yes`, and prints
the database and workspace it is about to touch first.

    python scripts/seed_marketing_demo.py            # shows the target, does nothing
    python scripts/seed_marketing_demo.py --yes      # actually seeds
"""

import argparse
import asyncio
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import func, select  # noqa: E402

from aexy.core.database import async_session_maker  # noqa: E402
from aexy.models.crm import CRMAttribute, CRMAutomation, CRMObject, CRMRecord  # noqa: E402
from aexy.models.developer import Developer  # noqa: E402
from aexy.models.forms import Form  # noqa: E402
from aexy.models.leave import (  # noqa: E402
    Holiday,
    LeavePolicy,
    LeaveRequest,
    LeaveType,
)
from aexy.models.documentation import Document  # noqa: E402
from aexy.models.project import Project, ProjectMember, ProjectTeam  # noqa: E402
from aexy.models.review import IndividualReview, ReviewCycle  # noqa: E402
from aexy.models.sprint import (  # noqa: E402
    Sprint,
    SprintTask,
    TaskAssignee,
    WorkspaceTaskStatus,
)
from aexy.models.team import Team, TeamMember  # noqa: E402
from aexy.models.ticketing import Ticket, TicketForm  # noqa: E402
from aexy.models.workspace import Workspace, WorkspaceMember  # noqa: E402

PREFERRED_DEVELOPER_ID = "11111111-1111-1111-1111-111111111111"

NOW = datetime.now(timezone.utc)
TODAY = NOW.date()

created: list[str] = []
skipped: list[str] = []


def redacted_dsn() -> str:
    """The DSN with any password removed — safe to print."""
    from aexy.core.config import settings

    dsn = settings.database_url
    if "@" in dsn and "://" in dsn:
        scheme, rest = dsn.split("://", 1)
        creds, host = rest.rsplit("@", 1)
        user = creds.split(":", 1)[0]
        return f"{scheme}://{user}:***@{host}"
    return dsn


def note(kind: str, name: str, was_created: bool) -> None:
    (created if was_created else skipped).append(f"{kind}: {name}")


# ---------------------------------------------------------------------------
# CRM
# ---------------------------------------------------------------------------

async def get_object(db, workspace_id: str, slug: str) -> CRMObject | None:
    return (
        await db.execute(
            select(CRMObject).where(
                CRMObject.workspace_id == workspace_id,
                CRMObject.slug == slug,
            )
        )
    ).scalar_one_or_none()


async def attr_slugs(db, object_id: str) -> dict[str, CRMAttribute]:
    rows = (
        await db.execute(
            select(CRMAttribute).where(CRMAttribute.object_id == object_id)
        )
    ).scalars().all()
    return {a.slug: a for a in rows}


def option_value(attr: CRMAttribute | None, wanted: str) -> str | None:
    """Return `wanted` only if the select/status attribute offers it."""
    if attr is None:
        return None
    options = (attr.config or {}).get("options", [])
    values = {o.get("value") for o in options}
    if wanted in values:
        return wanted
    return "other" if "other" in values else None


async def upsert_record(
    db, workspace_id: str, obj: CRMObject, display_name: str,
    values: dict, owner_id: str,
) -> tuple[CRMRecord, bool]:
    existing = (
        await db.execute(
            select(CRMRecord).where(
                CRMRecord.object_id == obj.id,
                CRMRecord.display_name == display_name,
            )
        )
    ).scalars().first()
    if existing is not None:
        return existing, False
    record = CRMRecord(
        id=str(uuid4()),
        workspace_id=workspace_id,
        object_id=obj.id,
        values={k: v for k, v in values.items() if v is not None},
        display_name=display_name,
        owner_id=owner_id,
        created_by_id=owner_id,
        source="manual",
    )
    db.add(record)
    await db.flush()
    return record, True


async def seed_crm(db, workspace_id: str, dev: Developer) -> None:
    company_obj = await get_object(db, workspace_id, "company")
    person_obj = await get_object(db, workspace_id, "person")
    deal_obj = await get_object(db, workspace_id, "deal")
    lead_obj = await get_object(db, workspace_id, "lead")
    if not all([company_obj, person_obj, deal_obj, lead_obj]):
        skipped.append("CRM: standard objects missing — module skipped")
        return

    company_attrs = await attr_slugs(db, company_obj.id)
    deal_attrs = await attr_slugs(db, deal_obj.id)
    lead_attrs = await attr_slugs(db, lead_obj.id)

    companies = [
        ("Northwind Traders", "https://northwindtraders.example.com", "retail",
         "201-500", "Wholesale distribution network moving specialty goods across three continents."),
        ("Lumen Analytics", "https://lumenanalytics.example.com", "technology",
         "51-200", "Product analytics platform for subscription businesses."),
        ("Fieldstone Logistics", "https://fieldstonelogistics.example.com", "other",
         "501-1000", "Regional freight and last-mile delivery operator."),
        ("Brightpath Labs", "https://brightpathlabs.example.com", "healthcare",
         "11-50", "Clinical research tooling for early-stage biotech teams."),
    ]
    company_records: dict[str, CRMRecord] = {}
    for name, website, industry, size, desc in companies:
        values = {
            "name": name,
            "website": website if "website" in company_attrs else None,
            "industry": option_value(company_attrs.get("industry"), industry),
            "size": option_value(company_attrs.get("size"), size),
            "description": desc if "description" in company_attrs else None,
        }
        rec, was_created = await upsert_record(
            db, workspace_id, company_obj, name, values, dev.id
        )
        company_records[name] = rec
        note("CRM company", name, was_created)

    def company_ref(name: str) -> dict:
        rec = company_records[name]
        return {"id": rec.id, "display_name": name}

    deals = [
        ("Northwind platform rollout", 64000, "negotiation", 70,
         (TODAY + timedelta(days=25)).isoformat(), "Northwind Traders", "referral"),
        ("Lumen analytics expansion", 42500, "proposal", 55,
         (TODAY + timedelta(days=40)).isoformat(), "Lumen Analytics", "website"),
        ("Fieldstone onboarding", 18000, "qualified", 35,
         (TODAY + timedelta(days=60)).isoformat(), "Fieldstone Logistics", "cold_outreach"),
        ("Brightpath annual renewal", 27000, "won", 100,
         (TODAY - timedelta(days=5)).isoformat(), "Brightpath Labs", "partner"),
    ]
    for name, value, stage, prob, close, comp, source in deals:
        values = {
            "name": name,
            "value": value,
            "stage": option_value(deal_attrs.get("stage"), stage) or stage,
            "probability": prob if "probability" in deal_attrs else None,
            "close_date": close if "close_date" in deal_attrs else None,
            "company": company_ref(comp) if "company" in deal_attrs else None,
            "deal_owner": dev.name if "deal_owner" in deal_attrs else None,
            "source": option_value(deal_attrs.get("source"), source),
        }
        _, was_created = await upsert_record(
            db, workspace_id, deal_obj, name, values, dev.id
        )
        note("CRM deal", name, was_created)

    # Leads ship without a score attribute; add one so scores render.
    if "score" not in lead_attrs:
        max_pos = max((a.position for a in lead_attrs.values()), default=0)
        score_attr = CRMAttribute(
            id=str(uuid4()),
            object_id=lead_obj.id,
            name="Score",
            slug="score",
            attribute_type="number",
            config={"min": 0, "max": 100},
            position=max_pos + 1,
        )
        db.add(score_attr)
        await db.flush()
        created.append("CRM attribute: Lead.score")

    leads = [
        ("Priya Raman", "priya.raman@ferndalehq.example.com", "Ferndale Systems",
         "VP Engineering", "qualified", "website", 30000, 86),
        ("Marcus Webb", "marcus.webb@oakline.example.com", "Oakline Retail Group",
         "Head of Operations", "contacted", "referral", 22000, 72),
        ("Elena Sorokin", "elena@cobaltworks.example.com", "Cobalt Works",
         "CTO", "new", "event", 45000, 64),
    ]
    for name, email, comp, title, status, source, est, score in leads:
        values = {
            "name": name,
            "email": email if "email" in lead_attrs else None,
            "company_name": comp if "company_name" in lead_attrs else None,
            "title": title if "title" in lead_attrs else None,
            "lead_status": option_value(lead_attrs.get("lead_status"), status) or status,
            "source": option_value(lead_attrs.get("source"), source),
            "estimated_value": est if "estimated_value" in lead_attrs else None,
            "score": score,
        }
        _, was_created = await upsert_record(
            db, workspace_id, lead_obj, name, values, dev.id
        )
        note("CRM lead", name, was_created)

    person_attrs = await attr_slugs(db, person_obj.id)
    people = [
        ("Ava", "Chen", "Director of Operations", "Northwind Traders",
         "ava.chen@northwindtraders.example.com"),
        ("Daniel", "Okafor", "Head of Data Platform", "Lumen Analytics",
         "daniel.okafor@lumenanalytics.example.com"),
        ("Sofia", "Marek", "VP Supply Chain", "Fieldstone Logistics",
         "sofia.marek@fieldstonelogistics.example.com"),
        ("James", "Whitfield", "Chief Scientist", "Brightpath Labs",
         "james.whitfield@brightpathlabs.example.com"),
    ]
    for first, last, title, comp, email in people:
        full = f"{first} {last}"
        values = {
            "first_name": first,
            "last_name": last,
            "email": email if "email" in person_attrs else None,
            "title": title if "title" in person_attrs else None,
            "company": company_ref(comp) if "company" in person_attrs else None,
        }
        _, was_created = await upsert_record(
            db, workspace_id, person_obj, full, values, dev.id
        )
        note("CRM person", full, was_created)

    # Refresh the denormalized record_count on each object.
    for obj in (company_obj, person_obj, deal_obj, lead_obj):
        count = (
            await db.execute(
                select(func.count()).select_from(CRMRecord).where(
                    CRMRecord.object_id == obj.id,
                    CRMRecord.is_archived.is_(False),
                )
            )
        ).scalar_one()
        obj.record_count = count


# ---------------------------------------------------------------------------
# Planning: project, team, sprint, tasks
# ---------------------------------------------------------------------------

# The standard status set the product seeds for new workspaces
# (TaskConfigService.DEFAULT_STATUSES). The board's columns come from these
# workspace-default rows (project-scoped lookups fall back to them too).
STANDARD_STATUSES = [
    ("Backlog", "backlog", "backlog", "#9CA3AF", 0, True),
    ("To Do", "todo", "todo", "#3B82F6", 1, False),
    ("In Progress", "in_progress", "in_progress", "#F59E0B", 2, False),
    ("In Review", "in_review", "in_review", "#8B5CF6", 3, False),
    ("Done", "done", "done", "#10B981", 4, False),
]

# SprintTask.status legacy vocabulary -> status row slug (they differ for
# "review": the column slug is "in_review").
LEGACY_STATUS_TO_SLUG = {
    "backlog": "backlog",
    "todo": "todo",
    "in_progress": "in_progress",
    "review": "in_review",
    "done": "done",
}


async def seed_task_statuses(db, workspace_id: str) -> dict[str, WorkspaceTaskStatus]:
    """Ensure the standard workspace-default status columns exist.

    Returns slug -> status row for wiring SprintTask.status_id. Also
    deactivates leftover probe statuses so they don't render as an empty
    first column on the board.
    """
    existing = (
        await db.execute(
            select(WorkspaceTaskStatus).where(
                WorkspaceTaskStatus.workspace_id == workspace_id,
                WorkspaceTaskStatus.project_id.is_(None),
            )
        )
    ).scalars().all()
    by_slug = {s.slug: s for s in existing}

    for name, slug, category, color, position, is_default in STANDARD_STATUSES:
        if slug in by_slug:
            note("Task status", name, False)
            continue
        row = WorkspaceTaskStatus(
            id=str(uuid4()),
            workspace_id=workspace_id,
            project_id=None,
            name=name,
            slug=slug,
            category=category,
            color=color,
            position=position,
            is_default=is_default,
            is_active=True,
        )
        db.add(row)
        by_slug[slug] = row
        note("Task status", name, True)

    for s in existing:
        if s.name == "Probe" and s.is_active:
            s.is_active = False
            created.append("Task status: deactivated leftover 'Probe' column")

    await db.flush()
    return by_slug

async def seed_planning(db, workspace: Workspace, dev: Developer) -> None:
    workspace_id = workspace.id

    project = (
        await db.execute(
            select(Project).where(
                Project.workspace_id == workspace_id, Project.name == "Platform"
            )
        )
    ).scalars().first()
    if project is None:
        project = Project(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name="Platform",
            slug=f"platform-{uuid4().hex[:6]}",
            description="Core platform: auth, billing, APIs, and infrastructure.",
            color="#6366f1",
            status="active",
        )
        db.add(project)
        await db.flush()
        note("Project", "Platform", True)
    else:
        note("Project", "Platform", False)

    # The sprint board resolves the team by PROJECT id: the product's own
    # create_project (project_service.py) creates the companion Team with
    # id == project.id ("same ID for easy correlation"), and the frontend
    # calls /teams/{projectId}/sprints. Mirror that exactly.
    team = (
        await db.execute(select(Team).where(Team.id == project.id))
    ).scalar_one_or_none()
    if team is None:
        team = Team(
            id=project.id,
            workspace_id=workspace_id,
            name=project.name,
            slug=project.slug,
            description="Core platform and infrastructure team.",
            type="internal",
            auto_sync_enabled=False,
            settings={},
            is_active=True,
        )
        db.add(team)
        await db.flush()
        note("Team", "Platform (id == project id)", True)
    else:
        note("Team", "Platform (id == project id)", False)

    # Repair a previous run of this script that created the team under its
    # own uuid: repoint sprints/tasks/memberships at the correct team, then
    # drop the orphan. Sprint and task team FKs are ON DELETE CASCADE, so the
    # repoint must land (flush) before the delete.
    orphans = (
        await db.execute(
            select(Team).where(
                Team.workspace_id == workspace_id,
                Team.name == "Platform",
                Team.id != project.id,
            )
        )
    ).scalars().all()
    for orphan in orphans:
        moved_sprints = (
            await db.execute(select(Sprint).where(Sprint.team_id == orphan.id))
        ).scalars().all()
        for s in moved_sprints:
            s.team_id = team.id
        moved_tasks = (
            await db.execute(
                select(SprintTask).where(SprintTask.team_id == orphan.id)
            )
        ).scalars().all()
        for t in moved_tasks:
            t.team_id = team.id
        await db.flush()
        await db.delete(orphan)  # cascades its memberships and project links
        await db.flush()
        created.append(
            f"Repair: moved {len(moved_sprints)} sprint(s) / {len(moved_tasks)} "
            f"task(s) off orphan team {orphan.id} and deleted it"
        )

    membership = (
        await db.execute(
            select(TeamMember).where(
                TeamMember.team_id == team.id,
                TeamMember.developer_id == dev.id,
            )
        )
    ).scalar_one_or_none()
    if membership is None:
        db.add(
            TeamMember(
                id=str(uuid4()),
                team_id=team.id,
                developer_id=dev.id,
                role="lead",
            )
        )

    link = (
        await db.execute(
            select(ProjectTeam).where(
                ProjectTeam.project_id == project.id,
                ProjectTeam.team_id == team.id,
            )
        )
    ).scalar_one_or_none()
    if link is None:
        db.add(ProjectTeam(id=str(uuid4()), project_id=project.id, team_id=team.id))

    pmember = (
        await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project.id,
                ProjectMember.developer_id == dev.id,
            )
        )
    ).scalar_one_or_none()
    if pmember is None:
        db.add(
            ProjectMember(
                id=str(uuid4()),
                project_id=project.id,
                developer_id=dev.id,
                status="active",
            )
        )

    sprint = (
        await db.execute(
            select(Sprint).where(
                Sprint.workspace_id == workspace_id, Sprint.name == "Sprint 24"
            )
        )
    ).scalars().first()
    if sprint is None:
        sprint = Sprint(
            id=str(uuid4()),
            team_id=team.id,
            workspace_id=workspace_id,
            name="Sprint 24",
            goal="Harden auth and webhooks; ship SSO for the Northwind rollout.",
            status="active",
            start_date=NOW - timedelta(days=8),
            end_date=NOW + timedelta(days=6),
            velocity_commitment=39,
            created_by_id=dev.id,
        )
        db.add(sprint)
        await db.flush()
        note("Sprint", "Sprint 24", True)
    else:
        note("Sprint", "Sprint 24", False)

    status_rows = await seed_task_statuses(db, workspace_id)

    def status_id_for(legacy: str) -> str | None:
        row = status_rows.get(LEGACY_STATUS_TO_SLUG.get(legacy, legacy))
        return row.id if row is not None else None

    tasks = [
        # title, status, points, priority, task_type, assigned
        ("Rate-limit the webhook retry", "in_progress", 5, "high", "task", True),
        ("Auth refresh drops the session", "in_progress", 8, "critical", "bug", True),
        ("Ship SSO for Northwind", "review", 8, "high", "feature", True),
        ("Migrate email templates to MJML", "review", 5, "medium", "task", False),
        ("Backfill workspace slugs", "done", 3, "medium", "chore", True),
        ("Index crm_records.values for search", "done", 5, "high", "task", False),
        ("Paginate the audit log", "todo", 3, "medium", "task", False),
        ("Flaky sprint metrics test on CI", "todo", 2, "low", "chore", False),
    ]
    for title, status, points, priority, task_type, assign in tasks:
        existing = (
            await db.execute(
                select(SprintTask).where(
                    SprintTask.workspace_id == workspace_id,
                    SprintTask.title == title,
                )
            )
        ).scalars().first()
        if existing is not None:
            # Repair pass: earlier runs left status_id unset, so tasks with
            # legacy status "review" never matched the "in_review" column.
            wanted = status_id_for(status)
            if existing.status_id != wanted:
                existing.status_id = wanted
                created.append(f"Repair: set status_id on task {title!r}")
            note("Task", title, False)
            continue

        task_key = workspace.next_task_key
        workspace.next_task_key = task_key + 1

        task = SprintTask(
            id=str(uuid4()),
            sprint_id=sprint.id,
            team_id=team.id,
            workspace_id=workspace_id,
            task_key=task_key,
            source_type="manual",
            source_id=str(uuid4()),
            title=title,
            description=None,
            story_points=points,
            priority=priority,
            status=status,
            status_id=status_id_for(status),
            task_type=task_type,
            assignee_id=dev.id if assign else None,
            work_started_at=(
                NOW - timedelta(days=3) if status in ("in_progress", "review", "done") else None
            ),
            completed_at=NOW - timedelta(days=1) if status == "done" else None,
        )
        db.add(task)
        await db.flush()
        if assign:
            db.add(
                TaskAssignee(
                    id=str(uuid4()),
                    task_id=task.id,
                    developer_id=dev.id,
                    is_primary=True,
                    added_by_id=dev.id,
                )
            )
        note("Task", title, True)


# ---------------------------------------------------------------------------
# Automations
# ---------------------------------------------------------------------------

async def seed_automations(db, workspace_id: str, dev: Developer) -> None:
    lead_obj = await get_object(db, workspace_id, "lead")

    specs = [
        {
            "name": "Uptime alert → urgent ticket",
            "description": "When a monitor goes down, open a critical incident and page the team.",
            "module": "uptime",
            "object_id": None,
            "trigger_type": "monitor.down",
            "trigger_config": {},
            "actions": [
                {
                    "type": "create_incident",
                    "config": {"severity": "critical", "title": "{{monitor.name}} is down"},
                    "order": 0,
                },
                {
                    "type": "notify_team",
                    "config": {"message": "{{monitor.name}} is down — urgent ticket opened."},
                    "order": 1,
                },
            ],
            "total_runs": 42,
            "successful_runs": 41,
            "failed_runs": 1,
        },
        {
            "name": "New lead reply → route to sales agent",
            "description": "New leads are routed to the sales agent and assigned an owner.",
            "module": "crm",
            "object_id": lead_obj.id if lead_obj else None,
            "trigger_type": "record.created",
            "trigger_config": {"objectId": lead_obj.id} if lead_obj else {},
            "actions": [
                {"type": "run_agent", "config": {"agentName": "Sales Router"}, "order": 0},
                {"type": "assign_owner", "config": {"ownerId": dev.id}, "order": 1},
            ],
            "total_runs": 128,
            "successful_runs": 126,
            "failed_runs": 2,
        },
    ]
    for spec in specs:
        existing = (
            await db.execute(
                select(CRMAutomation).where(
                    CRMAutomation.workspace_id == workspace_id,
                    CRMAutomation.name == spec["name"],
                )
            )
        ).scalars().first()
        if existing is not None:
            note("Automation", spec["name"], False)
            continue
        db.add(
            CRMAutomation(
                id=str(uuid4()),
                workspace_id=workspace_id,
                name=spec["name"],
                description=spec["description"],
                module=spec["module"],
                object_id=spec["object_id"],
                trigger_type=spec["trigger_type"],
                trigger_config=spec["trigger_config"],
                conditions=[],
                actions=spec["actions"],
                is_active=True,
                created_by_id=dev.id,
                total_runs=spec["total_runs"],
                successful_runs=spec["successful_runs"],
                failed_runs=spec["failed_runs"],
                last_run_at=NOW - timedelta(hours=3),
            )
        )
        note("Automation", spec["name"], True)


# ---------------------------------------------------------------------------
# Reviews
# ---------------------------------------------------------------------------

async def seed_reviews(db, workspace_id: str, dev: Developer) -> None:
    name = "Q3 Engineering Reviews"
    cycle = (
        await db.execute(
            select(ReviewCycle).where(
                ReviewCycle.workspace_id == workspace_id,
                ReviewCycle.name == name,
            )
        )
    ).scalars().first()
    if cycle is None:
        cycle = ReviewCycle(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            cycle_type="quarterly",
            period_start=date(2026, 7, 1),
            period_end=date(2026, 9, 30),
            self_review_deadline=date(2026, 9, 7),
            peer_review_deadline=date(2026, 9, 14),
            manager_review_deadline=date(2026, 9, 21),
            settings={
                "enable_self_review": True,
                "enable_peer_review": True,
                "enable_manager_review": True,
                "min_peer_reviewers": 2,
                "max_peer_reviewers": 4,
                "include_github_metrics": True,
            },
            status="active",
        )
        db.add(cycle)
        await db.flush()
        note("Review cycle", name, True)
    else:
        note("Review cycle", name, False)

    review = (
        await db.execute(
            select(IndividualReview).where(
                IndividualReview.review_cycle_id == cycle.id,
                IndividualReview.developer_id == dev.id,
            )
        )
    ).scalars().first()
    if review is None:
        db.add(
            IndividualReview(
                id=str(uuid4()),
                review_cycle_id=cycle.id,
                developer_id=dev.id,
                status="pending",
            )
        )
        note("Individual review", dev.name or dev.id, True)
    else:
        note("Individual review", dev.name or dev.id, False)


# ---------------------------------------------------------------------------
# Docs
# ---------------------------------------------------------------------------

def tiptap(blocks: list[tuple[str, str]]) -> tuple[dict, str]:
    """Build a TipTap doc from (kind, text) blocks. Kinds: h2, p, li."""
    content: list[dict] = []
    bullets: list[dict] = []

    def flush_bullets() -> None:
        nonlocal bullets
        if bullets:
            content.append({"type": "bulletList", "content": bullets})
            bullets = []

    for kind, text_ in blocks:
        if kind == "li":
            bullets.append(
                {
                    "type": "listItem",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": text_}],
                        }
                    ],
                }
            )
            continue
        flush_bullets()
        if kind == "h2":
            content.append(
                {
                    "type": "heading",
                    "attrs": {"level": 2},
                    "content": [{"type": "text", "text": text_}],
                }
            )
        else:
            content.append(
                {"type": "paragraph", "content": [{"type": "text", "text": text_}]}
            )
    flush_bullets()
    plain = "\n".join(t for _, t in blocks)
    return {"type": "doc", "content": content}, plain


DOCS: list[tuple[str, str, list[tuple[str, str]]]] = [
    (
        "Incident runbook",
        "🚨",
        [
            ("p", "What to do in the first fifteen minutes of a production incident. Stay calm, follow the steps in order, and write down timestamps as you go — the postmortem will thank you."),
            ("h2", "Detect and declare"),
            ("p", "An incident starts when a monitor pages, a customer reports an outage, or an engineer notices something wrong. Declare it in #incidents immediately — a false alarm costs five minutes, a late declaration costs an hour."),
            ("h2", "Triage"),
            ("li", "Check the uptime dashboard for which monitors are failing and since when."),
            ("li", "Look at the last three deploys. If one lines up with the failure window, roll it back first and investigate second."),
            ("li", "Check the queue depth on Temporal and Redis — a stuck worker looks identical to an outage from the outside."),
            ("h2", "Communicate"),
            ("p", "Post a status update every twenty minutes even if the update is 'still investigating'. Silence reads as abandonment to everyone watching the channel."),
            ("h2", "Resolve and hand off"),
            ("p", "Once service is restored, keep the incident open for thirty minutes and watch the error rate. Then schedule the postmortem within two business days while memories are fresh."),
        ],
    ),
    (
        "Escalation path",
        "📶",
        [
            ("p", "Who to pull in, in what order, and how long to wait before moving up a level. The goal is that nobody sits on a blocking problem for more than thirty minutes."),
            ("h2", "Level 1 — on-call engineer"),
            ("p", "The on-call engineer owns every alert by default. They acknowledge within five minutes and either resolve or escalate within thirty."),
            ("h2", "Level 2 — team lead"),
            ("p", "Escalate to the Platform team lead when the fix requires a decision about data loss, a rollback of someone else's change, or spend above the on-call budget. The lead responds within fifteen minutes during business hours."),
            ("h2", "Level 3 — engineering manager"),
            ("p", "Customer-visible outages longer than an hour, security incidents, and anything involving legal or a contractual SLA go straight to the engineering manager, day or night."),
            ("h2", "Rules of thumb"),
            ("li", "Escalating early is free; escalating late is expensive."),
            ("li", "Page a person, not a channel, when you need an answer."),
            ("li", "If two levels disagree, the higher level decides and the discussion moves to the postmortem."),
        ],
    ),
    (
        "Postmortem template",
        "📝",
        [
            ("p", "Copy this document for every incident sev-2 or higher. Blameless means we name systems and gaps, not people. Fill every section — 'nothing to note' is an acceptable answer, a blank section is not."),
            ("h2", "Summary"),
            ("p", "Two or three sentences: what broke, who noticed, how long it lasted, and what the customer impact was in plain numbers (requests failed, minutes of downtime, tenants affected)."),
            ("h2", "Timeline"),
            ("p", "A bulleted list of timestamps in UTC, from the first bad deploy or config change to the all-clear. Include when each person was paged and when they actually engaged."),
            ("h2", "Root cause"),
            ("p", "Go past the first answer. 'The deploy broke it' is a symptom; why did the deploy pass CI, why did staging not catch it, and why did the rollback take twenty minutes?"),
            ("h2", "Action items"),
            ("li", "Each item gets an owner and a due date, tracked in the sprint board."),
            ("li", "Prefer one structural fix over five reminders to be careful."),
            ("li", "Close the loop: link the completed tasks back to this document."),
        ],
    ),
]


async def seed_docs(db, workspace_id: str, dev: Developer) -> None:
    for position, (title, icon, blocks) in enumerate(DOCS):
        existing = (
            await db.execute(
                select(Document).where(
                    Document.workspace_id == workspace_id,
                    Document.title == title,
                )
            )
        ).scalars().first()
        if existing is not None:
            note("Doc", title, False)
            continue
        content, plain = tiptap(blocks)
        db.add(
            Document(
                id=str(uuid4()),
                workspace_id=workspace_id,
                title=title,
                content=content,
                content_text=plain,
                icon=icon,
                created_by_id=dev.id,
                last_edited_by_id=dev.id,
                position=position,
            )
        )
        note("Doc", title, True)


# ---------------------------------------------------------------------------

# ---------------------------------------------------------------- organization

#: Colleagues, so the org chart and the directory have somebody in them. The
#: workspace otherwise holds whoever signed in plus the two owners the Service
#: Desk seed adds, and a three-person chart demonstrates nothing about
#: departments, reporting lines or multi-department membership.
ORG_PEOPLE = [
    ("priya.raman@northwind.example", "Priya Raman"),
    ("marcus.bell@northwind.example", "Marcus Bell"),
    ("aiko.tanaka@northwind.example", "Aiko Tanaka"),
    ("elena.duarte@northwind.example", "Elena Duarte"),
]


async def seed_organization(db, workspace: Workspace, dev: Developer) -> None:
    """A small but complete org: departments with functions, heads, seats and
    reporting lines.

    Written through `OrganizationService` rather than as INSERTs, because
    `path`, `depth` and the uniqueness of a function key are computed there —
    a hand-built row looks right in the table and breaks the org chart.

    Departments carry **function keys** on purpose. The Service Desk decides
    who may see a ticket from the department that owns its pending-with bucket,
    so a demo workspace with no functions shows "No department" on every row of
    the queue board and every screenshot of it says the desk is misconfigured.
    """
    from aexy.schemas.organization import (
        DepartmentCreate,
        MembershipCreate,
        PositionCreate,
    )
    from aexy.services.organization_service import OrganizationService

    org = OrganizationService(db)
    people: dict[str, Developer] = {}

    for email, name in ORG_PEOPLE:
        person = (
            await db.execute(select(Developer).where(Developer.email == email))
        ).scalar_one_or_none()
        if person is None:
            person = Developer(id=str(uuid4()), email=email, name=name)
            db.add(person)
            await db.flush()
        people[name] = person

        member = (
            await db.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace.id,
                    WorkspaceMember.developer_id == person.id,
                )
            )
        ).scalar_one_or_none()
        if member is None:
            db.add(
                WorkspaceMember(
                    workspace_id=workspace.id,
                    developer_id=person.id,
                    role="member",
                    status="active",
                )
            )
        note("person", name, member is None)

    await db.flush()

    # Whoever the Service Desk seed put here, if it ran first; otherwise the
    # owner stands in, so this seeder does not depend on the order.
    def whoever(email: str) -> str:
        return by_email.get(email, dev).id

    by_email = {
        d.email: d
        for d in (
            await db.execute(
                select(Developer).join(
                    WorkspaceMember, WorkspaceMember.developer_id == Developer.id
                ).where(WorkspaceMember.workspace_id == workspace.id)
            )
        ).scalars()
    }

    existing = {d.name: d for d in await org.list_departments(workspace.id)}

    async def department(name: str, **kwargs) -> str:
        if name in existing:
            return existing[name].id
        made = await org.create_department(
            workspace.id, DepartmentCreate(name=name, **kwargs)
        )
        existing[name] = made
        note("department", name, True)
        return made.id

    ops = await department(
        "Operations",
        function_key="operations",
        description="Runs the service desk and everything downstream of it.",
        head_id=whoever("dana@northwind.example"),
        cost_center="OPS-100",
        headcount_planned=6,
        location="Mumbai",
        timezone="Asia/Kolkata",
    )
    claims = await department(
        "Claims",
        parent_id=ops,
        description="Claims intake and settlement follow-up.",
        head_id=people["Priya Raman"].id,
        cost_center="OPS-110",
        headcount_planned=3,
        location="Mumbai",
    )
    sales = await department(
        "Sales",
        function_key="sales",
        head_id=whoever("rowan@northwind.example"),
        cost_center="SAL-200",
        headcount_planned=4,
        location="London",
    )
    finance = await department(
        "Finance",
        function_key="finance",
        head_id=people["Marcus Bell"].id,
        cost_center="FIN-300",
        headcount_planned=2,
    )
    hr = await department(
        "People",
        function_key="hr",
        head_id=people["Elena Duarte"].id,
        cost_center="PPL-400",
        headcount_planned=2,
    )

    # (department, person, role, primary?) — Priya appears twice on purpose:
    # somebody splitting their time across two departments is a thing the model
    # supports and a thing nothing else in the demo data shows.
    memberships = [
        (ops, whoever("dana@northwind.example"), "head", True),
        (ops, people["Priya Raman"].id, "manager", False),
        (ops, people["Marcus Bell"].id, "member", False),
        (claims, people["Priya Raman"].id, "head", True),
        (sales, whoever("rowan@northwind.example"), "head", True),
        (sales, people["Aiko Tanaka"].id, "member", True),
        (finance, people["Marcus Bell"].id, "head", True),
        (hr, people["Elena Duarte"].id, "head", True),
        (hr, dev.id, "member", False),
    ]
    for dept_id, developer_id, role, primary in memberships:
        try:
            await org.add_member(
                workspace.id,
                dept_id,
                MembershipCreate(
                    developer_id=developer_id,
                    role_in_department=role,
                    is_primary=primary,
                ),
            )
        except HTTPException as exc:
            # 409 is "already a member", which is what a second run looks like.
            if exc.status_code != 409:
                raise

    # Open seats, so headcount planned against filled means something.
    for dept_id, title in ((claims, "Claims Analyst"), (sales, "Account Executive")):
        detail = await org.get_department(workspace.id, dept_id)
        if not any(p.title == title for p in (detail.positions or [])):
            await org.add_position(workspace.id, dept_id, PositionCreate(title=title))

    # Who reports to whom. Stored on the workspace membership, not the
    # department, because a reporting line follows the person.
    lines = [
        (people["Priya Raman"].id, whoever("dana@northwind.example")),
        (people["Marcus Bell"].id, whoever("dana@northwind.example")),
        (people["Aiko Tanaka"].id, whoever("rowan@northwind.example")),
        (whoever("dana@northwind.example"), dev.id),
        (whoever("rowan@northwind.example"), dev.id),
        (people["Elena Duarte"].id, dev.id),
    ]
    for developer_id, manager_id in lines:
        if developer_id == manager_id:
            continue
        await org.set_manager(workspace.id, developer_id, manager_id)


# --------------------------------------------------------------------- tickets

#: (title, status, priority, requester, body) — a support queue mid-week, which
#: is what the module is for: a couple untriaged, work in progress, one waiting
#: on the person who raised it, one already resolved.
DEMO_TICKETS = [
    (
        "Export to CSV times out on large boards",
        "new",
        "high",
        ("Ravi Menon", "ravi@lumenanalytics.example"),
        "Exporting a board with about 4,000 rows spins for a minute and then fails. Smaller boards are fine.",
    ),
    (
        "Invite email never arrived",
        "new",
        "medium",
        ("Sofia Ferreira", "sofia@brightpathlabs.example"),
        "Two new starters were invited on Monday and neither has had the email. Not in spam.",
    ),
    (
        "SSO login loops back to the sign-in page",
        "in_progress",
        "urgent",
        ("Tom Whitfield", "tom@northwindtraders.example"),
        "After authenticating with Okta the browser returns to /login instead of the dashboard.",
    ),
    (
        "Can we change the working week to Sunday–Thursday?",
        "waiting_on_submitter",
        "low",
        ("Layla Haddad", "layla@fieldstonelogistics.example"),
        "Our team works Sunday to Thursday. Asked for the account name so we can check the plan.",
    ),
    (
        "Attachment preview is blank for .heic images",
        "resolved",
        "medium",
        ("Ravi Menon", "ravi@lumenanalytics.example"),
        "Fixed in this week's release — previews now render, and older uploads regenerate on first view.",
    ),
]


async def seed_tickets(db, workspace: Workspace, dev: Developer) -> None:
    """A support queue for the ticketing module.

    Separate from the Service Desk's tickets on purpose. Both modules store
    rows in `tickets`, and the generic one excludes the desk by
    `source LIKE 'service_desk%'` — so a demo where the only tickets belong to
    the desk photographs an empty Tickets page, and a demo where the desk's
    tickets have no `source` photographs the same five tickets twice.
    """
    form = (
        await db.execute(
            select(TicketForm).where(
                TicketForm.workspace_id == workspace.id,
                TicketForm.slug == "support",
            )
        )
    ).scalar_one_or_none()
    if form is None:
        form = TicketForm(
            id=str(uuid4()),
            workspace_id=workspace.id,
            name="Support",
            slug="support",
            description="Product support requests from customers.",
            created_by_id=dev.id,
        )
        db.add(form)
        await db.flush()
    note("ticket form", "Support", form.created_at is None)

    seen = {
        title
        for title in (
            await db.execute(
                select(Ticket.title).where(Ticket.workspace_id == workspace.id)
            )
        ).scalars()
    }
    highest = (
        await db.execute(
            select(func.max(Ticket.ticket_number)).where(
                Ticket.workspace_id == workspace.id
            )
        )
    ).scalar() or 0

    for offset, (title, status, priority, (name, email), body) in enumerate(
        DEMO_TICKETS, start=1
    ):
        if title in seen:
            note("ticket", title, False)
            continue

        db.add(
            Ticket(
                id=str(uuid4()),
                workspace_id=workspace.id,
                form_id=form.id,
                # Continues the workspace's numbering: `uq_ticket_number` is
                # (workspace_id, ticket_number), and the desk has already used
                # the low numbers.
                ticket_number=highest + offset,
                title=title,
                submitter_name=name,
                submitter_email=email,
                field_values={"subject": title, "description": body},
                status=status,
                priority=priority,
                assignee_id=dev.id if status in {"in_progress", "resolved"} else None,
            )
        )
        note("ticket", title, True)


# ----------------------------------------------------------------------- leave

#: (name, slug, colour, paid?, quota, notice days)
LEAVE_TYPES = [
    ("Annual leave", "annual", "#3b82f6", True, 20.0, 3),
    ("Sick leave", "sick", "#ef4444", True, 10.0, 0),
    ("Unpaid leave", "unpaid", "#6b7280", False, 0.0, 7),
]

#: Public holidays. Mandatory, workspace-wide ones are also what the Service
#: Desk's breach clock stops for, so a demo with none makes the two modules look
#: unrelated when they are not.
HOLIDAYS = [
    ("New Year's Day", date(2027, 1, 1), False),
    ("Republic Day", date(2027, 1, 26), False),
    ("Holi", date(2027, 3, 22), False),
    ("Founders' Day", date(2027, 5, 14), True),
]


async def seed_leave(db, workspace: Workspace, dev: Developer) -> None:
    """Leave types, a policy each, a holiday calendar and a couple of requests.

    One request is left **pending** on purpose: an approvals queue with nothing
    in it photographs as a module nobody uses, and "there is a decision waiting
    for you" is the state the page exists for.
    """
    types: dict[str, LeaveType] = {}
    for name, slug, colour, paid, quota, notice in LEAVE_TYPES:
        found = (
            await db.execute(
                select(LeaveType).where(
                    LeaveType.workspace_id == workspace.id, LeaveType.slug == slug
                )
            )
        ).scalar_one_or_none()
        if found is None:
            found = LeaveType(
                id=str(uuid4()),
                workspace_id=workspace.id,
                name=name,
                slug=slug,
                color=colour,
                is_paid=paid,
                min_notice_days=notice,
            )
            db.add(found)
            await db.flush()
            note("leave type", name, True)
        else:
            note("leave type", name, False)
        types[slug] = found

        policy = (
            await db.execute(
                select(LeavePolicy).where(
                    LeavePolicy.workspace_id == workspace.id,
                    LeavePolicy.leave_type_id == found.id,
                )
            )
        ).scalar_one_or_none()
        if policy is None and quota:
            db.add(
                LeavePolicy(
                    id=str(uuid4()),
                    workspace_id=workspace.id,
                    leave_type_id=found.id,
                    annual_quota=quota,
                    carry_forward_enabled=slug == "annual",
                    max_carry_forward_days=5.0 if slug == "annual" else 0.0,
                )
            )

    for name, when, optional in HOLIDAYS:
        found = (
            await db.execute(
                select(Holiday).where(
                    Holiday.workspace_id == workspace.id, Holiday.date == when
                )
            )
        ).scalar_one_or_none()
        if found is None:
            db.add(
                Holiday(
                    id=str(uuid4()),
                    workspace_id=workspace.id,
                    name=name,
                    date=when,
                    is_optional=optional,
                )
            )
        note("holiday", name, found is None)

    # Balances are not implied by a policy — they are rows, created per person
    # per year. Without them the page says "no leave balances found, contact
    # your admin", which is the state a workspace is in *before* it is set up,
    # not after.
    await db.flush()
    from aexy.services.leave_balance_service import LeaveBalanceService

    balances = LeaveBalanceService(db)
    for member_id in {dev.id, *(p.id for p in [])}:
        await balances.initialize_yearly_balances(
            workspace.id, member_id, date.today().year
        )

    today = date.today()
    requests = [
        # (type, start offset, days, status, reason)
        ("annual", 21, 5, "pending", "Family wedding"),
        ("annual", -30, 3, "approved", "Long weekend"),
        ("sick", -6, 1, "approved", None),
    ]
    for slug, offset, days, status, reason in requests:
        start = today + timedelta(days=offset)
        end = start + timedelta(days=days - 1)
        found = (
            await db.execute(
                select(LeaveRequest).where(
                    LeaveRequest.workspace_id == workspace.id,
                    LeaveRequest.developer_id == dev.id,
                    LeaveRequest.start_date == start,
                )
            )
        ).scalar_one_or_none()
        if found is None:
            db.add(
                LeaveRequest(
                    id=str(uuid4()),
                    workspace_id=workspace.id,
                    developer_id=dev.id,
                    leave_type_id=types[slug].id,
                    start_date=start,
                    end_date=end,
                    total_days=float(days),
                    status=status,
                    reason=reason,
                )
            )
        note("leave request", f"{slug} from {start}", found is None)


# ------------------------------------------------------------------------ forms

#: (template, name, live?) — one of each shape the module supports, so the
#: builder and the public page have something real to show. The bug report is
#: left inactive: a form being drafted is a state the list has to be able to
#: show, and every form being live makes the active switch look decorative.
DEMO_FORMS = [
    ("lead_capture", "Talk to sales", True),
    ("feedback", "How are we doing?", True),
    ("bug_report", "Report a bug", False),
]


async def seed_forms(db, workspace: Workspace, dev: Developer) -> None:
    """Public forms, built from the module's own templates.

    Through `FormsService` rather than as inserts, because a form is a row plus
    its ordered fields plus a public token, and the template definitions are the
    thing worth photographing — a hand-built two-field form would show less than
    the product ships with.
    """
    from aexy.services.forms_service import FormsService

    forms = FormsService(db)

    for template, name, live in DEMO_FORMS:
        found = (
            await db.execute(
                select(Form).where(
                    Form.workspace_id == workspace.id, Form.name == name
                )
            )
        ).scalar_one_or_none()
        if found is not None:
            note("form", name, False)
            continue

        form = await forms.create_form_from_template(
            workspace_id=workspace.id,
            created_by_id=dev.id,
            template_type=template,
            name=name,
        )
        # `is_active`, not `is_published` — the column that decides whether the
        # public link answers is the active flag, and assigning a name the model
        # does not have is a silent no-op.
        form.is_active = live
        note("form", name, True)


# ----------------------------------------------------------------------- tables

#: A table that is not a CRM concept. The Tables module lists standalone tables
#: *and* the CRM's objects — they are the same storage seen through a different
#: lens — so a workspace whose only tables are Company, Person, Deal and Lead
#: shows nothing about what the module is for.
DEMO_TABLE_FIELDS = [
    ("Vendor", "text"),
    ("Renewal date", "date"),
    ("Annual cost", "number"),
    ("Owner", "text"),
]

DEMO_TABLE_ROWS = [
    {"vendor": "Northwind Cloud", "renewal_date": "2027-03-31", "annual_cost": 42000, "owner": "Dana"},
    {"vendor": "Assurance Mutual", "renewal_date": "2027-01-15", "annual_cost": 18500, "owner": "Marcus Bell"},
    {"vendor": "Fieldstone Freight", "renewal_date": "2026-11-30", "annual_cost": 7600, "owner": "Aiko Tanaka"},
]


async def seed_tables(db, workspace: Workspace, dev: Developer) -> None:
    """One standalone table — a contract renewal tracker — with its rows."""
    from aexy.services.data_table_service import DataTableService

    tables = DataTableService(db)
    existing = await tables.list_tables(
        workspace_id=workspace.id, scope="standalone", user_id=dev.id
    )
    if any(t.name == "Contracts" for t in existing):
        note("table", "Contracts", False)
        return

    table = await tables.create_table(
        workspace_id=workspace.id,
        name="Contracts",
        plural_name="Contracts",
        description="Vendor agreements, what they cost and when they renew.",
        icon="FileText",
        created_by_id=dev.id,
    )
    await db.flush()

    for field_name, field_type in DEMO_TABLE_FIELDS:
        await tables.add_field(
            table_id=str(table.id), name=field_name, field_type=field_type
        )
    await db.flush()

    for values in DEMO_TABLE_ROWS:
        await tables.create_record(
            table_id=str(table.id),
            workspace_id=workspace.id,
            values=values,
            created_by_id=dev.id,
        )
    note("table", "Contracts", True)


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--yes", "-y", action="store_true",
        help="actually write. Without it the script only reports its target.",
    )
    parser.add_argument(
        "--workspace",
        help=(
            "seed this workspace instead of the first developer's first one. "
            "The default picks whichever workspace happens to be oldest, which "
            "is rarely the demo one once a database has more than one."
        ),
    )
    args = parser.parse_args()

    async with async_session_maker() as db:
        dev = (
            await db.execute(
                select(Developer).where(Developer.id == PREFERRED_DEVELOPER_ID)
            )
        ).scalar_one_or_none()
        if dev is None:
            dev = (
                await db.execute(
                    select(Developer).order_by(Developer.created_at).limit(1)
                )
            ).scalar_one_or_none()
        if dev is None:
            print("No developer found — nothing to seed against.", file=sys.stderr)
            return 1

        if args.workspace:
            workspace = (
                await db.execute(
                    select(Workspace).where(Workspace.id == args.workspace)
                )
            ).scalar_one_or_none()
            if workspace is None:
                print(f"No workspace {args.workspace}.", file=sys.stderr)
                return 1
            # Act as its owner: seeded rows carry a creator, and attributing
            # them to whoever happens to be the first developer in the database
            # puts a stranger's name on every record in somebody else's
            # workspace.
            owner = (
                await db.execute(
                    select(Developer).where(Developer.id == workspace.owner_id)
                )
            ).scalar_one_or_none()
            if owner is not None:
                dev = owner
        else:
            workspace = (
                await db.execute(
                    select(Workspace)
                    .where(Workspace.owner_id == dev.id)
                    .order_by(Workspace.created_at)
                    .limit(1)
                )
            ).scalar_one_or_none()
        if workspace is None:
            print(f"Developer {dev.id} owns no workspace.", file=sys.stderr)
            return 1

        print(f"Database:  {redacted_dsn()}")
        print(f"Workspace: {workspace.name!r} ({workspace.id})")
        print(f"As:        {dev.name!r} <{dev.email}> ({dev.id})")

        if not args.yes:
            # Deliberately a hard stop, not a prompt: the documented invocation
            # is `docker exec aexy-backend python scripts/seed_marketing_demo.py`,
            # which has no TTY, so a prompt would either hang or be auto-skipped.
            print(
                "\nRefusing to write without --yes.\n"
                "This inserts fictional CRM records and ENABLED automations into "
                "the workspace above.\n"
                "Confirm that is a demo database, then re-run with --yes.",
                file=sys.stderr,
            )
            return 1

        print()
        await seed_organization(db, workspace, dev)
        await seed_tickets(db, workspace, dev)
        await seed_leave(db, workspace, dev)
        await seed_forms(db, workspace, dev)
        await seed_tables(db, workspace, dev)
        await seed_crm(db, workspace.id, dev)
        await seed_planning(db, workspace, dev)
        await seed_automations(db, workspace.id, dev)
        await seed_reviews(db, workspace.id, dev)
        await seed_docs(db, workspace.id, dev)

        await db.commit()

    print(f"Created ({len(created)}):")
    for line in created:
        print(f"  + {line}")
    print(f"\nAlready present, skipped ({len(skipped)}):")
    for line in skipped:
        print(f"  = {line}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
