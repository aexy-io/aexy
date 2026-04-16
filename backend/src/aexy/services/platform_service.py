"""Platform organization service — auto-CRM contact + onboarding drip on signup."""

import logging
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.models.crm import CRMObject, CRMObjectType, CRMAttributeType, CRMRecord, CRMAttribute
from aexy.models.email_marketing import EmailTemplate, OnboardingFlow

logger = logging.getLogger(__name__)

settings = get_settings()

# ============================================================================
# Lifecycle stage options for the Person object
# ============================================================================

LIFECYCLE_STAGES = [
    {"value": "signed_up", "label": "Signed Up", "color": "#6B7280"},
    {"value": "onboarding", "label": "Onboarding", "color": "#3B82F6"},
    {"value": "activated", "label": "Activated", "color": "#8B5CF6"},
    {"value": "active", "label": "Active", "color": "#10B981"},
    {"value": "paying", "label": "Paying", "color": "#F59E0B"},
    {"value": "at_risk", "label": "At Risk", "color": "#F97316"},
    {"value": "churned", "label": "Churned", "color": "#EF4444"},
]

# ============================================================================
# Email template definitions
# ============================================================================

FRONTEND_URL = settings.frontend_url or "https://app.aexy.io"

EMAIL_TEMPLATES = [
    {
        "slug": "platform-welcome",
        "name": "Platform Welcome",
        "subject": "Welcome to Aexy, {{first_name}}!",
        "body_html": f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                     background-color: #f3f4f6; margin: 0; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white;
                        border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="background-color: #0f172a; padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">Aexy</h1>
                </div>
                <div style="padding: 30px;">
                    <h2 style="color: #1f2937; margin: 0 0 15px 0; font-size: 20px;">Welcome aboard! 🎉</h2>
                    <p style="color: #4b5563; line-height: 1.6; margin: 0 0 15px 0;">
                        Hi {{{{first_name}}}},
                    </p>
                    <p style="color: #4b5563; line-height: 1.6; margin: 0 0 15px 0;">
                        Thanks for signing up for Aexy — the open-source Engineering OS.
                        We're excited to have you on board.
                    </p>
                    <p style="color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
                        To get the most out of Aexy, start by connecting your GitHub repositories
                        and inviting your team. From there, you'll get instant insights into
                        your engineering velocity, code health, and team activity.
                    </p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{FRONTEND_URL}/dashboard"
                           style="background-color: #0891b2; color: white; padding: 12px 24px;
                                  text-decoration: none; border-radius: 6px; font-weight: 500;">
                            Go to Dashboard
                        </a>
                    </div>
                </div>
                <div style="background-color: #f9fafb; padding: 20px; text-align: center;
                            border-top: 1px solid #e5e7eb;">
                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        You're receiving this because you signed up for Aexy.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """,
        "delay": 0,
    },
    {
        "slug": "platform-getting-started",
        "name": "Getting Started",
        "subject": "3 things to try in Aexy today",
        "body_html": f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                     background-color: #f3f4f6; margin: 0; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white;
                        border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="background-color: #0f172a; padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">Aexy</h1>
                </div>
                <div style="padding: 30px;">
                    <h2 style="color: #1f2937; margin: 0 0 15px 0; font-size: 20px;">3 things to try today</h2>
                    <p style="color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
                        Here are the quickest ways to get value from Aexy:
                    </p>
                    <div style="margin-bottom: 20px;">
                        <p style="color: #1f2937; font-weight: 600; margin: 0 0 5px 0;">1. Connect a GitHub repo</p>
                        <p style="color: #4b5563; line-height: 1.6; margin: 0 0 15px 0;">
                            Link your repositories to get automated commit analysis, PR reviews, and developer insights.
                        </p>
                    </div>
                    <div style="margin-bottom: 20px;">
                        <p style="color: #1f2937; font-weight: 600; margin: 0 0 5px 0;">2. Create your first sprint</p>
                        <p style="color: #4b5563; line-height: 1.6; margin: 0 0 15px 0;">
                            Plan and track your team's work with sprint boards, burndown charts, and velocity tracking.
                        </p>
                    </div>
                    <div style="margin-bottom: 20px;">
                        <p style="color: #1f2937; font-weight: 600; margin: 0 0 5px 0;">3. Explore the CRM</p>
                        <p style="color: #4b5563; line-height: 1.6; margin: 0 0 15px 0;">
                            Track contacts, companies, and deals — all integrated with your engineering workflow.
                        </p>
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{FRONTEND_URL}/settings/integrations"
                           style="background-color: #0891b2; color: white; padding: 12px 24px;
                                  text-decoration: none; border-radius: 6px; font-weight: 500;">
                            Connect GitHub
                        </a>
                    </div>
                </div>
                <div style="background-color: #f9fafb; padding: 20px; text-align: center;
                            border-top: 1px solid #e5e7eb;">
                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        You're receiving this because you signed up for Aexy.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """,
        "delay": 86400,  # 1 day
    },
    {
        "slug": "platform-feature-highlight",
        "name": "Feature Highlight",
        "subject": "Features you haven't tried yet",
        "body_html": f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                     background-color: #f3f4f6; margin: 0; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white;
                        border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="background-color: #0f172a; padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">Aexy</h1>
                </div>
                <div style="padding: 30px;">
                    <h2 style="color: #1f2937; margin: 0 0 15px 0; font-size: 20px;">Features worth exploring</h2>
                    <p style="color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
                        Aexy is more than just analytics. Here are some powerful features you might not have discovered yet:
                    </p>
                    <div style="margin-bottom: 20px;">
                        <p style="color: #1f2937; font-weight: 600; margin: 0 0 5px 0;">AI Agents</p>
                        <p style="color: #4b5563; line-height: 1.6; margin: 0 0 15px 0;">
                            Build custom AI agents that automate code reviews, triage issues, and generate documentation.
                        </p>
                    </div>
                    <div style="margin-bottom: 20px;">
                        <p style="color: #1f2937; font-weight: 600; margin: 0 0 5px 0;">Workflow Automation</p>
                        <p style="color: #4b5563; line-height: 1.6; margin: 0 0 15px 0;">
                            Set up triggers and actions to automate repetitive tasks — from Slack notifications to CRM updates.
                        </p>
                    </div>
                    <div style="margin-bottom: 20px;">
                        <p style="color: #1f2937; font-weight: 600; margin: 0 0 5px 0;">Email Marketing</p>
                        <p style="color: #4b5563; line-height: 1.6; margin: 0 0 15px 0;">
                            Create campaigns with the built-in drag-and-drop editor. Track opens, clicks, and engagement.
                        </p>
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{FRONTEND_URL}/agents"
                           style="background-color: #0891b2; color: white; padding: 12px 24px;
                                  text-decoration: none; border-radius: 6px; font-weight: 500;">
                            Explore AI Agents
                        </a>
                    </div>
                </div>
                <div style="background-color: #f9fafb; padding: 20px; text-align: center;
                            border-top: 1px solid #e5e7eb;">
                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        You're receiving this because you signed up for Aexy.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """,
        "delay": 259200,  # 3 days
    },
    {
        "slug": "platform-check-in",
        "name": "Check-in",
        "subject": "How's it going, {{first_name}}?",
        "body_html": f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                     background-color: #f3f4f6; margin: 0; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white;
                        border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="background-color: #0f172a; padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">Aexy</h1>
                </div>
                <div style="padding: 30px;">
                    <h2 style="color: #1f2937; margin: 0 0 15px 0; font-size: 20px;">How's it going?</h2>
                    <p style="color: #4b5563; line-height: 1.6; margin: 0 0 15px 0;">
                        Hi {{{{first_name}}}},
                    </p>
                    <p style="color: #4b5563; line-height: 1.6; margin: 0 0 15px 0;">
                        You've been using Aexy for about a week now. We'd love to hear how things are going!
                    </p>
                    <p style="color: #4b5563; line-height: 1.6; margin: 0 0 15px 0;">
                        If you have any questions, feedback, or feature requests, just reply to this email
                        or reach out on GitHub — we read every message.
                    </p>
                    <p style="color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
                        Happy building!<br>
                        — The Aexy Team
                    </p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{FRONTEND_URL}/dashboard"
                           style="background-color: #0891b2; color: white; padding: 12px 24px;
                                  text-decoration: none; border-radius: 6px; font-weight: 500;">
                            Open Aexy
                        </a>
                    </div>
                </div>
                <div style="background-color: #f9fafb; padding: 20px; text-align: center;
                            border-top: 1px solid #e5e7eb;">
                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        You're receiving this because you signed up for Aexy.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """,
        "delay": 604800,  # 7 days
    },
]


