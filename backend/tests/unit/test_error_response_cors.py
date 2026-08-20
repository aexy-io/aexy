"""A server error must not present itself as a CORS failure.

Starlette puts `ServerErrorMiddleware` outside everything `add_middleware`
installs, so before this an unhandled exception was answered by a response
`CORSMiddleware` never touched. The browser saw a 500 with no
`Access-Control-Allow-Origin` and reported a CORS refusal — naming the one part
of the stack that was working, and sending whoever read it to the wrong file.
"""

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from aexy.main import create_app
from aexy.middleware import (
    CommunityIsolationMiddleware,
    ErrorResponseMiddleware,
    UsageTrackingMiddleware,
)

ORIGIN = "http://localhost:3000"


@pytest.fixture
def client():
    """The same two layers the real app puts around its router, in the same
    order — CORS outermost, ErrorResponse just inside it."""
    app = FastAPI()

    @app.get("/boom")
    async def boom():
        raise RuntimeError("something the router did not expect")

    @app.get("/header-boom")
    async def header_boom():
        from starlette.responses import Response

        # The shape that caused this in production: a header value carrying
        # U+202F, the narrow no-break space macOS puts before AM/PM in a
        # screenshot filename. Header values are encoded latin-1, so building
        # the response raises. Written as an escape on purpose — the character
        # is invisible, and a test whose point rests on something you cannot
        # see in the diff is a test nobody can maintain.
        return Response(
            "ok",
            headers={"Content-Disposition": 'inline; filename="shot 3.46.22\u202fPM.png"'},
        )

    @app.get("/refused")
    async def refused():
        raise HTTPException(status_code=403, detail="nope")

    @app.get("/fine")
    async def fine():
        return {"ok": True}

    app.add_middleware(ErrorResponseMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[ORIGIN],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    return TestClient(app, raise_server_exceptions=False)


def test_an_unhandled_error_is_a_500_that_still_carries_cors(client):
    resp = client.get("/boom", headers={"Origin": ORIGIN})
    assert resp.status_code == 500
    assert resp.headers["access-control-allow-origin"] == ORIGIN


def test_a_header_that_cannot_be_encoded_is_a_500_not_a_cors_error(client):
    """The original report. Before this the browser said "blocked by CORS
    policy"; it should say the server broke, because the server broke."""
    resp = client.get("/header-boom", headers={"Origin": ORIGIN})
    assert resp.status_code == 500
    assert resp.headers["access-control-allow-origin"] == ORIGIN


def test_the_body_does_not_leak_the_traceback(client):
    resp = client.get("/boom", headers={"Origin": ORIGIN})
    assert resp.json() == {"detail": "Internal server error"}
    assert "RuntimeError" not in resp.text


def test_a_deliberate_refusal_is_untouched(client):
    resp = client.get("/refused", headers={"Origin": ORIGIN})
    assert resp.status_code == 403
    assert resp.json() == {"detail": "nope"}
    assert resp.headers["access-control-allow-origin"] == ORIGIN


def test_an_ordinary_response_is_untouched(client):
    resp = client.get("/fine", headers={"Origin": ORIGIN})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    assert resp.headers["access-control-allow-origin"] == ORIGIN


# ─── The real app's stack ───────────────────────────────────────────────────

def test_cors_is_outermost_and_error_handling_sits_inside_it():
    """The ordering is the fix. `add_middleware` reads bottom-up, so this is
    the assertion that catches somebody adding a fifth layer in the wrong
    place."""
    order = [m.cls for m in create_app().user_middleware]
    assert order[0] is CORSMiddleware
    assert order[1] is ErrorResponseMiddleware


def test_community_isolation_still_runs_before_metering():
    """The property the previous ordering existed to protect: a blocked
    community request is rejected without being billed for."""
    order = [m.cls for m in create_app().user_middleware]
    assert order.index(CommunityIsolationMiddleware) < order.index(UsageTrackingMiddleware)
