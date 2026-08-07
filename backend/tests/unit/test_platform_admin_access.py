"""Platform-admin access is granted per-email, not per-workspace.

``get_platform_admin`` used to require membership in the PLATFORM_ORG_ID
workspace on top of the ADMIN_EMAILS check, which locked out admins whose
email was allowlisted but who held no seat in that org. The email list is
now the only gate; PLATFORM_ORG_ID is signup-side seeding config only.
"""

import pytest
from fastapi import HTTPException

from aexy.api import platform_admin
from aexy.models.developer import Developer


@pytest.fixture
def admin_settings(monkeypatch):
    monkeypatch.setattr(
        platform_admin.settings, "admin_emails", "root@aexy.io,Ops@Aexy.io"
    )
    # An org the test users are deliberately NOT members of.
    monkeypatch.setattr(
        platform_admin.settings, "platform_org_id", "00000000-0000-0000-0000-00000000beef"
    )


@pytest.mark.asyncio
async def test_admin_email_passes_without_platform_org_seat(admin_settings):
    dev = Developer(email="root@aexy.io", name="Root")

    assert await platform_admin.get_platform_admin(current_user=dev) is dev


@pytest.mark.asyncio
async def test_email_match_is_case_insensitive(admin_settings):
    dev = Developer(email="OPS@aexy.io", name="Ops")

    assert await platform_admin.get_platform_admin(current_user=dev) is dev


@pytest.mark.asyncio
async def test_non_admin_email_is_rejected(admin_settings):
    dev = Developer(email="user@aexy.io", name="User")

    with pytest.raises(HTTPException) as exc:
        await platform_admin.get_platform_admin(current_user=dev)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_empty_allowlist_means_nobody_is_admin(monkeypatch):
    monkeypatch.setattr(platform_admin.settings, "admin_emails", "")
    dev = Developer(email="root@aexy.io", name="Root")

    with pytest.raises(HTTPException) as exc:
        await platform_admin.get_platform_admin(current_user=dev)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_check_endpoint_reports_admin_without_org_membership(admin_settings):
    dev = Developer(email="root@aexy.io", name="Root")

    res = await platform_admin.check_admin_status(current_user=dev)

    assert res.is_admin is True
    # Org ID is still surfaced for frontend context, it just doesn't gate.
    assert res.platform_org_id == "00000000-0000-0000-0000-00000000beef"


@pytest.mark.asyncio
async def test_check_endpoint_reports_non_admin(admin_settings):
    dev = Developer(email="user@aexy.io", name="User")

    res = await platform_admin.check_admin_status(current_user=dev)

    assert res.is_admin is False
