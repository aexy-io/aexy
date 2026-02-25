"""Authentication-related Pydantic schemas."""

from pydantic import BaseModel


class GitHubAuthResponse(BaseModel):
    """Response from GitHub OAuth."""

    access_token: str
    token_type: str = "bearer"
    scope: str
    refresh_token: str | None = None
    expires_in: int | None = None  # seconds until access_token expires
    refresh_token_expires_in: int | None = None


class TokenResponse(BaseModel):
    """JWT token response."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int


class GitHubUserInfo(BaseModel):
    """GitHub user information from API."""

    id: int
    login: str
    name: str | None = None
    email: str | None = None
    avatar_url: str | None = None
