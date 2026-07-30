"""Editable email templates for the Service Desk (receipt / closure / digest).

Copy is stored as ``EmailTemplate`` rows (per workspace) and rendered with the
shared ``TemplateService`` (Jinja2 ``{{var}}``). If Ops hasn't customised a
template yet, sends fall back to the built-in default without writing a row —
so nothing breaks before customisation, and editing simply upserts the row.

See ``prds/BIMAPLAN_SERVICE_DESK_PLAN.md`` §7.
"""

from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.email_marketing import EmailTemplate
from aexy.services.template_service import TemplateService

# key -> default definition. `vars` lists the placeholders (with optional defaults).
TEMPLATES: dict[str, dict] = {
    "receipt": {
        "slug": "service_desk_receipt",
        "name": "Service Desk — Receipt",
        "subject": "{{display_id}} {{subject}}",
        "body": (
            "Dear {{requester_name}},\n\n"
            "Thank you for writing to Bimaplan Operations. "
            "Your request has been logged as Ticket #{{display_id}}.\n\n"
            "Our team will review this and get back to you at the earliest. "
            "Please quote the Ticket ID in any further correspondence on this matter.\n\n"
            "Regards,\nBimaplan Operations"
        ),
        "vars": [
            {"name": "requester_name", "default": "there"},
            {"name": "display_id", "default": ""},
            {"name": "subject", "default": "Your request"},
        ],
    },
    "closure": {
        "slug": "service_desk_closure",
        "name": "Service Desk — Closure",
        "subject": "Your request has been resolved — Ticket #{{display_id}}",
        "body": (
            "Dear {{requester_name}},\n\n"
            "Your request logged under Ticket #{{display_id}} has been resolved.\n\n"
            "Resolution Summary: {{closure_note}}\n"
            "Total Time Taken: {{overall_days}} days\n\n"
            "If this does not fully address your concern, simply reply to this email "
            "and the ticket will be reopened.\n\n"
            "Regards,\nBimaplan Operations"
        ),
        "vars": [
            {"name": "requester_name", "default": "there"},
            {"name": "display_id", "default": ""},
            {"name": "closure_note", "default": "Resolved."},
            {"name": "overall_days", "default": "0"},
        ],
    },
    "digest": {
        "slug": "service_desk_digest",
        "name": "Service Desk — Daily Digest",
        "subject": "Daily Open Tickets Summary — {{date}}",
        "body": (
            "Hi {{recipient_name}},\n\n"
            "Here is today's snapshot of open tickets {{scope}}:\n"
            "Total Open: {{total_open}} | Breaching (>2 working days in current stage): {{breaching}}\n\n"
            "{{tickets_block}}\n\n"
            "Bimaplan Service Desk (auto-generated)"
        ),
        "vars": [
            {"name": "recipient_name", "default": "there"},
            {"name": "scope", "default": ""},
            {"name": "total_open", "default": "0"},
            {"name": "breaching", "default": "0"},
            {"name": "tickets_block", "default": ""},
            {"name": "date", "default": ""},
        ],
    },
}


def _transient(defn: dict) -> EmailTemplate:
    """Build an in-memory (unpersisted) template from a default definition."""
    return EmailTemplate(
        workspace_id="",
        name=defn["name"],
        slug=defn["slug"],
        template_type="code",
        category="transactional",
        subject_template=defn["subject"],
        body_html=defn["body"],
        body_text=defn["body"],
        variables=defn["vars"],
    )


async def render_sd(
    db: AsyncSession, workspace_id: str, key: str, context: dict
) -> tuple[str, str]:
    """Render (subject, text_body) for a Service Desk template key."""
    defn = TEMPLATES[key]
    ts = TemplateService(db)
    tmpl = await ts.get_template_by_slug(workspace_id, defn["slug"])
    if tmpl is None:
        tmpl = _transient(defn)  # not persisted — built-in default
    subject, html, text = ts.render_template(tmpl, context)
    return subject, (text or html)


async def list_sd_templates(db: AsyncSession, workspace_id: str) -> list[dict]:
    """Return the three templates (customised row if present, else default)."""
    ts = TemplateService(db)
    out: list[dict] = []
    for key, defn in TEMPLATES.items():
        row = await ts.get_template_by_slug(workspace_id, defn["slug"])
        out.append(
            {
                "key": key,
                "name": defn["name"],
                "subject": row.subject_template if row else defn["subject"],
                "body": (row.body_text or row.body_html) if row else defn["body"],
                "variables": [v["name"] for v in defn["vars"]],
                "customised": row is not None,
            }
        )
    return out


async def upsert_sd_template(
    db: AsyncSession, workspace_id: str, key: str, subject: str, body: str, created_by_id: str | None
) -> dict:
    """Persist an Ops edit for one template (create the row if needed)."""
    if key not in TEMPLATES:
        raise KeyError(key)
    defn = TEMPLATES[key]
    ts = TemplateService(db)
    row = await ts.get_template_by_slug(workspace_id, defn["slug"])
    if row is None:
        row = EmailTemplate(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=defn["name"],
            slug=defn["slug"],
            template_type="code",
            category="transactional",
            subject_template=subject,
            body_html=body,
            body_text=body,
            variables=defn["vars"],
            created_by_id=created_by_id,
        )
        db.add(row)
    else:
        row.subject_template = subject
        row.body_html = body
        row.body_text = body
        row.version = (row.version or 1) + 1
    await db.flush()
    return {
        "key": key,
        "name": defn["name"],
        "subject": subject,
        "body": body,
        "variables": [v["name"] for v in defn["vars"]],
        "customised": True,
    }
