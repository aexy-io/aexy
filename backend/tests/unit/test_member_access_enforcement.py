"""Unit tests for per-member access enforcement on the API.

Member access used to be enforced nowhere: the sidebar hid an app the person's
profile didn't grant and the API answered for it anyway, so access control was a
navigation filter that a kept URL walked straight through. These tests pin the
guard behaviour that closes it — including the deliberate exceptions, which are
the part most likely to be "tidied up" later by someone who doesn't know why
they're there.
"""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from aexy.api.access_guard import (
    ensure_app_enabled,
    ensure_member_app_access,
    require_app_access,
)
from aexy.services.app_access_service import (
    AppAccessService,
    clear_app_settings_cache,
    clear_effective_access_cache,
)


@pytest.fixture(autouse=True)
def _clear_caches():
    clear_app_settings_cache()
    clear_effective_access_cache()
    yield
    clear_app_settings_cache()
    clear_effective_access_cache()


def _patch_access(monkeypatch, *, apps, workspace_settings=None, is_admin=False):
    """Stub resolution for any AppAccessService instance.

    The guards construct their own instance, so this patches the class.
    """
    async def fake_get_effective_access(_self, _ws, _dev, use_cache=True):
        return {
            "apps": apps,
            "applied_template_id": None,
            "applied_template_name": None,
            "has_custom_overrides": False,
            "is_admin": is_admin,
            "baseline": "department",
            "departments": [],
            "suggested_persona": None,
        }

    async def fake_get_workspace(_self, _ws):
        return SimpleNamespace(settings=workspace_settings or {})

    monkeypatch.setattr(
        AppAccessService, "get_effective_access", fake_get_effective_access
    )
    monkeypatch.setattr(AppAccessService, "_get_workspace", fake_get_workspace)


def _app(enabled, can_access, modules=None):
    return {
        "app_id": "crm",
        "enabled": enabled,
        "can_access": can_access,
        "modules": modules or {},
        "source": "department",
        "source_detail": None,
    }


@pytest.mark.asyncio
async def test_member_without_access_is_blocked(monkeypatch):
    _patch_access(monkeypatch, apps={"crm": _app(False, False)})

    with pytest.raises(HTTPException) as exc:
        await ensure_member_app_access(None, "w1", "dev-1", "crm")

    assert exc.value.status_code == 403
    # Names the module and points at the way out — there is a request flow.
    assert "crm" in exc.value.detail
    assert "Request access" in exc.value.detail


@pytest.mark.asyncio
async def test_member_with_access_passes(monkeypatch):
    _patch_access(monkeypatch, apps={"crm": _app(True, True)})
    await ensure_member_app_access(None, "w1", "dev-1", "crm")  # no raise


@pytest.mark.asyncio
async def test_reach_is_can_access_not_enabled(monkeypatch):
    """An admin kept out of CRM's *navigation* must still reach CRM's API."""
    _patch_access(monkeypatch, apps={"crm": _app(False, True)}, is_admin=True)
    await ensure_member_app_access(None, "w1", "dev-1", "crm")  # no raise


@pytest.mark.asyncio
async def test_workspace_disabled_message_differs_from_no_access(monkeypatch):
    """Two different problems need two different answers.

    "Nobody here uses this" is an owner's decision; "you don't have it" is an
    admin's. Collapsing them sends people to the wrong person.
    """
    _patch_access(
        monkeypatch,
        apps={"crm": _app(True, True)},
        workspace_settings={"app_settings": {"crm": False}},
    )

    with pytest.raises(HTTPException) as exc:
        await ensure_app_enabled(None, "w1", "crm")

    assert exc.value.status_code == 403
    assert "disabled for this workspace" in exc.value.detail


@pytest.mark.asyncio
async def test_guard_checks_the_workspace_toggle_first(monkeypatch):
    """A disabled module should say so, even to someone who also lacks access."""
    _patch_access(
        monkeypatch,
        apps={"crm": _app(False, False)},
        workspace_settings={"app_settings": {"crm": False}},
    )
    guard = require_app_access("crm")

    with pytest.raises(HTTPException) as exc:
        await guard(
            workspace_id="w1",
            current_developer=SimpleNamespace(id="dev-1"),
            db=None,
        )

    assert "disabled for this workspace" in exc.value.detail


@pytest.mark.asyncio
async def test_guard_blocks_a_member_of_an_enabled_module(monkeypatch):
    _patch_access(monkeypatch, apps={"crm": _app(False, False)})
    guard = require_app_access("crm")

    with pytest.raises(HTTPException) as exc:
        await guard(
            workspace_id="w1",
            current_developer=SimpleNamespace(id="dev-1"),
            db=None,
        )

    assert "do not have access" in exc.value.detail


@pytest.mark.asyncio
async def test_guard_allows_a_member_with_access(monkeypatch):
    _patch_access(monkeypatch, apps={"crm": _app(True, True)})
    guard = require_app_access("crm")
    await guard(
        workspace_id="w1",
        current_developer=SimpleNamespace(id="dev-1"),
        db=None,
    )


@pytest.mark.asyncio
async def test_unknown_app_id_is_rejected_at_import_time():
    """A typo'd app id must fail loudly rather than silently never enforcing."""
    with pytest.raises(ValueError, match="Unknown app id"):
        require_app_access("crmm")


# ==================== module-level checks ====================


@pytest.mark.asyncio
async def test_module_access_requires_the_app(monkeypatch):
    _patch_access(monkeypatch, apps={"crm": _app(False, False, {"inbox": True})})
    svc = AppAccessService(db=None)
    assert await svc.check_module_access("w1", "dev-1", "crm", "inbox") is False


@pytest.mark.asyncio
async def test_module_access_follows_the_module_grant(monkeypatch):
    _patch_access(
        monkeypatch,
        apps={"crm": _app(True, True, {"inbox": True, "agents": False})},
    )
    svc = AppAccessService(db=None)
    assert await svc.check_module_access("w1", "dev-1", "crm", "inbox") is True
    assert await svc.check_module_access("w1", "dev-1", "crm", "agents") is False


@pytest.mark.asyncio
async def test_no_module_map_means_every_module(monkeypatch):
    _patch_access(monkeypatch, apps={"crm": _app(True, True, {})})
    svc = AppAccessService(db=None)
    assert await svc.check_module_access("w1", "dev-1", "crm", "inbox") is True


@pytest.mark.asyncio
async def test_admins_reach_every_module_of_a_reachable_app(monkeypatch):
    _patch_access(
        monkeypatch,
        apps={"crm": _app(False, True, {"inbox": False})},
        is_admin=True,
    )
    svc = AppAccessService(db=None)
    assert await svc.check_module_access("w1", "dev-1", "crm", "inbox") is True


@pytest.mark.asyncio
async def test_unknown_app_is_not_reachable(monkeypatch):
    _patch_access(monkeypatch, apps={})
    svc = AppAccessService(db=None)
    assert await svc.check_app_access("w1", "dev-1", "crm") is False
