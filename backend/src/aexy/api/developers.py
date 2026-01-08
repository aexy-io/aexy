"""Developer profile endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError, jwt
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from pydantic import BaseModel
from sqlalchemy import select

from aexy.core.config import get_settings
from aexy.core.database import get_db
from aexy.models.developer import GoogleConnection
from aexy.schemas.developer import DeveloperResponse, DeveloperUpdate
from aexy.services.developer_service import DeveloperNotFoundError, DeveloperService


class GoogleConnectionStatus(BaseModel):
    """Response for Google connection status."""
    is_connected: bool
    google_email: str | None = None

router = APIRouter()
settings = get_settings()
security = HTTPBearer()


async def get_current_developer_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """Extract and validate developer ID from JWT token."""
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.secret_key,
            algorithms=[settings.algorithm],
        )
        developer_id = payload.get("sub")
        if developer_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )
        return developer_id
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from e


@router.get("/me", response_model=DeveloperResponse)
async def get_current_developer(
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> DeveloperResponse:
    """Get the current authenticated developer's profile."""
    service = DeveloperService(db)
    try:
        developer = await service.get_by_id(developer_id)
    except DeveloperNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer not found",
        ) from e

    return DeveloperResponse.model_validate(developer)


@router.get("/me/google-status", response_model=GoogleConnectionStatus)
async def get_google_connection_status(
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> GoogleConnectionStatus:
    """Check if the current developer has a Google connection."""
    result = await db.execute(
        select(GoogleConnection).where(GoogleConnection.developer_id == developer_id)
    )
    connection = result.scalar_one_or_none()

    if connection:
        return GoogleConnectionStatus(
            is_connected=True,
            google_email=connection.google_email,
        )

    return GoogleConnectionStatus(is_connected=False)


@router.patch("/me", response_model=DeveloperResponse)
async def update_current_developer(
    update_data: DeveloperUpdate,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> DeveloperResponse:
    """Update the current developer's profile."""
    service = DeveloperService(db)
    try:
        developer = await service.update(developer_id, update_data)
    except DeveloperNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer not found",
        ) from e

    return DeveloperResponse.model_validate(developer)


@router.get("/{developer_id}", response_model=DeveloperResponse)
async def get_developer(
    developer_id: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),  # Require auth
) -> DeveloperResponse:
    """Get a developer's profile by ID."""
    service = DeveloperService(db)
    try:
        developer = await service.get_by_id(developer_id)
    except DeveloperNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer not found",
        ) from e

    return DeveloperResponse.model_validate(developer)


@router.get("/", response_model=list[DeveloperResponse])
async def list_developers(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),  # Require auth
) -> list[DeveloperResponse]:
    """List all developers with pagination."""
    service = DeveloperService(db)
    developers = await service.list_all(skip=skip, limit=limit)
    return [DeveloperResponse.model_validate(d) for d in developers]
