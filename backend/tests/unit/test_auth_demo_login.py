"""Tests for demo sign-in (/auth/demo/status, /auth/demo/login).

The only way into a self-hosted install that has no OAuth app registered, so
the interesting cases are the ones where it should refuse: flag off, blank
password (a misconfiguration, not an invitation), and wrong credentials.

`aexy.api.auth` binds `settings` at import, so the tests monkeypatch that
object — monkeypatch restores the attributes afterwards, which matters because
`get_settings()` is `lru_cache`d and therefore shared across the whole run.
"""

import pytest
from sqlalchemy import select

from aexy.api import auth as auth_module
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace, WorkspaceMember

DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "aexy-demo"


@pytest.fixture
def demo_enabled(monkeypatch):
    monkeypatch.setattr(auth_module.settings, "demo_login_enabled", True)
    monkeypatch.setattr(auth_module.settings, "demo_login_email", DEMO_EMAIL)
    monkeypatch.setattr(auth_module.settings, "demo_login_password", DEMO_PASSWORD)


@pytest.fixture
def demo_disabled(monkeypatch):
    monkeypatch.setattr(auth_module.settings, "demo_login_enabled", False)


@pytest.mark.asyncio
async def test_status_reports_disabled_by_default(client, demo_disabled):
    resp = await client.get("/api/v1/auth/demo/status")
    assert resp.status_code == 200
    assert resp.json() == {"enabled": False, "email": None}


