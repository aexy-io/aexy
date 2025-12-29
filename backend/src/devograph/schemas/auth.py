"""Authentication-related Pydantic schemas."""

from pydantic import BaseModel


class GitHubAuthResponse(BaseModel):
    """Response from GitHub OAuth."""

    access_token: str
    token_type: str = "bearer"
    scope: str


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
