"""Tests for the native-app device sign-in entry point (/auth/device/login).

It validates provider + loopback port and redirects into the normal browser
OAuth flow with a 127.0.0.1 redirect_url. The client must NOT follow the
redirect so we can assert on the Location.
"""

from urllib.parse import quote

import pytest


@pytest.mark.asyncio
async def test_device_login_redirects_to_provider_with_loopback(client):
    resp = await client.get(
        "/api/v1/auth/device/login",
        params={"provider": "github", "port": 43210},
        follow_redirects=False,
    )
    assert resp.status_code in (302, 307)
    loc = resp.headers["location"]
    assert loc.startswith("/api/v1/auth/github/login?")
    # redirect_url is the loopback callback, url-encoded.
    assert quote("http://127.0.0.1:43210/callback", safe="") in loc


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", ["google", "microsoft"])
async def test_device_login_supports_all_providers(client, provider):
    resp = await client.get(
        "/api/v1/auth/device/login",
        params={"provider": provider, "port": 50000},
        follow_redirects=False,
    )
    assert resp.status_code in (302, 307)
    assert resp.headers["location"].startswith(f"/api/v1/auth/{provider}/login?")


@pytest.mark.asyncio
async def test_device_login_rejects_unknown_provider(client):
    resp = await client.get(
        "/api/v1/auth/device/login",
        params={"provider": "facebook", "port": 43210},
        follow_redirects=False,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
@pytest.mark.parametrize("port", [80, 1023, 70000, -1])
async def test_device_login_rejects_out_of_range_port(client, port):
    resp = await client.get(
        "/api/v1/auth/device/login",
        params={"provider": "github", "port": port},
        follow_redirects=False,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_device_login_carries_state_into_loopback_callback(client):
    """The app's state nonce rides into the callback URL so the desktop
    listener can reject callbacks it didn't initiate."""
    resp = await client.get(
        "/api/v1/auth/device/login",
        params={"provider": "github", "port": 43210, "state": "abc-DEF_123.xyz"},
        follow_redirects=False,
    )
    assert resp.status_code in (302, 307)
    loc = resp.headers["location"]
    assert quote("http://127.0.0.1:43210/callback?state=abc-DEF_123.xyz", safe="") in loc


@pytest.mark.asyncio
async def test_device_login_without_state_keeps_bare_callback(client):
    resp = await client.get(
        "/api/v1/auth/device/login",
        params={"provider": "github", "port": 43210},
        follow_redirects=False,
    )
    assert resp.status_code in (302, 307)
    assert quote("http://127.0.0.1:43210/callback", safe="") in resp.headers["location"]
    assert "state" not in resp.headers["location"]


@pytest.mark.asyncio
@pytest.mark.parametrize("state", ["short", "a" * 129, "bad state", "inj'ect", "<tag>"])
async def test_device_login_rejects_malformed_state(client, state):
    resp = await client.get(
        "/api/v1/auth/device/login",
        params={"provider": "github", "port": 43210, "state": state},
        follow_redirects=False,
    )
    assert resp.status_code == 400