@pytest.mark.asyncio
async def test_status_reports_the_email_but_never_the_password(client, demo_enabled):
    resp = await client.get("/api/v1/auth/demo/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["enabled"] is True
    assert body["email"] == DEMO_EMAIL
    assert DEMO_PASSWORD not in resp.text


@pytest.mark.asyncio
async def test_login_is_404_when_disabled(client, demo_disabled):
    resp = await client.post(
        "/api/v1/auth/demo/login",
        json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_blank_password_disables_login_even_with_the_flag_on(
    client, monkeypatch
):
    monkeypatch.setattr(auth_module.settings, "demo_login_enabled", True)
    monkeypatch.setattr(auth_module.settings, "demo_login_email", DEMO_EMAIL)
    monkeypatch.setattr(auth_module.settings, "demo_login_password", "")

    assert (await client.get("/api/v1/auth/demo/status")).json()["enabled"] is False
    resp = await client.post(
        "/api/v1/auth/demo/login", json={"email": DEMO_EMAIL, "password": ""}
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_login_rejects_a_wrong_password(client, demo_enabled):
    resp = await client.post(
        "/api/v1/auth/demo/login",
        json={"email": DEMO_EMAIL, "password": "not-the-password"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_rejects_a_wrong_email(client, demo_enabled):
    resp = await client.post(
        "/api/v1/auth/demo/login",
        json={"email": "someone@else.test", "password": DEMO_PASSWORD},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_provisions_the_account_and_returns_a_token(
    client, db_session, demo_enabled
):
    resp = await client.post(
        "/api/v1/auth/demo/login",
        json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]

    developer = (
        await db_session.execute(
            select(Developer).where(Developer.email == DEMO_EMAIL)
        )
    ).scalar_one()
    workspace = (
        await db_session.execute(
            select(Workspace).where(Workspace.owner_id == developer.id)
        )
    ).scalar_one()
    # Owner is what grants access to every module without an access profile,
    # so a fresh demo workspace has the whole OS on rather than an empty
    # sidebar.
    member = (
        await db_session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace.id,
                WorkspaceMember.developer_id == developer.id,
            )
        )
    ).scalar_one()
    assert member.role == "owner"
    assert member.status == "active"


@pytest.mark.asyncio
async def test_login_twice_reuses_the_same_account(client, db_session, demo_enabled):
    payload = {"email": DEMO_EMAIL, "password": DEMO_PASSWORD}
    first = await client.post("/api/v1/auth/demo/login", json=payload)
    second = await client.post("/api/v1/auth/demo/login", json=payload)
    assert first.status_code == 200 and second.status_code == 200

    developers = (
        await db_session.execute(
            select(Developer).where(Developer.email == DEMO_EMAIL)
        )
    ).scalars().all()
    workspaces = (await db_session.execute(select(Workspace))).scalars().all()
    assert len(developers) == 1
    assert len(workspaces) == 1


@pytest.mark.asyncio
async def test_email_match_is_case_insensitive(client, demo_enabled):
    resp = await client.post(
        "/api/v1/auth/demo/login",
        json={"email": "  Demo@Example.Com  ", "password": DEMO_PASSWORD},
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_demo_token_can_load_its_own_profile(client, demo_enabled):
    """The regression that a token alone does not catch.

    `DeveloperResponse.email` is an `EmailStr`, and pydantic rejects reserved
    TLDs — so a demo address like `demo@aexy.local` signs in fine and then 500s
    the first call the app shell makes. Sign-in is only useful if `/developers/me`
    survives whatever `AEXY_DEMO_EMAIL` is set to.
    """
    token = (
        await client.post(
            "/api/v1/auth/demo/login",
            json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
        )
    ).json()["access_token"]

    resp = await client.get(
        "/api/v1/developers/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["email"] == DEMO_EMAIL


@pytest.mark.asyncio
async def test_the_shipped_default_email_is_a_valid_address():
    """The default in config.py must survive EmailStr, not just the test value."""
    from pydantic import TypeAdapter
    from pydantic.networks import EmailStr

    from aexy.core.config import Settings

    default = Settings.model_fields["demo_login_email"].default
    TypeAdapter(EmailStr).validate_python(default)


# --------------------------------------------------------------------------- #
# Email and AI stay off
# --------------------------------------------------------------------------- #
# The demo account is a workspace owner, so it can reach the settings that turn
# these back on. Provisioning therefore re-asserts them on every sign-in rather
# than writing them once — these tests are about the re-assertion, not just the
# initial state.


@pytest.mark.asyncio
async def test_ai_is_disabled_for_the_demo_workspace(client, db_session, demo_enabled):
    from aexy.models.workspace_ai_settings import WorkspaceAISettings

    await client.post(
        "/api/v1/auth/demo/login",
        json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
    )
    row = (
        await db_session.execute(select(WorkspaceAISettings))
    ).scalar_one()
    assert row.ai_enabled is False


@pytest.mark.asyncio
async def test_ai_is_switched_back_off_on_the_next_sign_in(
    client, db_session, demo_enabled
):
    from aexy.models.workspace_ai_settings import WorkspaceAISettings

    payload = {"email": DEMO_EMAIL, "password": DEMO_PASSWORD}
    await client.post("/api/v1/auth/demo/login", json=payload)

    # The demo user is an owner; simulate them turning AI back on.
    row = (await db_session.execute(select(WorkspaceAISettings))).scalar_one()
    row.ai_enabled = True
    await db_session.commit()

    await client.post("/api/v1/auth/demo/login", json=payload)
    await db_session.refresh(row)
    assert row.ai_enabled is False


@pytest.mark.asyncio
async def test_sending_apps_are_disabled_for_the_demo_workspace(
    client, db_session, demo_enabled
):
    from aexy.services.demo_login_service import DEMO_DISABLED_APPS

    await client.post(
        "/api/v1/auth/demo/login",
        json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
    )
    workspace = (await db_session.execute(select(Workspace))).scalar_one()
    app_settings = (workspace.settings or {}).get("app_settings", {})
    assert set(DEMO_DISABLED_APPS) <= app_settings.keys()
    assert all(app_settings[app] is False for app in DEMO_DISABLED_APPS)
    # email_marketing is the one that sends; agents is the one that spends.
    assert "email_marketing" in DEMO_DISABLED_APPS
    assert "agents" in DEMO_DISABLED_APPS


@pytest.mark.asyncio
async def test_disabled_apps_are_switched_back_off_on_the_next_sign_in(
    client, db_session, demo_enabled
):
    payload = {"email": DEMO_EMAIL, "password": DEMO_PASSWORD}
    await client.post("/api/v1/auth/demo/login", json=payload)

    workspace = (await db_session.execute(select(Workspace))).scalar_one()
    workspace.settings = {"app_settings": {"email_marketing": True, "agents": True}}
    await db_session.commit()

    await client.post("/api/v1/auth/demo/login", json=payload)
    await db_session.refresh(workspace)
    app_settings = workspace.settings["app_settings"]
    assert app_settings["email_marketing"] is False
    assert app_settings["agents"] is False


@pytest.mark.asyncio
async def test_other_app_settings_are_left_alone(client, db_session, demo_enabled):
    payload = {"email": DEMO_EMAIL, "password": DEMO_PASSWORD}
    await client.post("/api/v1/auth/demo/login", json=payload)

    workspace = (await db_session.execute(select(Workspace))).scalar_one()
    workspace.settings = {
        "app_settings": {"uptime": False},
        "something_else": {"kept": True},
    }
    await db_session.commit()

    await client.post("/api/v1/auth/demo/login", json=payload)
    await db_session.refresh(workspace)
    # The operator's own choice survives, and so does unrelated settings data.
    assert workspace.settings["app_settings"]["uptime"] is False
    assert workspace.settings["app_settings"]["email_marketing"] is False
    assert workspace.settings["something_else"] == {"kept": True}


def test_outbound_email_is_blocked_on_a_demo_deployment():
    from aexy.core.config import Settings
    from aexy.services.demo_login_service import outbound_email_blocked

    demo = Settings(AEXY_DEMO_LOGIN=True)
    assert outbound_email_blocked(demo) is True

    # The documented escape hatch, for a demo box pointed at a local Mailpit.
    allowed = Settings(AEXY_DEMO_LOGIN=True, AEXY_DEMO_ALLOW_OUTBOUND_EMAIL=True)
    assert outbound_email_blocked(allowed) is False

    # And nothing at all changes for a deployment that is not a demo.
    assert outbound_email_blocked(Settings(AEXY_DEMO_LOGIN=False)) is False
