"""Authentication endpoints for GitHub and Google OAuth."""

import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlsplit

import httpx
import redis
from fastapi import APIRouter, Depends, HTTPException, status

logger = logging.getLogger(__name__)
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

# Redis client for OAuth state (shared across workers)
_redis_client = None

def get_redis_client():
    """Get or create Redis client for OAuth state storage."""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(
            settings.redis_url or "redis://localhost:6379/0",
            decode_responses=True
        )
    return _redis_client

# OAuth state TTL (10 minutes)
OAUTH_STATE_TTL = 600


async def _join_community_after_login(db: AsyncSession, developer_id: str, community_slug: str) -> None:
    """Best-effort: enrol a fresh community sign-in into the target community.

    Failure here must never break login — the participant is also enrolled on
    their first reply (post_reply → ensure_community_member), so this is only a
    convenience to give them a membership row up front.
    """
    try:
        from aexy.services.community_service import CommunityService
        from aexy.services.community_participation_service import CommunityParticipationService

        community = await CommunityService(db).get_by_slug(community_slug)
        if community is None or not community.enabled:
            return
        await CommunityParticipationService(db).ensure_community_member(
            community.workspace_id, developer_id
        )
        await db.commit()
    except Exception:
        logger.warning("Community auto-join after login failed", exc_info=True)

# --------------------------------------------------------------------------- #
# Post-OAuth redirect allowlist
# --------------------------------------------------------------------------- #
# After login we append the developer JWT to a redirect_url. To prevent token
# exfiltration via an attacker-supplied redirect_url, only deliver the token to
# an allowlisted origin: the configured frontend, local dev, any ops-configured
# extra origins, or a native-app loopback (127.0.0.1 / localhost, any port).
_LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


def _allowed_redirect_origins() -> set[str]:
    """`scheme://host[:port]` origins a post-OAuth redirect may target."""
    candidates = {
        settings.frontend_url,
        "http://localhost:3000",
        "http://localhost:3003",
    }
    extra = getattr(settings, "oauth_extra_redirect_hosts", "") or ""
    candidates.update(part.strip() for part in extra.split(",") if part.strip())
    origins = set()
    for c in candidates:
        if not c:
            continue
        p = urlsplit(c)
        if p.scheme and p.netloc:
            origins.add(f"{p.scheme}://{p.netloc}")
    return origins


def is_allowed_redirect_url(url: str | None) -> bool:
    """True if it's safe to deliver the JWT to ``url`` (None ⇒ use default)."""
    if not url:
        return True
    try:
        p = urlsplit(url)
    except ValueError:
        return False
    if p.scheme not in ("http", "https") or not p.hostname:
        return False
    # Native-app loopback (any port), http only.
    if p.scheme == "http" and p.hostname in _LOOPBACK_HOSTS:
        return True
    return f"{p.scheme}://{p.netloc}" in _allowed_redirect_origins()


def _validate_redirect_or_400(redirect_url: str | None) -> None:
    """Reject an attacker-supplied redirect_url early (fail fast at login)."""
    if redirect_url and not is_allowed_redirect_url(redirect_url):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "redirect_url not allowed")


def _post_oauth_redirect(
    custom_redirect_url: str | None, token: str, *, default_path: str = "/auth/callback"
) -> RedirectResponse:
    """Deliver the JWT to an allowlisted redirect, else a default frontend path.
    Single chokepoint so the token can never reach a disallowed URL.

    ``default_path`` lets a community sign-in land on the forum (``/community/…``)
    instead of the internal app callback when no explicit redirect was given.
    """
    frontend_url = settings.frontend_url or "http://localhost:3000"
    if custom_redirect_url and is_allowed_redirect_url(custom_redirect_url):
        separator = "&" if "?" in custom_redirect_url else "?"
        return RedirectResponse(url=f"{custom_redirect_url}{separator}token={token}")
    sep = "&" if "?" in default_path else "?"
    return RedirectResponse(url=f"{frontend_url}{default_path}{sep}token={token}")

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

# Microsoft (Entra ID / Azure AD) OAuth configuration.
# URLs are computed per-request from settings so MICROSOFT_TENANT_ID
# can be changed without a module reload (and so tests can override it).
MICROSOFT_GRAPH_ME_URL = "https://graph.microsoft.com/v1.0/me"


def _microsoft_authorize_url() -> str:
    tenant = settings.microsoft_tenant_id or "common"
    return f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize"


def _microsoft_token_url() -> str:
    tenant = settings.microsoft_tenant_id or "common"
    return f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"

# Microsoft OAuth scopes for authentication (basic profile + email)
MICROSOFT_AUTH_SCOPES = [
    "openid",
    "profile",
    "email",
    "User.Read",
    "offline_access",
]

