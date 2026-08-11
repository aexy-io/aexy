"""OAuth 2.1 endpoints for remote MCP clients.

The discovery documents are mounted at the domain root, NOT under `/api/v1`.
That is not a style preference: RFC 8414 and RFC 9728 define these as
well-known URIs on the origin, and a client that cannot find them at the root
concludes the server does not support OAuth and gives up. ChatGPT does exactly
this.

The flow a client walks:

  1. GET /.well-known/oauth-protected-resource  → who guards this resource
  2. GET /.well-known/oauth-authorization-server → the endpoints below
  3. POST /oauth/register                        → the client names itself
  4. GET  /oauth/authorize                       → a person consents, in a browser
  5. POST /oauth/token                           → code + verifier become tokens
"""

from __future__ import annotations

import base64
from typing import Annotated
from urllib.parse import unquote, urlencode

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.config import settings
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.schemas.mcp_oauth import (
    ClientRegistrationRequest,
    ClientRegistrationResponse,
    ConsentGrantRequest,
    ConsentPromptResponse,
    TokenResponse,
)
from aexy.services.mcp_oauth_service import (
    DEFAULT_SCOPE,
    SUPPORTED_SCOPES,
    McpOAuthService,
    OAuthError,
)
from aexy.services.workspace_service import WorkspaceService

# Root-mounted: the two well-known documents and the endpoints they advertise.
router = APIRouter(tags=["mcp-oauth"])


def _base_url() -> str:
    return settings.backend_url.rstrip("/")


def _resource_url() -> str:
    """The MCP endpoint itself — the resource these tokens are good for."""
    return f"{_base_url()}{settings.api_v1_prefix}/mcp"


def _oauth_error(exc: OAuthError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.error, "error_description": exc.description},
    )


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------


@router.get("/.well-known/oauth-protected-resource")
async def protected_resource_metadata() -> dict:
    """RFC 9728. Points a client from the resource to its authorization server."""
    return {
        "resource": _resource_url(),
        "authorization_servers": [_base_url()],
        "scopes_supported": list(SUPPORTED_SCOPES),
        "bearer_methods_supported": ["header"],
    }


@router.get("/.well-known/oauth-authorization-server")
async def authorization_server_metadata() -> dict:
    """RFC 8414. Everything a client needs to drive the flow without being told."""
    base = _base_url()
    return {
        "issuer": base,
        "authorization_endpoint": f"{base}/oauth/authorize",
        "token_endpoint": f"{base}/oauth/token",
        "registration_endpoint": f"{base}/oauth/register",
        "revocation_endpoint": f"{base}/oauth/revoke",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        # S256 only, and advertised as such: a client that sees `plain` here may
        # legitimately choose it, and `plain` protects nobody.
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": [
            "client_secret_post",
            "client_secret_basic",
            "none",
        ],
        "scopes_supported": list(SUPPORTED_SCOPES),
        "service_documentation": "https://github.com/aexy-io/mcp-server",
    }


# ---------------------------------------------------------------------------
# Dynamic client registration
# ---------------------------------------------------------------------------


@router.post("/oauth/register", status_code=201)
async def register_client(
    body: ClientRegistrationRequest,
    db: AsyncSession = Depends(get_db),
):
    """RFC 7591. Open by design — see McpOAuthService.register_client."""
    service = McpOAuthService(db)
    try:
        client, secret = await service.register_client(
            client_name=body.client_name,
            redirect_uris=body.redirect_uris,
            grant_types=body.grant_types,
            token_endpoint_auth_method=body.token_endpoint_auth_method,
            client_uri=body.client_uri,
            logo_uri=body.logo_uri,
        )
    except OAuthError as exc:
        return _oauth_error(exc)

    return ClientRegistrationResponse(
        client_id=client.client_id,
        # The only time this is ever readable. It is stored as a digest.
        client_secret=secret,
        client_name=client.client_name,
        redirect_uris=client.redirect_uris,
        grant_types=client.grant_types,
        token_endpoint_auth_method=client.token_endpoint_auth_method,
    )


# ---------------------------------------------------------------------------
# Authorization + consent
# ---------------------------------------------------------------------------


@router.get("/oauth/authorize")
async def authorize(
    request: Request,
    response_type: Annotated[str, Query()],
    client_id: Annotated[str, Query()],
    redirect_uri: Annotated[str, Query()],
    code_challenge: Annotated[str, Query()],
    code_challenge_method: Annotated[str, Query()] = "S256",
    scope: Annotated[str | None, Query()] = None,
    state: Annotated[str | None, Query()] = None,
    db: AsyncSession = Depends(get_db),
):
    """Validate the request, then hand off to the consent screen in the app.

    Nothing is issued here. This endpoint's whole job is to refuse a malformed
    or hostile request *before* a person is asked to approve anything, and then
    send them somewhere they are already logged in to make the decision.
    """
    service = McpOAuthService(db)
    try:
        if response_type != "code":
            raise OAuthError(
                "unsupported_response_type",
                "Only response_type=code is supported; OAuth 2.1 removes the "
                "implicit grant",
            )
        client = await service.validate_authorization_request(
            client_id=client_id,
            redirect_uri=redirect_uri,
            code_challenge=code_challenge,
            code_challenge_method=code_challenge_method,
            scope=scope,
        )
    except OAuthError as exc:
        # Only redirect errors back to a *validated* redirect_uri. Before
        # validation the URI is attacker-supplied, so bouncing an error to it
        # would make this endpoint an open redirect.
        return _oauth_error(exc)

    params = {
        "client_id": client_id,
        "client_name": client.client_name,
        "redirect_uri": redirect_uri,
        "code_challenge": code_challenge,
        "code_challenge_method": code_challenge_method,
        "scope": scope or DEFAULT_SCOPE,
    }
    if state:
        params["state"] = state
    return RedirectResponse(
        url=f"{settings.frontend_url.rstrip('/')}/oauth/consent?{urlencode(params)}",
        status_code=302,
    )