class PlatformService:
    """Manages platform-level CRM contacts and onboarding for new signups."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # IDEMPOTENT SETUP (called at startup + safety-net in activity)
    # =========================================================================

    async def ensure_platform_setup(self) -> None:
        """Ensure the platform org has CRM objects, lifecycle attribute, templates, and flow."""
        workspace_id = settings.platform_org_id
        if not workspace_id:
            return

        # 1. Verify workspace exists
        from aexy.models.workspace import Workspace
        workspace = (await self.db.execute(
            select(Workspace).where(Workspace.id == workspace_id)
        )).scalar_one_or_none()
        if not workspace:
            logger.error(f"Platform org workspace {workspace_id} not found — skipping setup")
            return

        # 2. Seed standard CRM objects if Person is missing
        person_obj = (await self.db.execute(
            select(CRMObject).where(
                CRMObject.workspace_id == workspace_id,
                CRMObject.object_type == CRMObjectType.PERSON.value,
            )
        )).scalar_one_or_none()

        if not person_obj:
            from aexy.services.crm_service import CRMObjectService
            obj_service = CRMObjectService(self.db)
            objects = await obj_service.seed_standard_objects(workspace_id)
            person_obj = next(o for o in objects if o.object_type == CRMObjectType.PERSON.value)
            logger.info("Seeded standard CRM objects for platform org")

        # 3. Add lifecycle_stage STATUS attribute if missing
        existing_attr = (await self.db.execute(
            select(CRMAttribute).where(
                CRMAttribute.object_id == person_obj.id,
                CRMAttribute.slug == "lifecycle-stage",
            )
        )).scalar_one_or_none()

        if not existing_attr:
            from aexy.services.crm_service import CRMAttributeService
            attr_service = CRMAttributeService(self.db)
            await attr_service.create_attribute(
                object_id=person_obj.id,
                name="Lifecycle Stage",
                attribute_type=CRMAttributeType.STATUS.value,
                slug="lifecycle-stage",
                config={"options": LIFECYCLE_STAGES},
            )
            logger.info("Added lifecycle_stage attribute to Person object")

        # 4. Seed email templates (idempotent via slug uniqueness)
        for tmpl in EMAIL_TEMPLATES:
            existing = (await self.db.execute(
                select(EmailTemplate).where(
                    EmailTemplate.workspace_id == workspace_id,
                    EmailTemplate.slug == tmpl["slug"],
                )
            )).scalar_one_or_none()
            if not existing:
                self.db.add(EmailTemplate(
                    id=str(uuid4()),
                    workspace_id=workspace_id,
                    name=tmpl["name"],
                    slug=tmpl["slug"],
                    subject_template=tmpl["subject"],
                    body_html=tmpl["body_html"],
                    body_text="",
                    category="onboarding",
                    variables=[
                        {"name": "first_name", "type": "string", "default": "there", "required": False},
                    ],
                ))
        await self.db.flush()
        logger.info("Email templates seeded for platform org")

        # 5. Seed onboarding flow (idempotent via slug uniqueness)
        existing_flow = (await self.db.execute(
            select(OnboardingFlow).where(
                OnboardingFlow.workspace_id == workspace_id,
                OnboardingFlow.slug == "platform-welcome",
            )
        )).scalar_one_or_none()

        if not existing_flow:
            steps = []
            for i, tmpl in enumerate(EMAIL_TEMPLATES):
                steps.append({
                    "id": f"step_{i}",
                    "type": "email",
                    "name": tmpl["name"],
                    "delay": tmpl["delay"],
                    "config": {
                        "subject": tmpl["subject"],
                        "body": tmpl["body_html"],
                        "template_slug": tmpl["slug"],
                    },
                })

            self.db.add(OnboardingFlow(
                id=str(uuid4()),
                workspace_id=workspace_id,
                name="Platform Welcome Sequence",
                slug="platform-welcome",
                description="Automated welcome drip for new signups",
                is_active=True,
                auto_start=True,
                steps=steps,
                delay_between_steps=86400,
            ))
            await self.db.flush()
            logger.info("Onboarding flow seeded for platform org")

        logger.info("Platform org setup complete")

    # =========================================================================
    # SIGNUP CONTACT CREATION
    # =========================================================================

    async def create_signup_contact(
        self,
        developer_id: str,
        email: str,
        name: str | None,
        avatar_url: str | None,
        signup_provider: str,
    ) -> CRMRecord | None:
        """Create a CRM Person record for a new signup. Idempotent by email."""
        workspace_id = settings.platform_org_id
        if not workspace_id:
            return None

        # Find Person object
        person_obj = (await self.db.execute(
            select(CRMObject).where(
                CRMObject.workspace_id == workspace_id,
                CRMObject.object_type == CRMObjectType.PERSON.value,
            )
        )).scalar_one_or_none()

        if not person_obj:
            logger.warning("Person CRM object not found in platform org")
            return None

        # Dedup by email — check existing records
        from sqlalchemy import cast, String
        existing = (await self.db.execute(
            select(CRMRecord).where(
                CRMRecord.object_id == person_obj.id,
                CRMRecord.workspace_id == workspace_id,
                cast(CRMRecord.values["email"].astext, String) == email,
            )
        )).scalar_one_or_none()

        if existing:
            logger.info(f"CRM contact already exists for {email}")
            return existing

        # Split name
        first_name = ""
        last_name = ""
        if name:
            parts = name.split(" ", 1)
            first_name = parts[0]
            last_name = parts[1] if len(parts) > 1 else ""

        record = CRMRecord(
            id=str(uuid4()),
            workspace_id=workspace_id,
            object_id=person_obj.id,
            values={
                "first-name": first_name,
                "last-name": last_name,
                "email": email,
                "lifecycle-stage": "signed_up",
            },
            display_name=name or email,
            source="signup",
        )
        self.db.add(record)
        await self.db.flush()

        logger.info(f"Created CRM contact for {email} (provider={signup_provider})")
        return record

    # =========================================================================
    # ONBOARDING TRIGGER
    # =========================================================================

    async def start_signup_onboarding(self, developer_id: str) -> dict:
        """Start the welcome onboarding flow for a new signup."""
        workspace_id = settings.platform_org_id
        if not workspace_id:
            return {"status": "skipped", "reason": "no platform_org_id"}

        from aexy.services.onboarding_service import OnboardingService
        onboarding = OnboardingService(self.db)
        result = await onboarding.handle_user_event(
            workspace_id=workspace_id,
            user_id=developer_id,
            event_type="user.first_login",
        )
        logger.info(f"Onboarding triggered for developer {developer_id}: {result}")
        return result
