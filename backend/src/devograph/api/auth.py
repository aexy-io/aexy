"""Authentication endpoints for GitHub OAuth."""

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.core.config import get_settings
from devograph.core.database import get_db
from devograph.schemas.auth import TokenResponse
from devograph.services.developer_service import DeveloperService
from devograph.services.github_service import GitHubAuthError, GitHubService

router = APIRouter()
settings = get_settings()

# In-memory state store (use Redis in production)
oauth_states: dict[str, datetime] = {}


def create_access_token(developer_id: str) -> str:
    """Create a JWT access token."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode = {
        "sub": developer_id,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


@router.get("/github/login")
async def github_login() -> RedirectResponse:
    """Initiate GitHub OAuth flow."""
    state = secrets.token_urlsafe(32)
    oauth_states[state] = datetime.now(timezone.utc)

    # Clean old states (older than 10 minutes)
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
    for old_state in list(oauth_states.keys()):
        if oauth_states[old_state] < cutoff:
            del oauth_states[old_state]

    github_service = GitHubService()
    auth_url = github_service.get_oauth_url(state)

    return RedirectResponse(url=auth_url)


@router.get("/github/callback")
async def github_callback(
    code: str,
    state: str | None = None,
    installation_id: int | None = None,
    setup_action: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Handle GitHub OAuth callback and GitHub App installation callback.

    This endpoint handles two flows:
    1. OAuth login flow: code + state
    2. GitHub App installation: code + installation_id + setup_action
    """
    frontend_url = settings.frontend_url or "http://localhost:3000"

    # Determine if this is an installation callback or OAuth callback
    is_installation_callback = installation_id is not None and setup_action == "install"

    # For OAuth flow, verify state
    if not is_installation_callback:
        if not state or state not in oauth_states:
            return RedirectResponse(url=f"{frontend_url}/?error=invalid_state")
        del oauth_states[state]

    github_service = GitHubService()

    try:
        # Exchange code for token
        auth_response = await github_service.exchange_code_for_token(code)
    except GitHubAuthError as e:
        return RedirectResponse(url=f"{frontend_url}/?error={str(e)}")

    # Get user info from GitHub
    async with GitHubService(access_token=auth_response.access_token) as gh:
        user_info = await gh.get_user_info()

        # Get email if not in user info
        email = user_info.email
        if not email:
            emails = await gh.get_user_emails()
            primary_email = next(
                (e for e in emails if e.get("primary") and e.get("verified")),
                None,
            )
            if primary_email:
                email = primary_email["email"]

    if not email:
        return RedirectResponse(url=f"{frontend_url}/?error=no_email")

    # Get or create developer
    dev_service = DeveloperService(db)
    scopes = auth_response.scope.split(",") if auth_response.scope else None

    developer = await dev_service.get_or_create_by_github(
        github_id=user_info.id,
        github_username=user_info.login,
        email=email,
        access_token=auth_response.access_token,
        github_name=user_info.name,
        github_avatar_url=user_info.avatar_url,
        scopes=scopes,
    )

    # If this is an installation callback, sync the installation
    if is_installation_callback and installation_id:
        try:
            from devograph.services.github_app_service import GitHubAppService
            app_service = GitHubAppService(db)

            # Get the GitHub connection for this developer
            from devograph.services.repository_service import RepositoryService
            repo_service = RepositoryService(db)
            connection = await repo_service.get_github_connection(developer.id)

            if connection:
                await app_service.sync_user_installations(
                    connection.id,
                    user_info.login,
                )
                await db.commit()
        except Exception as e:
            # Log but don't fail - user can sync later
            print(f"Failed to sync installation: {e}")

    # Create JWT
    access_token = create_access_token(developer.id)

    # Redirect to frontend callback with token
    return RedirectResponse(url=f"{frontend_url}/auth/callback?token={access_token}")
