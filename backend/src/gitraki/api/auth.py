"""Authentication endpoints for GitHub OAuth."""

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from gitraki.core.config import get_settings
from gitraki.core.database import get_db
from gitraki.schemas.auth import TokenResponse
from gitraki.services.developer_service import DeveloperService
from gitraki.services.github_service import GitHubAuthError, GitHubService

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
    state: str,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Handle GitHub OAuth callback."""
    # Verify state
    if state not in oauth_states:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OAuth state",
        )
    del oauth_states[state]

    github_service = GitHubService()

    try:
        # Exchange code for token
        auth_response = await github_service.exchange_code_for_token(code)
    except GitHubAuthError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e

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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not retrieve email from GitHub. Please ensure your email is verified.",
        )

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

    # Create JWT
    access_token = create_access_token(developer.id)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
    )