# Microsoft OAuth scopes for CRM (Mail + Calendar via Graph)
MICROSOFT_CRM_SCOPES = MICROSOFT_AUTH_SCOPES + [
    "Mail.Read",
    "Mail.Send",
    "Calendars.ReadWrite",
]

# Redis key prefix for OAuth states
OAUTH_STATE_PREFIX = "oauth_state:"


def create_access_token(
    developer_id: str,
    account_type: str = "internal",
    actor: str | None = None,
) -> str:
    """Create a JWT access token.

    ``account_type`` is embedded as a claim so the isolation middleware can
    cheaply (no DB hit) block community-only accounts from internal endpoints.
    Only ``"community"`` is acted on; anything else (incl. legacy tokens without
    the claim) is treated as a normal internal user.

    ``actor`` says *what* is holding the token rather than who it speaks for —
    ``"agent"`` for a token `McpToolExecutor` mints to re-enter the app on
    somebody's behalf. Endpoints route an agent's write into review instead of
    applying it, and that decision used to be driven by a request header, which
    the caller controls: an agent holding an ordinary token and calling the REST
    API directly wrote straight through, so the review gate was opt-in by the
    agent. A signed claim cannot be set without the secret, so the gate is now
    the server's decision.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode = {
        "sub": developer_id,
        "exp": expire,
        "type": "access",
        "account_type": account_type,
    }
    if actor:
        to_encode["actor"] = actor
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


_DEVICE_PROVIDERS = {"github", "google", "microsoft"}


@router.get("/device/login")
async def device_login(provider: str, port: int) -> RedirectResponse:
    """Native-app sign-in entry point (Aexy Tracker desktop, RFC 8252 loopback).

    Validates the provider + loopback port, then redirects into the normal
    browser OAuth flow with a ``127.0.0.1`` ``redirect_url``. After the user
    signs in, the provider callback 302s the developer JWT to that loopback
    address, where the desktop app's local listener captures it (and exchanges
    it for a long-lived API token). The host is server-forced to loopback so the
    JWT can only ever be delivered to the local machine.
    """
    if provider not in _DEVICE_PROVIDERS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unsupported provider")
    if not 1024 <= port <= 65535:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Port out of range")
    redirect_url = f"http://127.0.0.1:{port}/callback"
    query = urlencode({"redirect_url": redirect_url})
    return RedirectResponse(url=f"/api/v1/auth/{provider}/login?{query}")


@router.get("/github/login")
async def github_login(
    redirect_url: str | None = None,
    context: str | None = None,
    community: str | None = None,
) -> RedirectResponse:
    """Initiate GitHub OAuth flow.

    ``context=community`` (with the community slug) flags a sign-in that came
    from a public forum, so a brand-new account is created community-only and
    the user is returned to the forum rather than the internal app.
    """
    _validate_redirect_or_400(redirect_url)
    state = secrets.token_urlsafe(32)

    # Store state in Redis with TTL (auto-expires, no cleanup needed)
    redis_client = get_redis_client()
    state_data = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "type": "github",
        "redirect_url": redirect_url,
        "context": context,
        "community": community,
    }
    redis_client.setex(f"{OAUTH_STATE_PREFIX}{state}", OAUTH_STATE_TTL, json.dumps(state_data))

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

    # For OAuth flow, verify state and get redirect URL
    custom_redirect_url = None
    signup_context = None
    community_slug = None
    if not is_installation_callback:
        redis_client = get_redis_client()
        state_key = f"{OAUTH_STATE_PREFIX}{state}"
        state_data_raw = redis_client.get(state_key) if state else None
        if not state or not state_data_raw:
            return RedirectResponse(url=f"{frontend_url}/?error=invalid_state")
        state_data = json.loads(state_data_raw)
        custom_redirect_url = state_data.get("redirect_url")
        signup_context = state_data.get("context")
        community_slug = state_data.get("community")
        redis_client.delete(state_key)

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

    # Calculate token expiry if GitHub provided it (GitHub App tokens expire)
    token_expires_at = None
    if auth_response.expires_in:
        token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=auth_response.expires_in)

    developer = await dev_service.get_or_create_by_github(
        github_id=user_info.id,
        github_username=user_info.login,
        email=email,
        access_token=auth_response.access_token,
        github_name=user_info.name,
        github_avatar_url=user_info.avatar_url,
        scopes=scopes,
        refresh_token=auth_response.refresh_token,
        token_expires_at=token_expires_at,
        signup_context=signup_context,
    )

    # A community sign-in auto-joins the target community (non-billable), so the
    # participant has a stable identity + display prefs from the first visit.
    if signup_context == "community" and community_slug:
        await _join_community_after_login(db, developer.id, community_slug)

    # If this is an installation callback, sync the installation and fetch repos
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

                # Auto-fetch available repositories so user doesn't have to
                # manually click "Refresh from GitHub"
                try:
                    await repo_service.sync_repos_from_installations(developer.id)
                    await db.commit()
                except Exception:
                    pass  # Non-critical, user can refresh later
        except Exception as e:
            # Log but don't fail - user can sync later
            print(f"Failed to sync installation: {e}")

    # Create JWT
    access_token = create_access_token(developer.id, account_type=developer.account_type)

    # Always deliver the token to /auth/callback (single secure token-storage
    # chokepoint). Where a community account goes next is decided client-side in
    # useSetToken from the account_type, so no community-specific redirect here.
    return _post_oauth_redirect(custom_redirect_url, access_token)


# ============================================================================
# Google OAuth endpoints
# ============================================================================


def _clean_old_oauth_states():
    """Clean expired OAuth states - no-op since Redis handles TTL automatically."""
    pass


@router.get("/google/login")
async def google_login(
    redirect_url: str | None = None,
    context: str | None = None,
    community: str | None = None,
) -> RedirectResponse:
    """Initiate Google OAuth flow for authentication.

    ``context=community`` (with the community slug) flags a public-forum sign-in
    — a brand-new account is created community-only and returned to the forum.
    """
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured",
        )
    _validate_redirect_or_400(redirect_url)

    state = secrets.token_urlsafe(32)

    # Store state in Redis with metadata
    redis_client = get_redis_client()
    state_data = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "scope_type": "login",
        "redirect_url": redirect_url,
        "context": context,
        "community": community,
    }
    redis_client.setex(f"{OAUTH_STATE_PREFIX}{state}", OAUTH_STATE_TTL, json.dumps(state_data))

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
    _validate_redirect_or_400(redirect_url)

    state = secrets.token_urlsafe(32)

    # Store state in Redis with metadata
    redis_client = get_redis_client()
    state_data = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "scope_type": "crm",
        "redirect_url": redirect_url,
    }
    redis_client.setex(f"{OAUTH_STATE_PREFIX}{state}", OAUTH_STATE_TTL, json.dumps(state_data))

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

    # Verify state from Redis
    redis_client = get_redis_client()
    state_key = f"{OAUTH_STATE_PREFIX}{state}"
    state_data_raw = redis_client.get(state_key)
    if not state or not state_data_raw:
        return RedirectResponse(url=f"{frontend_url}/?error=invalid_state")
    redis_client.delete(state_key)

    # Get metadata about this OAuth flow
    state_meta = json.loads(state_data_raw)
    scope_type = state_meta.get("scope_type", "login")
    custom_redirect_url = state_meta.get("redirect_url")
    signup_context = state_meta.get("context")
    community_slug = state_meta.get("community")

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
                signup_context=signup_context,
            )

            # Commit the transaction
            await db.commit()

            if signup_context == "community" and community_slug:
                await _join_community_after_login(db, developer.id, community_slug)

            # Create JWT
            jwt_token = create_access_token(developer.id, account_type=developer.account_type)

            # Deliver the token to /auth/callback (secure token-storage
            # chokepoint); community routing is decided client-side in useSetToken.
            return _post_oauth_redirect(custom_redirect_url, jwt_token)

    except httpx.RequestError as e:
        logger.error(f"Google OAuth request error: {e}", exc_info=True)
        return RedirectResponse(url=f"{frontend_url}/?error=request_failed")
    except Exception as e:
        logger.error(f"Google OAuth callback failed: {e}", exc_info=True)
        return RedirectResponse(url=f"{frontend_url}/?error=auth_failed")


# ============================ Microsoft OAuth ============================


def _microsoft_authorize_redirect(scope_type: str, redirect_url: str | None) -> RedirectResponse:
    """Build the Microsoft authorize URL and return a RedirectResponse."""
    if not settings.microsoft_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Microsoft OAuth is not configured",
        )
    _validate_redirect_or_400(redirect_url)

    state = secrets.token_urlsafe(32)
    redis_client = get_redis_client()
    state_data = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "scope_type": scope_type,  # "login" or "crm"
        "provider": "microsoft",
        "redirect_url": redirect_url,
    }
    redis_client.setex(f"{OAUTH_STATE_PREFIX}{state}", OAUTH_STATE_TTL, json.dumps(state_data))

    scopes = MICROSOFT_CRM_SCOPES if scope_type == "crm" else MICROSOFT_AUTH_SCOPES
    params = {
        "client_id": settings.microsoft_client_id,
        "redirect_uri": settings.microsoft_auth_redirect_uri,
        "response_type": "code",
        "scope": " ".join(scopes),
        "state": state,
        # select_account for normal logins, consent for CRM upgrades
        "prompt": "consent" if scope_type == "crm" else "select_account",
        "response_mode": "query",
    }
    return RedirectResponse(url=f"{_microsoft_authorize_url()}?{urlencode(params)}")


@router.get("/microsoft/login")
async def microsoft_login(redirect_url: str | None = None) -> RedirectResponse:
    """Initiate Microsoft OAuth flow for authentication."""
    return _microsoft_authorize_redirect("login", redirect_url)


@router.get("/microsoft/connect-crm")
async def microsoft_connect_crm(redirect_url: str | None = None) -> RedirectResponse:
    """Initiate Microsoft OAuth flow with Mail + Calendar scopes."""
    return _microsoft_authorize_redirect("crm", redirect_url)


@router.get("/microsoft/callback")
async def microsoft_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Handle Microsoft OAuth callback."""
    frontend_url = settings.frontend_url or "http://localhost:3000"

    if error:
        logger.warning(f"Microsoft OAuth returned error: {error} — {error_description}")
        return RedirectResponse(url=f"{frontend_url}/?error={error}")

    if not code:
        return RedirectResponse(url=f"{frontend_url}/?error=missing_code")

    # Verify state
    if not state:
        return RedirectResponse(url=f"{frontend_url}/?error=invalid_state")
    redis_client = get_redis_client()
    state_key = f"{OAUTH_STATE_PREFIX}{state}"
    state_data_raw = redis_client.get(state_key)
    if not state_data_raw:
        return RedirectResponse(url=f"{frontend_url}/?error=invalid_state")
    redis_client.delete(state_key)

    state_meta = json.loads(state_data_raw)
    scope_type = state_meta.get("scope_type", "login")
    custom_redirect_url = state_meta.get("redirect_url")
    scopes_to_store = MICROSOFT_CRM_SCOPES if scope_type == "crm" else MICROSOFT_AUTH_SCOPES

    try:
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                _microsoft_token_url(),
                data={
                    "client_id": settings.microsoft_client_id,
                    "client_secret": settings.microsoft_client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": settings.microsoft_auth_redirect_uri,
                    # Microsoft requires scope on the token exchange for v2.0
                    "scope": " ".join(scopes_to_store),
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

            if token_response.status_code != 200:
                logger.error(
                    f"Microsoft token exchange failed: {token_response.status_code} — {token_response.text}"
                )
                return RedirectResponse(url=f"{frontend_url}/?error=token_exchange_failed")

            token_data = token_response.json()
            access_token = token_data.get("access_token")
            refresh_token = token_data.get("refresh_token")
            expires_in = token_data.get("expires_in", 3600)

            if not access_token:
                return RedirectResponse(url=f"{frontend_url}/?error=no_access_token")

            token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

            # Fetch profile from Microsoft Graph
            userinfo_response = await client.get(
                MICROSOFT_GRAPH_ME_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if userinfo_response.status_code != 200:
                logger.error(
                    f"Microsoft Graph /me failed: {userinfo_response.status_code} — {userinfo_response.text}"
                )
                return RedirectResponse(url=f"{frontend_url}/?error=userinfo_failed")

            userinfo = userinfo_response.json()
            microsoft_id = userinfo.get("id")
            # Graph returns `mail` for Entra accounts, falls back to userPrincipalName
            # for personal accounts (and some work accounts without a licensed mailbox).
            email = userinfo.get("mail") or userinfo.get("userPrincipalName")
            name = userinfo.get("displayName")

            if not microsoft_id or not email:
                return RedirectResponse(url=f"{frontend_url}/?error=missing_user_info")

            dev_service = DeveloperService(db)
            developer = await dev_service.get_or_create_by_microsoft(
                microsoft_id=microsoft_id,
                microsoft_email=email,
                access_token=access_token,
                refresh_token=refresh_token,
                token_expires_at=token_expires_at,
                microsoft_name=name,
                scopes=scopes_to_store,
            )

            await db.commit()

            jwt_token = create_access_token(developer.id, account_type=developer.account_type)

            # Deliver the token only to an allowlisted redirect.
            return _post_oauth_redirect(custom_redirect_url, jwt_token)

    except httpx.RequestError as e:
        logger.error(f"Microsoft OAuth request error: {e}", exc_info=True)
        return RedirectResponse(url=f"{frontend_url}/?error=request_failed")
    except Exception as e:
        logger.error(f"Microsoft OAuth callback failed: {e}", exc_info=True)
        return RedirectResponse(url=f"{frontend_url}/?error=auth_failed")
