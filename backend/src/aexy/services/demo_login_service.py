"""The shared demo account, and the only sign-in that needs no OAuth app.

Every provider flow in `api/auth.py` requires the operator to go and register
an application with GitHub, Google or Microsoft first. That is fine for the
hosted product and wrong for a fresh clone: `docker compose up -d` would bring
the whole OS up and then stop at a sign-in screen nobody could get past.

So one account, provisioned on demand, whose password comes from the
environment. It is deliberately shared and deliberately not a general
password-auth system — there is no password column on `Developer` and no
registration path here. `settings.demo_login_enabled` gates the whole thing and
defaults to off; an empty `demo_login_password` disables it even when the flag
is on, so a misconfigured deployment fails closed rather than open.

`scripts/seed_demo_workspace.py` calls `ensure_demo_account` too, so the
account the seeder fills is the same one the endpoint signs you into.
"""

import logging
import secrets
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import Settings
from aexy.models.dashboard import DashboardPreferences
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace, WorkspaceMember

logger = logging.getLogger(__name__)

# Fixed so re-provisioning is idempotent, and all-hex-letters on purpose.
# SQLAlchemy's non-native `Uuid` stores CHAR(32) with the hyphens stripped, and
# SQLite's numeric affinity then reads an all-digit id like
# "11111111-1111-1111-1111-111111111111" back as a float — which is what the
# test suite runs on. Letters cannot be mistaken for a number.
DEMO_DEVELOPER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
DEMO_WORKSPACE_NAME = "Demo Workspace"
DEMO_DEVELOPER_NAME = "Demo User"


def demo_login_available(settings: Settings) -> bool:
    """Is password sign-in to the demo account switched on *and* usable?

    A blank password with the flag on is a configuration mistake, not a request
    for passwordless access.
    """
    return bool(settings.demo_login_enabled and settings.demo_login_password)


def demo_credentials_match(email: str, password: str, settings: Settings) -> bool:
    """Constant-time check of a submitted demo credential pair."""
    if not demo_login_available(settings):
        return False
    email_ok = email.strip().casefold() == settings.demo_login_email.strip().casefold()
    # Compare the password either way so a wrong email and a wrong password
    # cost the same.
    password_ok = secrets.compare_digest(password, settings.demo_login_password)
    return email_ok and password_ok


async def ensure_demo_account(
    db: AsyncSession,
    email: str,
    *,
    commit: bool = True,
) -> tuple[Developer, Workspace]:
    """Return the demo developer and workspace, creating what is missing.

    Idempotent, and safe to call on every sign-in: everything is looked up
    before it is written. The owner `WorkspaceMember` is what grants access —
    `app_access_service` lets owners reach every module without any access
    profile being configured — and `_ensure_full_sidebar` is what makes the
    navigation agree with that.
    """
    developer = (
        await db.execute(select(Developer).where(Developer.id == DEMO_DEVELOPER_ID))
    ).scalar_one_or_none()
    if developer is None:
        # An operator who seeded by hand, or changed AEXY_DEMO_EMAIL after the
        # first run, may already have the account under a different id.
        developer = (
            await db.execute(select(Developer).where(Developer.email == email))
        ).scalar_one_or_none()
    if developer is None:
        developer = Developer(
            id=DEMO_DEVELOPER_ID,
            name=DEMO_DEVELOPER_NAME,
            email=email,
            has_completed_onboarding=True,
        )
        db.add(developer)
        await db.flush()
        logger.info("Provisioned demo developer %s", developer.id)
    elif developer.email != email:
        # AEXY_DEMO_EMAIL changed since the account was provisioned. Follow it,
        # or the row keeps an address the config no longer names — and if the
        # old one was rejected by `DeveloperResponse`'s `EmailStr` (a reserved
        # TLD like .local), fixing the config would otherwise not fix the
        # account.
        logger.info(
            "Demo account email moving from %s to %s", developer.email, email
        )
        developer.email = email
        await db.flush()

    workspace = (
        await db.execute(
            select(Workspace)
            .where(Workspace.owner_id == developer.id)
            .order_by(Workspace.created_at)
            .limit(1)
        )
    ).scalars().first()
    if workspace is None:
        # Through the real service, not hand-built rows: `create_workspace`
        # resolves a unique slug, adds the owner member with the billing fields
        # set, seeds the default task statuses the sprint board draws its
        # columns from, and creates the default document space. A demo
        # workspace assembled by hand is missing all of that and looks broken
        # in exactly the modules a visitor opens first.
        from aexy.services.workspace_service import WorkspaceService

        workspace = await WorkspaceService(db).create_workspace(
            name=DEMO_WORKSPACE_NAME,
            owner_id=developer.id,
            description="Fictional data, for trying Aexy out.",
        )
        logger.info("Provisioned demo workspace %s", workspace.id)

    member = (
        await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace.id,
                WorkspaceMember.developer_id == developer.id,
            )
        )
    ).scalar_one_or_none()
    if member is None:
        # Only reachable when the developer already owned a workspace without
        # being a member of it — `create_workspace` adds the row itself.
        db.add(
            WorkspaceMember(
                id=str(uuid4()),
                workspace_id=workspace.id,
                developer_id=developer.id,
                role="owner",
                status="active",
            )
        )
        await db.flush()

    await _ensure_full_sidebar(db, developer.id)
    await _ensure_ai_disabled(db, workspace.id)

    if commit:
        await db.commit()
    return developer, workspace