@router.get("/oauth/authorize/prompt", response_model=ConsentPromptResponse)
async def consent_prompt(
    client_id: Annotated[str, Query()],
    redirect_uri: Annotated[str, Query()],
    db: AsyncSession = Depends(get_db),
):
    """What the consent screen renders.

    Served from the server rather than trusted from the query string: the
    client_name shown to a person deciding whether to grant access must be the
    registered one, not whatever the redirecting page chose to display.
    """
    service = McpOAuthService(db)
    client = await service.get_client(client_id)
    if client is None:
        raise HTTPException(status_code=404, detail="Unknown client")
    if redirect_uri not in (client.redirect_uris or []):
        raise HTTPException(status_code=400, detail="redirect_uri is not registered")

    return ConsentPromptResponse(
        client_id=client.client_id,
        client_name=client.client_name,
        client_uri=client.client_uri,
        logo_uri=client.logo_uri,
        redirect_uri=redirect_uri,
    )


@router.post("/oauth/authorize/grant")
async def grant_consent(
    body: ConsentGrantRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """The moment a person actually grants access. Requires them to be logged in.

    Two checks that carry the whole flow's weight:

      * the request is re-validated here, because the browser reached this via a
        redirect and every parameter came back through the client's hands;
      * the person must be a member of the workspace they are exposing. Without
        it, anyone could consent to a workspace id they merely guessed, and the
        tool list would be built from *their* access in a workspace they do not
        belong to — which resolves to nothing, but the grant would still exist.
    """
    service = McpOAuthService(db)
    try:
        await service.validate_authorization_request(
            client_id=body.client_id,
            redirect_uri=body.redirect_uri,
            code_challenge=body.code_challenge,
            code_challenge_method=body.code_challenge_method,
            scope=body.scope,
        )
    except OAuthError as exc:
        return _oauth_error(exc)

    member = await WorkspaceService(db).get_member(body.workspace_id, current_user.id)
    if member is None:
        raise HTTPException(
            status_code=403,
            detail="You are not a member of that workspace",
        )

    code = await service.create_authorization_code(
        client_id=body.client_id,
        developer_id=current_user.id,
        workspace_id=body.workspace_id,
        redirect_uri=body.redirect_uri,
        scope=body.scope or DEFAULT_SCOPE,
        code_challenge=body.code_challenge,
        code_challenge_method=body.code_challenge_method,
    )

    params = {"code": code}
    if body.state:
        params["state"] = body.state
    separator = "&" if "?" in body.redirect_uri else "?"
    return {"redirect_to": f"{body.redirect_uri}{separator}{urlencode(params)}"}


# ---------------------------------------------------------------------------
# Token
# ---------------------------------------------------------------------------


@router.post("/oauth/token")
async def token(
    request: Request,
    grant_type: Annotated[str, Form()],
    db: AsyncSession = Depends(get_db),
    code: Annotated[str | None, Form()] = None,
    redirect_uri: Annotated[str | None, Form()] = None,
    code_verifier: Annotated[str | None, Form()] = None,
    refresh_token: Annotated[str | None, Form()] = None,
    client_id: Annotated[str | None, Form()] = None,
    client_secret: Annotated[str | None, Form()] = None,
):
    """Form-encoded per RFC 6749; clients will not send JSON here."""
    service = McpOAuthService(db)

    # client_secret_basic: credentials in the Authorization header instead of
    # the body. Advertised in the metadata, so it has to actually work.
    basic_id, basic_secret = _basic_auth_credentials(request)
    client_id = client_id or basic_id
    client_secret = client_secret or basic_secret

    if not client_id:
        return _oauth_error(OAuthError("invalid_client", "client_id is required", 401))

    try:
        if grant_type == "authorization_code":
            if not code or not redirect_uri or not code_verifier:
                raise OAuthError(
                    "invalid_request",
                    "code, redirect_uri and code_verifier are all required",
                )
            issued = await service.exchange_code(
                code=code,
                client_id=client_id,
                client_secret=client_secret,
                redirect_uri=redirect_uri,
                code_verifier=code_verifier,
            )
        elif grant_type == "refresh_token":
            if not refresh_token:
                raise OAuthError("invalid_request", "refresh_token is required")
            issued = await service.refresh(
                refresh_token=refresh_token,
                client_id=client_id,
                client_secret=client_secret,
            )
        else:
            raise OAuthError(
                "unsupported_grant_type",
                f"Unsupported grant_type: {grant_type}",
            )
    except OAuthError as exc:
        return _oauth_error(exc)

    return TokenResponse(
        access_token=issued.access_token,
        refresh_token=issued.refresh_token,
        expires_in=issued.expires_in,
        scope=issued.scope,
    )


@router.post("/oauth/revoke")
async def revoke(
    token: Annotated[str, Form()],
    db: AsyncSession = Depends(get_db),
):
    """RFC 7009. Always 200, even for an unknown token.

    Telling a caller whether a token existed turns this into an oracle for
    probing them.
    """
    await McpOAuthService(db).revoke_token(token)
    return {}


def _basic_auth_credentials(request: Request) -> tuple[str | None, str | None]:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("basic "):
        return None, None
    try:
        raw = base64.b64decode(header[6:]).decode()
        client_id, _, client_secret = raw.partition(":")
        return unquote(client_id), unquote(client_secret)
    except (ValueError, UnicodeDecodeError):
        return None, None
