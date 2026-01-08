"""Authentication endpoints for GitHub and Google OAuth."""

import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.core.database import get_db
from aexy.schemas.auth import TokenResponse
from aexy.services.developer_service import DeveloperService
from aexy.services.github_service import GitHubAPIError, GitHubAuthError, GitHubService

router = APIRouter()
settings = get_settings()

# In-memory state store (use Redis in production)
oauth_states: dict[str, datetime] = {}

# Google OAuth configuration
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

# Google OAuth scopes for authentication (basic profile + email)
GOOGLE_AUTH_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]

# Google OAuth scopes for CRM (includes Gmail and Calendar)
GOOGLE_CRM_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
]

# Store state with metadata (scope type and redirect URL)
# Format: state -> {"created_at": datetime, "scope_type": "login"|"crm", "redirect_url": str|None}
oauth_state_meta: dict[str, dict] = {}


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
            try:
                emails = await gh.get_user_emails()
                primary_email = next(
                    (e for e in emails if e.get("primary") and e.get("verified")),
                    None,
                )
                if primary_email:
                    email = primary_email["email"]
            except GitHubAPIError:
                # Email permission not available - will fail below if no email
                pass

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
            from aexy.services.github_app_service import GitHubAppService
            app_service = GitHubAppService(db)

            # Get the GitHub connection for this developer
            from aexy.services.repository_service import RepositoryService
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


# ============================================================================
# Google OAuth endpoints
# ============================================================================


def _clean_old_oauth_states():
    """Clean expired OAuth states."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
    for old_state in list(oauth_states.keys()):
        if oauth_states[old_state] < cutoff:
            del oauth_states[old_state]
    for old_state in list(oauth_state_meta.keys()):
        if oauth_state_meta[old_state].get("created_at", datetime.min.replace(tzinfo=timezone.utc)) < cutoff:
            del oauth_state_meta[old_state]


@router.get("/google/login")
async def google_login() -> RedirectResponse:
    """Initiate Google OAuth flow for authentication."""
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured",
        )

    state = secrets.token_urlsafe(32)
    oauth_states[state] = datetime.now(timezone.utc)
    oauth_state_meta[state] = {
        "created_at": datetime.now(timezone.utc),
        "scope_type": "login",
        "redirect_url": None,
    }

    _clean_old_oauth_states()

    # Build Google OAuth URL
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_auth_redirect_uri,
        "response_type": "code",
        "scope": " ".join(GOOGLE_AUTH_SCOPES),
        "state": state,
        "access_type": "offline",  # Request refresh token
        "prompt": "consent",  # Always show consent screen to get refresh token
    }
    auth_url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"

    return RedirectResponse(url=auth_url)


@router.get("/google/connect-crm")
async def google_connect_crm(redirect_url: str | None = None) -> RedirectResponse:
    """Initiate Google OAuth flow with CRM scopes (Gmail + Calendar).

    This endpoint requests full Gmail and Calendar access for CRM features.
    Use this during onboarding or when connecting Google for CRM purposes.
    """
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured",
        )

    state = secrets.token_urlsafe(32)
    oauth_states[state] = datetime.now(timezone.utc)
    oauth_state_meta[state] = {
        "created_at": datetime.now(timezone.utc),
        "scope_type": "crm",
        "redirect_url": redirect_url,
    }

    _clean_old_oauth_states()

    # Build Google OAuth URL with CRM scopes
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_auth_redirect_uri,
        "response_type": "code",
        "scope": " ".join(GOOGLE_CRM_SCOPES),
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
    }
    auth_url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"

    return RedirectResponse(url=auth_url)


@router.get("/google/callback")
async def google_callback(
    code: str,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Handle Google OAuth callback."""
    frontend_url = settings.frontend_url or "http://localhost:3000"

    # Check for errors from Google
    if error:
        return RedirectResponse(url=f"{frontend_url}/?error={error}")

    # Verify state
    if not state or state not in oauth_states:
        return RedirectResponse(url=f"{frontend_url}/?error=invalid_state")
    del oauth_states[state]

    # Get metadata about this OAuth flow
    state_meta = oauth_state_meta.pop(state, {})
    scope_type = state_meta.get("scope_type", "login")
    custom_redirect_url = state_meta.get("redirect_url")

    # Determine which scopes to store
    scopes_to_store = GOOGLE_CRM_SCOPES if scope_type == "crm" else GOOGLE_AUTH_SCOPES

    try:
        # Exchange code for tokens
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": settings.google_auth_redirect_uri,
                },
            )

            if token_response.status_code != 200:
                return RedirectResponse(url=f"{frontend_url}/?error=token_exchange_failed")

            token_data = token_response.json()
            access_token = token_data.get("access_token")
            refresh_token = token_data.get("refresh_token")
            expires_in = token_data.get("expires_in", 3600)

            if not access_token:
                return RedirectResponse(url=f"{frontend_url}/?error=no_access_token")

            # Calculate token expiry
            token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

            # Get user info from Google
            userinfo_response = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )

            if userinfo_response.status_code != 200:
                return RedirectResponse(url=f"{frontend_url}/?error=userinfo_failed")

            userinfo = userinfo_response.json()
            google_id = userinfo.get("id")
            email = userinfo.get("email")
            name = userinfo.get("name")
            picture = userinfo.get("picture")

            if not google_id or not email:
                return RedirectResponse(url=f"{frontend_url}/?error=missing_user_info")

            # Get or create developer
            dev_service = DeveloperService(db)
            developer = await dev_service.get_or_create_by_google(
                google_id=google_id,
                google_email=email,
                access_token=access_token,
                refresh_token=refresh_token,
                token_expires_at=token_expires_at,
                google_name=name,
                google_avatar_url=picture,
                scopes=scopes_to_store,
            )

            # Commit the transaction
            await db.commit()

            # Create JWT
            jwt_token = create_access_token(developer.id)

            # Determine redirect URL
            if custom_redirect_url:
                # Use custom redirect URL (e.g., from onboarding)
                # Append token as query param
                separator = "&" if "?" in custom_redirect_url else "?"
                return RedirectResponse(url=f"{custom_redirect_url}{separator}token={jwt_token}")
            else:
                # Default: redirect to frontend callback
                return RedirectResponse(url=f"{frontend_url}/auth/callback?token={jwt_token}")

    except httpx.RequestError as e:
        return RedirectResponse(url=f"{frontend_url}/?error=request_failed")
    except Exception as e:
        return RedirectResponse(url=f"{frontend_url}/?error=auth_failed")