async def _ensure_full_sidebar(db: AsyncSession, developer_id: str) -> None:
    """Put the demo account on the sidebar view that shows every module.

    `useSidebarPersona` resolves the view from an explicit `sidebar_persona`,
    then the person's primary department, then `"developer"`. The demo account
    has no department, so it lands on the developer view — a sidebar with no
    CRM, no GTM, no Service Desk. The demo would then open on a fifth of the
    product while the CRM the homepage leads with looked like it wasn't there
    (the page itself was reachable; only the navigation hid it).

    "admin" is the view that turns curation off, and the frontend only honours
    it for someone the access resolver calls an admin — which an owner is.
    """
    prefs = (
        await db.execute(
            select(DashboardPreferences).where(
                DashboardPreferences.developer_id == developer_id
            )
        )
    ).scalar_one_or_none()
    if prefs is None:
        db.add(
            DashboardPreferences(
                id=str(uuid4()),
                developer_id=developer_id,
                preset_type="admin",
                sidebar_persona="admin",
            )
        )
        await db.flush()
    elif prefs.sidebar_persona is None:
        # Never overwrite a view the operator picked while poking around.
        prefs.sidebar_persona = "admin"
        await db.flush()


async def _ensure_ai_disabled(db: AsyncSession, workspace_id: str) -> None:
    """Hold the workspace AI kill switch off.

    `WorkspaceAISettings.ai_enabled` is the product's own switch and the LLM
    gateway resolves through it for every path — request handlers, agents and
    Temporal activities alike — so this is what actually stops spend rather than
    just hiding the buttons.

    Re-asserted on every sign-in, and that is the point: the demo account is an
    owner and can turn AI back on from Settings, so a one-time write at
    provisioning would only be off until somebody clicked. Anything the operator
    configured deliberately (their own provider, their own key) is left intact —
    only `ai_enabled` is forced.
    """
    from aexy.models.workspace_ai_settings import WorkspaceAISettings

    row = (
        await db.execute(
            select(WorkspaceAISettings).where(
                WorkspaceAISettings.workspace_id == workspace_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        db.add(
            WorkspaceAISettings(
                id=str(uuid4()),
                workspace_id=workspace_id,
                ai_enabled=False,
            )
        )
        await db.flush()
        logger.info("Demo workspace %s: AI disabled", workspace_id)
    elif row.ai_enabled:
        row.ai_enabled = False
        await db.flush()
        logger.info("Demo workspace %s: AI switched back off", workspace_id)


def outbound_email_blocked(settings: Settings) -> bool:
    """Should this deployment refuse to send mail?

    A deployment with demo login on is a demo: one shared account, its password
    published, and anyone who signs in inherits an owner's reach. If that
    deployment also has SES, SMTP or Postmark credentials — and a public demo
    box plausibly does, for its own notifications — then a visitor can send mail
    from the operator's domain to any address they like. Campaign sending makes
    that a bulk capability.

    So it is refused at the two send paths rather than left to whether the
    operator remembered not to configure a provider. `AEXY_DEMO_ALLOW_OUTBOUND_EMAIL`
    is the way out for an operator who does want a demo box that mails — for
    instance one pointed at a local Mailpit.

    Nothing here fires on a normal deployment: `demo_login_enabled` is false by
    default and `docker-compose.prod.yml` never sets it.
    """
    return bool(settings.demo_login_enabled and not settings.demo_allow_outbound_email)


def demo_workspace_ai_locked(settings: Settings, workspace: Workspace) -> bool:
    """May AI be switched back on for this workspace?

    Re-asserting the kill switch at sign-in is not enough on its own. The demo
    account is shared: one visitor turning AI on in Settings leaves it on for
    everybody else until the next sign-in re-asserts it, and every session in
    between spends the operator's credential. So the write is refused rather
    than merely undone afterwards.

    Scoped to the demo workspace, not to the deployment — someone who signs in
    through OAuth on the same install still configures their own workspaces
    normally.
    """
    return bool(
        settings.demo_login_enabled
        and str(workspace.owner_id) == DEMO_DEVELOPER_ID
    )
