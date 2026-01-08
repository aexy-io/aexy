"""Repository and organization management API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer_id
from aexy.core.database import get_db
from aexy.schemas.repository import (
    EnableRepositoryResponse,
    InstallationResponse,
    InstallationStatusResponse,
    OnboardingStatusResponse,
    OrganizationResponse,
    RepositoryResponse,
    RepositoryStatusResponse,
    SyncRefreshResponse,
    SyncStartResponse,
    WebhookRegisterResponse,
)
from aexy.services.github_app_service import GitHubAppService, GitHubAppError
from aexy.services.repository_service import RepositoryService
from aexy.services.sync_service import SyncService

router = APIRouter(prefix="/repositories")


# === ONBOARDING (must be before parameterized routes) ===


@router.get("/onboarding/status", response_model=OnboardingStatusResponse)
async def get_onboarding_status(
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> OnboardingStatusResponse:
    """Get onboarding completion status."""
    service = RepositoryService(db)
    try:
        completed = await service.get_onboarding_status(developer_id)
        return OnboardingStatusResponse(completed=completed)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/onboarding/complete")
async def complete_onboarding(
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Mark onboarding as complete."""
    service = RepositoryService(db)
    try:
        await service.complete_onboarding(developer_id)
        return {"message": "Onboarding completed"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


# === INSTALLATION (must be before parameterized routes) ===


@router.get("/installation/status", response_model=InstallationStatusResponse)
async def get_installation_status(
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> InstallationStatusResponse:
    """Check if the GitHub App is installed for this user."""
    app_service = GitHubAppService(db)

    try:
        installations = await app_service.get_user_installations(developer_id)

        install_url = None
        if not installations:
            try:
                install_url = app_service.get_app_install_url()
            except GitHubAppError:
                pass

        return InstallationStatusResponse(
            has_installation=len(installations) > 0,
            installations=[
                InstallationResponse(
                    installation_id=inst.installation_id,
                    account_login=inst.account_login,
                    account_type=inst.account_type,
                    repository_selection=inst.repository_selection,
                    is_active=inst.is_active,
                )
                for inst in installations
            ],
            install_url=install_url,
        )
    except GitHubAppError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post("/installation/sync")
async def sync_installations(
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Sync GitHub App installations for the current user."""
    repo_service = RepositoryService(db)
    app_service = GitHubAppService(db)

    try:
        # Get the user's GitHub connection
        connection = await repo_service.get_github_connection(developer_id)
        if not connection:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="GitHub connection not found",
            )

        # Sync installations
        installations = await app_service.sync_user_installations(
            connection.id,
            connection.github_username,
        )

        await db.commit()

        return {
            "message": f"Synced {len(installations)} installation(s)",
            "count": len(installations),
        }
    except GitHubAppError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


# === SYNC (must be before parameterized routes) ===


@router.post("/sync/refresh", response_model=SyncRefreshResponse)
async def refresh_available_repos(
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> SyncRefreshResponse:
    """Re-fetch available repos/orgs from GitHub.

    First tries to sync from GitHub App installations.
    Falls back to user access token if no installations found.
    """
    service = RepositoryService(db)
    app_service = GitHubAppService(db)

    # First, sync installations from GitHub
    connection = await service.get_github_connection(developer_id)
    if connection:
        try:
            await app_service.sync_user_installations(
                connection.id,
                connection.github_username,
            )
            await db.commit()
        except GitHubAppError:
            pass  # App not configured, will fall back to user token

    # Try to sync from installations first
    try:
        installations = await app_service.get_user_installations(developer_id)
        if installations:
            result = await service.sync_repos_from_installations(developer_id)
            return SyncRefreshResponse(**result)
    except GitHubAppError:
        pass  # Fall back to user token

    # Fall back to user access token (legacy OAuth flow)
    access_token = await service.get_developer_access_token(developer_id)

    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub connection not found",
        )

    result = await service.sync_user_repos_and_orgs(developer_id, access_token)
    return SyncRefreshResponse(**result)


# === ORGANIZATIONS ===


@router.get("/organizations", response_model=list[OrganizationResponse])
async def list_organizations(
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> list[OrganizationResponse]:
    """List all organizations the developer belongs to with enabled state."""
    service = RepositoryService(db)
    orgs = await service.get_user_organizations(developer_id)
    return [OrganizationResponse(**org) for org in orgs]


@router.post("/organizations/{org_id}/enable")
async def enable_organization(
    org_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Enable all repositories in an organization."""
    service = RepositoryService(db)
    try:
        count = await service.enable_organization(developer_id, org_id)
        return {"message": f"Enabled {count} repositories", "count": count}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/organizations/{org_id}/disable")
async def disable_organization(
    org_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Disable all repositories in an organization."""
    service = RepositoryService(db)
    try:
        count = await service.disable_organization(developer_id, org_id)
        return {"message": f"Disabled {count} repositories", "count": count}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


# === REPOSITORIES ===


@router.get("", response_model=list[RepositoryResponse])
async def list_repositories(
    developer_id: str = Depends(get_current_developer_id),
    organization_id: str | None = Query(None, description="Filter by organization ID"),
    enabled_only: bool = Query(False, description="Only show enabled repositories"),
    db: AsyncSession = Depends(get_db),
) -> list[RepositoryResponse]:
    """List repositories with optional filtering."""
    service = RepositoryService(db)
    repos = await service.get_repositories(
        developer_id,
        organization_id=organization_id,
        enabled_only=enabled_only,
    )
    return [RepositoryResponse(**repo) for repo in repos]


@router.post("/{repo_id}/enable", response_model=EnableRepositoryResponse)
async def enable_repository(
    repo_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> EnableRepositoryResponse:
    """Enable a repository for syncing."""
    # Check plan limits before enabling
    from aexy.services.limits_service import LimitsService
    limits_service = LimitsService(db)
    can_enable, error = await limits_service.can_sync_repo(developer_id)
    if not can_enable:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=error or "Repository limit reached",
        )

    service = RepositoryService(db)
    try:
        dev_repo = await service.enable_repository(developer_id, repo_id)
        return EnableRepositoryResponse(
            id=dev_repo.id,
            repository_id=dev_repo.repository_id,
            is_enabled=dev_repo.is_enabled,
            sync_status=dev_repo.sync_status,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/{repo_id}/disable")
async def disable_repository(
    repo_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Disable a repository."""
    service = RepositoryService(db)
    try:
        await service.disable_repository(developer_id, repo_id)
        return {"message": "Repository disabled"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/{repo_id}/status", response_model=RepositoryStatusResponse)
async def get_repository_status(
    repo_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> RepositoryStatusResponse:
    """Get sync and webhook status for a repository."""
    service = SyncService(db)
    try:
        status_data = await service.get_sync_status(developer_id, repo_id)
        return RepositoryStatusResponse(**status_data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/{repo_id}/sync/start", response_model=SyncStartResponse)
async def start_sync(
    repo_id: str,
    sync_type: str = Query("incremental", description="Sync type: 'full' or 'incremental'"),
    use_celery: bool = Query(False, description="Use Celery task queue"),
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> SyncStartResponse:
    """Start historical sync for a repository.

    Args:
        repo_id: Repository ID.
        sync_type: 'full' for complete sync, 'incremental' for only new data.
        use_celery: If True, use Celery task queue (better for large repos).
    """
    # Validate sync_type
    if sync_type not in ("full", "incremental"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="sync_type must be 'full' or 'incremental'",
        )

    service = SyncService(db)
    try:
        job_id = await service.start_historical_sync(
            developer_id=developer_id,
            repository_id=repo_id,
            sync_type=sync_type,
            use_celery=use_celery,
        )
        return SyncStartResponse(
            job_id=job_id,
            message=f"{sync_type.title()} sync started successfully",
            sync_type=sync_type,
            use_celery=use_celery,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{repo_id}/webhook/register", response_model=WebhookRegisterResponse)
async def register_webhook(
    repo_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> WebhookRegisterResponse:
    """Register a GitHub webhook for real-time updates."""
    service = SyncService(db)
    try:
        webhook_id = await service.register_webhook(developer_id, repo_id)
        return WebhookRegisterResponse(webhook_id=webhook_id, status="active")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{repo_id}/webhook/unregister")
async def unregister_webhook(
    repo_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Remove a GitHub webhook."""
    service = SyncService(db)
    try:
        await service.unregister_webhook(developer_id, repo_id)
        return {"message": "Webhook removed"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# === USAGE AND LIMITS ===


@router.get("/usage/summary")
async def get_usage_summary(
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get usage summary including plan limits and current usage.

    Returns repository limits, LLM usage, and enabled features.
    """
    from aexy.services.limits_service import LimitsService
    limits_service = LimitsService(db)
    try:
        return await limits_service.get_usage_summary(developer_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


# === FILE BROWSING ===


@router.get("/{repo_id}/contents")
async def get_repository_contents(
    repo_id: str,
    path: str = Query("", description="Path within the repository"),
    ref: str = Query("main", description="Branch, tag, or commit SHA"),
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Browse contents of a repository directory.

    Returns list of files and directories at the specified path.
    """
    repo_service = RepositoryService(db)
    app_service = GitHubAppService(db)

    try:
        # Get the repository
        repo = await repo_service.get_repository_by_id(repo_id)
        if not repo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Repository not found",
            )

        # Get installation token for the developer
        token_result = await app_service.get_installation_token_for_developer(
            developer_id, repo.owner_login
        )
        if not token_result:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No GitHub App installation found. Please install the app first.",
            )

        token, installation_id = token_result

        # Get contents
        contents = await app_service.get_repository_contents(
            installation_id=installation_id,
            owner=repo.owner_login,
            repo=repo.name,
            path=path,
            ref=ref,
        )

        return contents

    except GitHubAppError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/{repo_id}/file")
async def get_file_content(
    repo_id: str,
    path: str = Query(..., description="Path to the file"),
    ref: str = Query("main", description="Branch, tag, or commit SHA"),
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get content of a specific file.

    Returns file content along with metadata.
    """
    repo_service = RepositoryService(db)
    app_service = GitHubAppService(db)

    try:
        # Get the repository
        repo = await repo_service.get_repository_by_id(repo_id)
        if not repo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Repository not found",
            )

        # Get installation token for the developer
        token_result = await app_service.get_installation_token_for_developer(
            developer_id, repo.owner_login
        )
        if not token_result:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No GitHub App installation found. Please install the app first.",
            )

        token, installation_id = token_result

        # Get file content
        file_content = await app_service.get_file_content(
            installation_id=installation_id,
            owner=repo.owner_login,
            repo=repo.name,
            path=path,
            ref=ref,
        )

        if not file_content:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found",
            )

        return file_content

    except GitHubAppError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/{repo_id}/branches")
async def get_repository_branches(
    repo_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Get list of branches for a repository."""
    repo_service = RepositoryService(db)
    app_service = GitHubAppService(db)

    try:
        # Get the repository
        repo = await repo_service.get_repository_by_id(repo_id)
        if not repo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Repository not found",
            )

        # Get installation token for the developer
        token_result = await app_service.get_installation_token_for_developer(
            developer_id, repo.owner_login
        )
        if not token_result:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No GitHub App installation found. Please install the app first.",
            )

        token, installation_id = token_result

        # Get branches
        branches = await app_service.get_repository_branches(
            installation_id=installation_id,
            owner=repo.owner_login,
            repo=repo.name,
        )

        return branches

    except GitHubAppError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
