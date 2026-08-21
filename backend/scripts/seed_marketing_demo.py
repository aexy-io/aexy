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

from sqlalchemy import func, select  # noqa: E402

from aexy.core.database import async_session_maker  # noqa: E402
from aexy.models.crm import CRMAttribute, CRMAutomation, CRMObject, CRMRecord  # noqa: E402
from aexy.models.developer import Developer  # noqa: E402
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
from aexy.models.workspace import Workspace  # noqa: E402

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

async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--yes", "-y", action="store_true",
        help="actually write. Without it the script only reports its target.",
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
