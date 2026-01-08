"""API client for communicating with Aexy backend."""

import os
from typing import Any

import httpx
import keyring

SERVICE_NAME = "aexy-cli"
DEFAULT_BASE_URL = "http://localhost:8000/api"


class AexyClient:
    """HTTP client for Aexy API."""

    def __init__(self, base_url: str | None = None, token: str | None = None):
        self.base_url = base_url or os.environ.get("DEVOGRAPH_API_URL", DEFAULT_BASE_URL)
        self._token = token or self._get_stored_token()

    def _get_stored_token(self) -> str | None:
        """Get token from keyring."""
        try:
            return keyring.get_password(SERVICE_NAME, "api_token")
        except Exception:
            return os.environ.get("DEVOGRAPH_API_TOKEN")

    def _save_token(self, token: str) -> None:
        """Save token to keyring."""
        try:
            keyring.set_password(SERVICE_NAME, "api_token", token)
        except Exception:
            pass  # Fall back to environment variable

    def _clear_token(self) -> None:
        """Clear stored token."""
        try:
            keyring.delete_password(SERVICE_NAME, "api_token")
        except Exception:
            pass

    @property
    def is_authenticated(self) -> bool:
        """Check if client has a token."""
        return self._token is not None

    def _headers(self) -> dict[str, str]:
        """Get request headers."""
        headers = {"Content-Type": "application/json"}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        return headers

    async def _request(
        self,
        method: str,
        endpoint: str,
        **kwargs: Any,
    ) -> dict | list | None:
        """Make an HTTP request."""
        url = f"{self.base_url}{endpoint}"
        async with httpx.AsyncClient() as client:
            response = await client.request(
                method,
                url,
                headers=self._headers(),
                timeout=30.0,
                **kwargs,
            )
            response.raise_for_status()
            if response.status_code == 204:
                return None
            return response.json()

    async def get(self, endpoint: str, **kwargs: Any) -> dict | list | None:
        """Make a GET request."""
        return await self._request("GET", endpoint, **kwargs)

    async def post(self, endpoint: str, **kwargs: Any) -> dict | list | None:
        """Make a POST request."""
        return await self._request("POST", endpoint, **kwargs)

    async def put(self, endpoint: str, **kwargs: Any) -> dict | list | None:
        """Make a PUT request."""
        return await self._request("PUT", endpoint, **kwargs)

    async def delete(self, endpoint: str, **kwargs: Any) -> dict | list | None:
        """Make a DELETE request."""
        return await self._request("DELETE", endpoint, **kwargs)

    # Authentication
    def set_token(self, token: str) -> None:
        """Set and store authentication token."""
        self._token = token
        self._save_token(token)

    def logout(self) -> None:
        """Clear authentication token."""
        self._token = None
        self._clear_token()

    # Developer endpoints
    async def list_developers(self) -> list[dict]:
        """List all developers."""
        result = await self.get("/developers")
        return result if isinstance(result, list) else []

    async def get_developer(self, developer_id: str) -> dict | None:
        """Get developer by ID."""
        result = await self.get(f"/developers/{developer_id}")
        return result if isinstance(result, dict) else None

    async def get_developer_by_username(self, username: str) -> dict | None:
        """Get developer by GitHub username."""
        result = await self.get(f"/developers/github/{username}")
        return result if isinstance(result, dict) else None

    async def get_developer_profile(self, developer_id: str) -> dict | None:
        """Get developer's full profile with analysis."""
        result = await self.get(f"/developers/{developer_id}/profile")
        return result if isinstance(result, dict) else None

    # Team endpoints
    async def list_teams(self) -> list[dict]:
        """List all teams."""
        result = await self.get("/teams")
        return result if isinstance(result, list) else []

    async def get_team(self, team_id: str) -> dict | None:
        """Get team by ID."""
        result = await self.get(f"/teams/{team_id}")
        return result if isinstance(result, dict) else None

    async def get_team_skills(self, team_id: str) -> dict | None:
        """Get team skill analysis."""
        result = await self.get(f"/teams/{team_id}/skills")
        return result if isinstance(result, dict) else None

    async def get_team_gaps(self, team_id: str) -> dict | None:
        """Get team skill gaps."""
        result = await self.get(f"/teams/{team_id}/gaps")
        return result if isinstance(result, dict) else None

    # Analytics endpoints
    async def get_skill_heatmap(self, developer_ids: list[str]) -> dict | None:
        """Get skill heatmap for developers."""
        result = await self.post("/analytics/heatmap/skills", json={"developer_ids": developer_ids})
        return result if isinstance(result, dict) else None

    async def get_productivity_trends(
        self,
        developer_ids: list[str],
        days: int = 30,
    ) -> dict | None:
        """Get productivity trends."""
        result = await self.post(
            "/analytics/productivity",
            json={"developer_ids": developer_ids, "days": days},
        )
        return result if isinstance(result, dict) else None

    async def get_workload_distribution(self, developer_ids: list[str]) -> dict | None:
        """Get workload distribution."""
        result = await self.post(
            "/analytics/workload",
            json={"developer_ids": developer_ids},
        )
        return result if isinstance(result, dict) else None

    # Prediction endpoints
    async def get_attrition_risk(self, developer_id: str) -> dict | None:
        """Get attrition risk for developer."""
        result = await self.get(f"/predictions/attrition/{developer_id}")
        return result if isinstance(result, dict) else None

    async def get_burnout_risk(self, developer_id: str) -> dict | None:
        """Get burnout risk for developer."""
        result = await self.get(f"/predictions/burnout/{developer_id}")
        return result if isinstance(result, dict) else None

    async def get_performance_trajectory(self, developer_id: str) -> dict | None:
        """Get performance trajectory for developer."""
        result = await self.get(f"/predictions/trajectory/{developer_id}")
        return result if isinstance(result, dict) else None

    async def get_team_health(self, developer_ids: list[str]) -> dict | None:
        """Get team health analysis."""
        result = await self.post(
            "/predictions/team-health",
            json={"developer_ids": developer_ids},
        )
        return result if isinstance(result, dict) else None

    # Task matching
    async def match_task(self, description: str, required_skills: list[str] | None = None) -> dict | None:
        """Match a task to developers."""
        result = await self.post(
            "/hiring/match",
            json={
                "description": description,
                "required_skills": required_skills or [],
            },
        )
        return result if isinstance(result, dict) else None

    # Report endpoints
    async def list_reports(self) -> list[dict]:
        """List all reports."""
        result = await self.get("/reports")
        return result if isinstance(result, list) else []

    async def get_report(self, report_id: str) -> dict | None:
        """Get report by ID."""
        result = await self.get(f"/reports/{report_id}")
        return result if isinstance(result, dict) else None

    async def create_export(
        self,
        export_type: str,
        format: str,
        config: dict | None = None,
    ) -> dict | None:
        """Create an export job."""
        result = await self.post(
            "/exports",
            json={
                "export_type": export_type,
                "format": format,
                "config": config or {},
            },
        )
        return result if isinstance(result, dict) else None

    async def get_export_status(self, job_id: str) -> dict | None:
        """Get export job status."""
        result = await self.get(f"/exports/{job_id}")
        return result if isinstance(result, dict) else None
