"""LinkedIn automation providers -- automate LinkedIn outreach via PhantomBuster."""

import asyncio
import json
import logging
from typing import Any
from uuid import uuid4

import httpx

from aexy.integrations.registry import BaseProvider, ProviderRegistry
from aexy.integrations.providers.base import LinkedInAutomationResult

logger = logging.getLogger(__name__)


class LinkedInAutomationProvider(BaseProvider):
    """ABC for LinkedIn automation providers."""

    SLOT = "linkedin_automation"

    async def view_profile(self, linkedin_url: str) -> LinkedInAutomationResult:
        """View a LinkedIn profile."""
        raise NotImplementedError

    async def send_connection_request(
        self, linkedin_url: str, message: str | None = None,
    ) -> LinkedInAutomationResult:
        """Send a connection request."""
        raise NotImplementedError

    async def send_message(self, linkedin_url: str, message: str) -> LinkedInAutomationResult:
        """Send a direct message."""
        raise NotImplementedError


class PhantomBusterProvider(LinkedInAutomationProvider):
    """PhantomBuster -- LinkedIn automation via phantom agents.

    API: https://api.phantombuster.com/api/v2/
    Auth: X-Phantombuster-Key header

    Credentials schema::

        {
            "api_key": "...",
            "profile_viewer_agent_id": "...",
            "connection_agent_id": "...",
            "message_agent_id": "..."
        }

    Each agent ID refers to a preconfigured PhantomBuster phantom that the user
    has set up in their account for the respective LinkedIn action.
    """

    NAME = "phantombuster"
    DISPLAY_NAME = "PhantomBuster"
    MONTHLY_COST_CENTS = 0  # varies by plan
    # An account can be set up incrementally: each LinkedIn action checks for
    # its own agent ID when it runs. Requiring every agent here made it
    # impossible to save and test a profile-viewer-only setup.
    REQUIRED_CREDENTIALS = ["api_key"]

    API_BASE = "https://api.phantombuster.com/api/v2"
    _POLL_INTERVAL_S = 5
    _POLL_TIMEOUT_S = 60

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    async def view_profile(self, linkedin_url: str) -> LinkedInAutomationResult:
        """Launch the profile-viewer phantom agent for *linkedin_url*."""
        agent_id = self.credentials.get("profile_viewer_agent_id", "")
        if not agent_id:
            return LinkedInAutomationResult(
                action="profile_view",
                target_url=linkedin_url,
                error="profile_viewer_agent_id not configured",
            )

        return await self._launch_linkedin_list_agent(
            agent_id=agent_id,
            action="profile_view",
            target_url=linkedin_url,
            input_field="spreadsheetUrl",
            list_name="Aexy profile visit",
        )

    async def send_connection_request(
        self, linkedin_url: str, message: str | None = None,
    ) -> LinkedInAutomationResult:
        """Launch the connection-request phantom agent."""
        agent_id = self.credentials.get("connection_agent_id", "")
        if not agent_id:
            return LinkedInAutomationResult(
                action="connection_request",
                target_url=linkedin_url,
                error="connection_agent_id not configured",
            )

        return await self._launch_linkedin_direct_profile_agent(
            agent_id=agent_id,
            action="connection_request",
            target_url=linkedin_url,
            argument_overrides={"message": message} if message else None,
        )

    async def send_message(self, linkedin_url: str, message: str) -> LinkedInAutomationResult:
        """Launch the message-sending phantom agent."""
        agent_id = self.credentials.get("message_agent_id", "")
        if not agent_id:
            return LinkedInAutomationResult(
                action="message",
                target_url=linkedin_url,
                error="message_agent_id not configured",
            )

        return await self._launch_linkedin_list_agent(
            agent_id=agent_id,
            action="message",
            target_url=linkedin_url,
            input_field="spreadsheetUrl",
            list_name="Aexy LinkedIn message",
            argument_overrides={"message": message},
        )

    async def test_connection(self) -> dict[str, Any]:
        """Verify the API key by fetching the profile-viewer agent status."""
        api_key = self.credentials.get("api_key", "")
        if not api_key:
            return {"success": False, "message": "API key not configured"}

        # Pick any configured agent ID to validate the key against.
        agent_id = (
            self.credentials.get("profile_viewer_agent_id")
            or self.credentials.get("connection_agent_id")
            or self.credentials.get("message_agent_id")
            or ""
        )
        if not agent_id:
            return {"success": False, "message": "No phantom agent IDs configured"}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{self.API_BASE}/agents/fetch",
                    params={"id": agent_id},
                    headers=self._headers(api_key),
                )

                if resp.status_code == 401:
                    return {"success": False, "message": "Invalid API key"}
                if resp.status_code == 402:
                    return {"success": False, "message": "PhantomBuster quota exceeded -- check your plan"}
                if resp.status_code == 404:
                    return {
                        "success": False,
                        "message": f"Phantom agent {agent_id} not found -- verify agent IDs",
                    }
                if resp.status_code == 200:
                    return {"success": True, "message": "Connection successful"}

                return {"success": False, "message": f"Unexpected status: {resp.status_code}"}

        except httpx.TimeoutException:
            return {"success": False, "message": "Connection timed out"}
        except Exception as e:
            return {"success": False, "message": str(e)}

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _launch_linkedin_list_agent(
        self,
        *,
        agent_id: str,
        action: str,
        target_url: str,
        input_field: str,
        list_name: str,
        argument_overrides: dict[str, Any] | None = None,
    ) -> LinkedInAutomationResult:
        """Give a list-based LinkedIn Phantom one CRM profile, then launch it.

        Each Phantom keeps its own saved settings, including its LinkedIn
        session.  For a workflow run we create a one-profile dynamic list and
        replace only that Phantom's list input.  Different Phantom types use
        different input field names, such as ``spreadsheetUrl`` or ``leadList``.
        """
        api_key = self.credentials.get("api_key", "")
        if not api_key:
            return LinkedInAutomationResult(
                action=action, target_url=target_url, error="API key not configured",
            )

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                lead_response = await client.post(
                    f"{self.API_BASE}/org-storage/leads/save",
                    headers=self._headers(api_key),
                    json={"linkedinProfileUrl": target_url},
                )
                lead_error = self._check_error_status(
                    lead_response, action=action, target_url=target_url, context="save lead",
                )
                if lead_error is not None:
                    return lead_error

                list_response = await client.post(
                    f"{self.API_BASE}/org-storage/lists/save",
                    headers=self._headers(api_key),
                    json={
                        "name": f"{list_name} {uuid4().hex[:8]}",
                        "filter": {
                            "filter": {
                                "linkedinProfileUrl": {
                                    "operator": "equals",
                                    "valueToCompare": target_url,
                                }
                            }
                        },
                        "tags": ["workflow"],
                    },
                )
                list_error = self._check_error_status(
                    list_response, action=action, target_url=target_url, context="create lead list",
                )
                if list_error is not None:
                    return list_error

                list_id = list_response.json().get("id")
                if not list_id:
                    return LinkedInAutomationResult(
                        action=action,
                        target_url=target_url,
                        raw_response=list_response.json(),
                        error="PhantomBuster did not return a lead-list ID",
                    )

                agent_response = await client.get(
                    f"{self.API_BASE}/agents/fetch",
                    params={"id": agent_id},
                    headers=self._headers(api_key),
                )
                agent_error = self._check_error_status(
                    agent_response, action=action, target_url=target_url, context="fetch agent",
                )
                if agent_error is not None:
                    return agent_error

                argument = json.loads(agent_response.json().get("argument") or "{}")
                argument[input_field] = f"org-storage://leads/by-list/{list_id}"
                if argument_overrides:
                    argument.update(argument_overrides)

            return await self._launch_and_wait(
                agent_id=agent_id,
                argument=argument,
                action=action,
                target_url=target_url,
            )
        except (TypeError, ValueError) as exc:
            return LinkedInAutomationResult(
                action=action,
                target_url=target_url,
                error=f"Could not prepare PhantomBuster profile input: {exc}",
            )

    async def _launch_linkedin_direct_profile_agent(
        self,
        *,
        agent_id: str,
        action: str,
        target_url: str,
        argument_overrides: dict[str, Any] | None = None,
    ) -> LinkedInAutomationResult:
        """Launch a Phantom configured to accept one LinkedIn profile URL."""
        api_key = self.credentials.get("api_key", "")
        if not api_key:
            return LinkedInAutomationResult(
                action=action, target_url=target_url, error="API key not configured",
            )

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                agent_response = await client.get(
                    f"{self.API_BASE}/agents/fetch",
                    params={"id": agent_id},
                    headers=self._headers(api_key),
                )
                agent_error = self._check_error_status(
                    agent_response, action=action, target_url=target_url, context="fetch agent",
                )
                if agent_error is not None:
                    return agent_error

                argument = json.loads(agent_response.json().get("argument") or "{}")
                argument.update({"inputType": "profileUrl", "profileUrl": target_url})
                if argument_overrides:
                    argument.update(argument_overrides)

            return await self._launch_and_wait(
                agent_id=agent_id,
                argument=argument,
                action=action,
                target_url=target_url,
            )
        except (TypeError, ValueError) as exc:
            return LinkedInAutomationResult(
                action=action,
                target_url=target_url,
                error=f"Could not prepare PhantomBuster direct profile input: {exc}",
            )


    @staticmethod
    def _headers(api_key: str) -> dict[str, str]:
        """Build request headers with PhantomBuster API key authentication."""
        return {
            "Content-Type": "application/json",
            "X-Phantombuster-Key": api_key,
        }

    async def _launch_and_wait(
        self,
        agent_id: str,
        argument: dict[str, Any],
        action: str,
        target_url: str,
    ) -> LinkedInAutomationResult:
        """Launch a phantom agent and poll for its output.

        1. POST /agents/launch  -- start the phantom.
        2. GET  /agents/fetch-output?id={agentId} -- poll every 5 s until the
           agent finishes or 60 s elapses.
        3. Return the parsed output as a ``LinkedInAutomationResult``.
        """
        api_key = self.credentials.get("api_key", "")
        if not api_key:
            return LinkedInAutomationResult(
                action=action, target_url=target_url, error="API key not configured",
            )

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                # ---- Step 1: launch the agent ----
                launch_resp = await client.post(
                    f"{self.API_BASE}/agents/launch",
                    headers=self._headers(api_key),
                    json={
                        "id": agent_id,
                        "argument": json.dumps(argument),
                    },
                )

                launch_error = self._check_error_status(
                    launch_resp, action=action, target_url=target_url, context="launch",
                )
                if launch_error is not None:
                    return launch_error

                launch_data = launch_resp.json()
                container_id = launch_data.get("containerId")
                logger.info(
                    "PhantomBuster agent %s launched (container=%s) for %s",
                    agent_id, container_id, target_url,
                )

                # ---- Step 2: poll for output ----
                elapsed = 0
                while elapsed < self._POLL_TIMEOUT_S:
                    await asyncio.sleep(self._POLL_INTERVAL_S)
                    elapsed += self._POLL_INTERVAL_S

                    output_resp = await client.get(
                        f"{self.API_BASE}/agents/fetch-output",
                        params={"id": agent_id},
                        headers=self._headers(api_key),
                    )

                    output_error = self._check_error_status(
                        output_resp, action=action, target_url=target_url, context="fetch-output",
                    )
                    if output_error is not None:
                        return output_error

                    output_data = output_resp.json()

                    # PhantomBuster returns agent status inside the response.
                    status = output_data.get("status", "")

                    # Finished states.
                    if status == "finished":
                        return self._parse_output(
                            output_data, action=action, target_url=target_url,
                        )

                    if status == "error":
                        return LinkedInAutomationResult(
                            action=action,
                            target_url=target_url,
                            raw_response=output_data,
                            error=output_data.get("output", "Phantom agent error"),
                        )

                    # Still running -- keep polling.
                    logger.debug(
                        "PhantomBuster agent %s status=%s (%ds elapsed)",
                        agent_id, status, elapsed,
                    )

                # ---- Timed out ----
                return LinkedInAutomationResult(
                    action=action,
                    target_url=target_url,
                    error=f"Phantom agent {agent_id} did not finish within {self._POLL_TIMEOUT_S}s",
                )

        except httpx.TimeoutException:
            return LinkedInAutomationResult(
                action=action, target_url=target_url, error="PhantomBuster API timeout",
            )
        except Exception as e:
            logger.exception(
                "PhantomBuster %s error for %s (agent %s)", action, target_url, agent_id,
            )
            return LinkedInAutomationResult(action=action, target_url=target_url, error=str(e))

    @staticmethod
    def _check_error_status(
        resp: httpx.Response,
        *,
        action: str,
        target_url: str,
        context: str,
    ) -> LinkedInAutomationResult | None:
        """Return an error result for known HTTP error codes, or ``None`` if OK."""
        raw = {"status": resp.status_code, "body": resp.text[:500]}

        if resp.status_code == 401:
            return LinkedInAutomationResult(
                action=action, target_url=target_url,
                raw_response=raw,
                error="PhantomBuster API authentication failed (invalid API key)",
            )
        if resp.status_code == 402:
            return LinkedInAutomationResult(
                action=action, target_url=target_url,
                raw_response=raw,
                error="PhantomBuster quota exceeded -- upgrade your plan or wait for reset",
            )
        if resp.status_code == 429:
            return LinkedInAutomationResult(
                action=action, target_url=target_url,
                raw_response=raw,
                error="PhantomBuster API rate limit exceeded -- try again later",
            )
        if resp.status_code not in (200, 201):
            return LinkedInAutomationResult(
                action=action, target_url=target_url,
                raw_response=raw,
                error=f"PhantomBuster API error on {context}: HTTP {resp.status_code}",
            )

        return None  # no error

    @staticmethod
    def _parse_output(
        output_data: dict,
        *,
        action: str,
        target_url: str,
    ) -> LinkedInAutomationResult:
        """Parse the ``/agents/fetch-output`` JSON into a result."""
        # The output field from PhantomBuster is typically a JSON string
        # containing the results of the phantom's execution.
        output_raw = output_data.get("output")
        parsed_output: Any = output_raw
        if isinstance(output_raw, str):
            try:
                parsed_output = json.loads(output_raw)
            except (json.JSONDecodeError, ValueError):
                parsed_output = output_raw

        return LinkedInAutomationResult(
            success=True,
            action=action,
            target_url=target_url,
            raw_response={
                "status": output_data.get("status"),
                "containerId": output_data.get("containerId"),
                "output": parsed_output,
            },
        )


# Register the provider
ProviderRegistry.register("linkedin_automation", "phantombuster", PhantomBusterProvider)
