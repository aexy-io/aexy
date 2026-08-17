"""How the server tells an agent's write from a person's.

The review gate for agent writes used to read a request header, which the caller
sets. Forging it could only ever *restrict* the forger, so it was never an
escalation path — the hole ran the other way: an agent holding an ordinary
workspace token and calling `PATCH /documents/{id}` directly wrote straight
through, no proposal. The promise was "an agent's write always lands as a
proposal"; what was implemented was "…when it chooses to route through MCP".

The marker lives in the signed token now, so it is the server's decision.
"""

from __future__ import annotations

from types import SimpleNamespace

from jose import jwt

from aexy.api.auth import create_access_token
from aexy.api.developers import AGENT_ACTOR
from aexy.api.documents import is_agent_request
from aexy.core.config import get_settings


def _request(**state):
    return SimpleNamespace(state=SimpleNamespace(**state), headers={})


class TestTheClaim:
    def test_an_ordinary_token_carries_no_actor(self):
        settings = get_settings()
        payload = jwt.decode(
            create_access_token("dev-1"),
            settings.secret_key,
            algorithms=[settings.algorithm],
        )
        assert "actor" not in payload

    def test_an_agent_token_carries_it_inside_the_signature(self):
        settings = get_settings()
        token = create_access_token("dev-1", actor=AGENT_ACTOR)

        # Decoding *with verification*: the point is that the claim cannot be
        # added without the signing secret, which a request header can be.
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.algorithm]
        )
        assert payload["actor"] == AGENT_ACTOR
        assert payload["sub"] == "dev-1"


class TestTheGate:
    def test_a_verified_agent_claim_routes_into_review(self):
        assert is_agent_request(_request(token_actor=AGENT_ACTOR)) is True

    def test_a_person_does_not(self):
        assert is_agent_request(_request(token_actor=None)) is False

    def test_a_request_that_never_reached_the_auth_dependency_reads_as_a_person(self):
        """Fails closed towards "person", which is the direction that cannot
        invent an agent — an endpoint with no auth has no agent to speak for."""
        assert is_agent_request(SimpleNamespace(state=SimpleNamespace(), headers={})) is False

    def test_the_header_no_longer_decides_anything(self):
        """The whole finding. A caller setting this header used to route itself
        into review; more importantly, *not* setting it used to route an agent
        around review."""
        from aexy.services.mcp_tool_executor import AGENT_ACTOR_HEADER

        forged = SimpleNamespace(
            state=SimpleNamespace(token_actor=None),
            headers={AGENT_ACTOR_HEADER: "mcp"},
        )
        assert is_agent_request(forged) is False

        # And the converse: an agent's claim stands whether or not the header
        # came with it.
        no_header = SimpleNamespace(
            state=SimpleNamespace(token_actor=AGENT_ACTOR), headers={}
        )
        assert is_agent_request(no_header) is True


class TestTheExecutorMintsIt:
    def test_the_token_it_re_enters_with_is_marked(self):
        """Asserted against the source because the alternative is standing up an
        ASGI round trip to observe one header — and what matters is that the
        executor asks for the claim at all. Without it every MCP write would
        route as a person's, silently undoing the gate."""
        from pathlib import Path

        source = Path(
            "src/aexy/services/mcp_tool_executor.py"
        ).read_text()
        assert "actor=AGENT_ACTOR" in source
