"""Pydantic schemas for repository and organization APIs."""

from datetime import datetime

from pydantic import BaseModel, Field


class OrganizationResponse(BaseModel):
    """Organization response schema."""

    id: str
    github_id: int
    login: str
    name: str | None
    avatar_url: str | None
    is_enabled: bool
    repository_count: int
    enabled_repository_count: int

    class Config:
        from_attributes = True


class RepositoryResponse(BaseModel):
    """Repository response schema."""

    id: str
    github_id: int
    full_name: str
    name: str
    owner_login: str
    owner_type: str
    description: str | None
    is_private: bool
    language: str | None
    organization_id: str | None
    is_enabled: bool
    sync_status: str
    last_sync_at: datetime | None
    commits_synced: int
    prs_synced: int
    reviews_synced: int
    webhook_status: str

    class Config:
        from_attributes = True


class RepositoryStatusResponse(BaseModel):
    """Repository sync/webhook status response."""

    repository_id: str
    is_enabled: bool
    sync_status: str
    last_sync_at: datetime | None
    sync_error: str | None
    commits_synced: int
    prs_synced: int
    reviews_synced: int
    webhook_id: int | None
    webhook_status: str


class SyncRefreshResponse(BaseModel):
    """Response for sync refresh operation."""

    organizations: dict[str, int] = Field(
        description="Count of created/updated organizations"
    )
    repositories: dict[str, int] = Field(
        description="Count of created/updated repositories"
    )


class EnableRepositoryResponse(BaseModel):
    """Response after enabling a repository."""

    id: str
    repository_id: str
    is_enabled: bool
    sync_status: str


class SyncStartRequest(BaseModel):
    """Request to start a sync."""

    sync_type: str = Field(
        default="incremental",
        description="Sync type: 'full' or 'incremental'",
    )
    use_celery: bool = Field(
        default=False,
        description="Use Celery task queue for background processing",
    )


class SyncStartResponse(BaseModel):
    """Response after starting a sync."""

    job_id: str
    message: str
    sync_type: str = "incremental"
    use_celery: bool = False


class OnboardingStatusResponse(BaseModel):
    """Onboarding status response."""

    completed: bool


class WebhookRegisterResponse(BaseModel):
    """Response after registering a webhook."""

    webhook_id: int
    status: str


class InstallationResponse(BaseModel):
    """GitHub App installation info."""

    installation_id: int
    account_login: str
    account_type: str
    repository_selection: str
    is_active: bool


class InstallationStatusResponse(BaseModel):
    """Response for installation status check."""

    has_installation: bool
    installations: list[InstallationResponse]
    install_url: str | None = None
