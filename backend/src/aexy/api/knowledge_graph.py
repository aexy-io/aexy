"""API endpoints for knowledge graph feature (Enterprise only)."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.dependencies import get_current_developer_id, get_db
from aexy.models.plan import PlanTier
from aexy.schemas.knowledge_graph import (
    DocumentConnectionsResponse,
    EntitySearchResponse,
    EntitySearchResult,
    EntityWithDocumentsResponse,
    ExtractionJobListResponse,
    ExtractionJobResponse,
    GraphDataResponse,
    GraphEdgeResponse,
    GraphFiltersRequest,
    GraphNodeResponse,
    GraphStatisticsResponse,
    PathFindRequest,
    PathNodeResponse,
    PathResponse,
    TemporalDataResponse,
    TriggerExtractionRequest,
    TriggerExtractionResponse,
)
from aexy.services.knowledge_extraction_service import KnowledgeExtractionService
from aexy.services.knowledge_graph_service import (
    GraphFilters,
    KnowledgeGraphService,
)
from aexy.services.workspace_service import WorkspaceService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspaces/{workspace_id}/knowledge-graph")


# =============================================================================
# Enterprise Gate Dependency
# =============================================================================


async def require_enterprise_workspace(
    workspace_id: str,
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> str:
    """Verify workspace has Enterprise subscription and user has access.

    Returns workspace_id if authorized.
    """
    workspace_service = WorkspaceService(db)

    # Check if user has access to workspace (any role)
    if not await workspace_service.check_permission(
        workspace_id, developer_id, "view"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this workspace",
        )

    # Get workspace with plan
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from aexy.models.workspace import Workspace

    stmt = select(Workspace).options(selectinload(Workspace.plan)).where(Workspace.id == workspace_id)
    result = await db.execute(stmt)
    workspace = result.scalar_one_or_none()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    # Check for Enterprise tier
    if not workspace.plan or workspace.plan.tier != PlanTier.ENTERPRISE.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Knowledge Graph is an Enterprise feature. Please upgrade to access this functionality.",
        )

    return workspace_id


# =============================================================================
# Graph Data Endpoints
# =============================================================================


@router.get(
    "/graph",
    response_model=GraphDataResponse,
    summary="Get knowledge graph data",
    description="Get the full knowledge graph data for a workspace with optional filters.",
)
async def get_graph(
    request: Request,
    workspace_id: Annotated[str, Depends(require_enterprise_workspace)],
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
    entity_types: list[str] | None = Query(default=None, description="Filter by entity types"),
    relationship_types: list[str] | None = Query(default=None, description="Filter by relationship types"),
    space_ids: list[str] | None = Query(default=None, description="Filter by document space IDs"),
    date_from: str | None = Query(default=None, description="Filter from date (ISO format)"),
    date_to: str | None = Query(default=None, description="Filter to date (ISO format)"),
    min_confidence: float = Query(default=0.5, ge=0.0, le=1.0, description="Minimum confidence"),
    include_documents: bool = Query(default=True, description="Include document nodes"),
    include_entities: bool = Query(default=True, description="Include entity nodes"),
    max_nodes: int = Query(default=200, ge=1, le=1000, description="Max nodes to return"),
):
    """Get knowledge graph data with filters."""
    from datetime import datetime

    # Parse dates
    parsed_date_from = None
    parsed_date_to = None
    if date_from:
        try:
            parsed_date_from = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date_from format. Use ISO format.",
            )
    if date_to:
        try:
            parsed_date_to = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date_to format. Use ISO format.",
            )

    filters = GraphFilters(
        entity_types=entity_types,
        relationship_types=relationship_types,
        space_ids=space_ids,
        date_from=parsed_date_from,
        date_to=parsed_date_to,
        min_confidence=min_confidence,
        include_documents=include_documents,
        include_entities=include_entities,
        max_nodes=max_nodes,
    )

    service = KnowledgeGraphService(db)
    graph_data = await service.get_graph_data(workspace_id, filters)

    return GraphDataResponse(
        nodes=[
            GraphNodeResponse(
                id=n.id,
                label=n.label,
                node_type=n.node_type,
                metadata=n.metadata,
            )
            for n in graph_data.nodes
        ],
        edges=[
            GraphEdgeResponse(
                source=e.source,
                target=e.target,
                relationship_type=e.relationship_type,
                strength=e.strength,
            )
            for e in graph_data.edges
        ],
        statistics=GraphStatisticsResponse(**graph_data.statistics.to_dict()),
        temporal=TemporalDataResponse(**graph_data.temporal) if graph_data.temporal else None,
    )


@router.get(
    "/graph/document/{document_id}",
    response_model=DocumentConnectionsResponse,
    summary="Get document connections",
    description="Get all connections for a specific document (entities and related documents).",
)
async def get_document_connections(
    workspace_id: Annotated[str, Depends(require_enterprise_workspace)],
    document_id: str,
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get connections for a specific document."""
    service = KnowledgeGraphService(db)
    connections = await service.get_document_connections(workspace_id, document_id)

    return DocumentConnectionsResponse(**connections)


@router.get(
    "/graph/entity/{entity_id}",
    response_model=GraphDataResponse,
    summary="Get entity neighborhood",
    description="Get the neighborhood graph around a specific entity.",
)
async def get_entity_neighborhood(
    workspace_id: Annotated[str, Depends(require_enterprise_workspace)],
    entity_id: str,
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
    depth: int = Query(default=1, ge=1, le=3, description="Neighborhood depth"),
):
    """Get the neighborhood of an entity."""
    service = KnowledgeGraphService(db)
    graph_data = await service.get_entity_neighborhood(workspace_id, entity_id, depth)

    return GraphDataResponse(
        nodes=[
            GraphNodeResponse(
                id=n.id,
                label=n.label,
                node_type=n.node_type,
                metadata=n.metadata,
            )
            for n in graph_data.nodes
        ],
        edges=[
            GraphEdgeResponse(
                source=e.source,
                target=e.target,
                relationship_type=e.relationship_type,
                strength=e.strength,
            )
            for e in graph_data.edges
        ],
        statistics=GraphStatisticsResponse(),
        temporal=None,
    )


# =============================================================================
# Entity Endpoints
# =============================================================================


@router.get(
    "/entities",
    response_model=EntitySearchResponse,
    summary="Search entities",
    description="Search for entities by name or description.",
)
async def search_entities(
    workspace_id: Annotated[str, Depends(require_enterprise_workspace)],
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
    q: str = Query(default="", description="Search query"),
    entity_type: str | None = Query(default=None, description="Filter by entity type"),
    limit: int = Query(default=20, ge=1, le=100, description="Max results"),
):
    """Search for entities."""
    service = KnowledgeGraphService(db)
    results = await service.search_entities(
        workspace_id,
        query=q if q else "",
        entity_type=entity_type,
        limit=limit,
    )

    return EntitySearchResponse(
        results=[EntitySearchResult(**r) for r in results],
        total=len(results),
    )


@router.get(
    "/entities/{entity_id}",
    response_model=EntityWithDocumentsResponse,
    summary="Get entity details",
    description="Get detailed information about an entity including documents.",
)
async def get_entity(
    workspace_id: Annotated[str, Depends(require_enterprise_workspace)],
    entity_id: str,
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get entity details with documents."""
    service = KnowledgeGraphService(db)
    entity = await service.get_entity_by_id(workspace_id, entity_id)

    if not entity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Entity not found",
        )

    return EntityWithDocumentsResponse(**entity)


# =============================================================================
# Path Finding
# =============================================================================


@router.post(
    "/path",
    response_model=PathResponse,
    summary="Find path between nodes",
    description="Find the shortest path between two nodes in the graph.",
)
async def find_path(
    workspace_id: Annotated[str, Depends(require_enterprise_workspace)],
    request: PathFindRequest,
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Find path between two nodes."""
    service = KnowledgeGraphService(db)
    path = await service.find_path(
        workspace_id,
        request.source_id,
        request.target_id,
        max_depth=request.max_depth,
    )

    return PathResponse(
        path=[
            PathNodeResponse(
                id=n["id"],
                label=n["label"],
                type=n["type"],
                relationship_from_previous=n.get("relationship_from_previous"),
            )
            for n in path
        ],
        found=len(path) > 0,
    )


# =============================================================================
# Statistics & Temporal
# =============================================================================


@router.get(
    "/statistics",
    response_model=GraphStatisticsResponse,
    summary="Get graph statistics",
    description="Get statistics about the knowledge graph.",
)
async def get_statistics(
    workspace_id: Annotated[str, Depends(require_enterprise_workspace)],
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get knowledge graph statistics."""
    service = KnowledgeGraphService(db)
    stats = await service.get_graph_statistics(workspace_id)

    return GraphStatisticsResponse(**stats.to_dict())


@router.get(
    "/temporal",
    response_model=TemporalDataResponse,
    summary="Get temporal data",
    description="Get temporal data for timeline and activity heatmap visualization.",
)
async def get_temporal_data(
    workspace_id: Annotated[str, Depends(require_enterprise_workspace)],
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
    date_from: str | None = Query(default=None, description="Start date (ISO format)"),
    date_to: str | None = Query(default=None, description="End date (ISO format)"),
):
    """Get temporal data for visualization."""
    from datetime import datetime

    parsed_date_from = None
    parsed_date_to = None

    if date_from:
        try:
            parsed_date_from = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date_from format",
            )
    if date_to:
        try:
            parsed_date_to = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date_to format",
            )

    service = KnowledgeGraphService(db)
    temporal = await service.get_temporal_data(
        workspace_id,
        date_from=parsed_date_from,
        date_to=parsed_date_to,
    )

    return TemporalDataResponse(**temporal)


# =============================================================================
# Extraction Endpoints
# =============================================================================


@router.post(
    "/extract",
    response_model=TriggerExtractionResponse,
    summary="Trigger extraction",
    description="Trigger knowledge extraction for the workspace or a specific document.",
)
async def trigger_extraction(
    workspace_id: Annotated[str, Depends(require_enterprise_workspace)],
    request: TriggerExtractionRequest,
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Trigger knowledge extraction (queues a Celery task)."""
    from aexy.processing.knowledge_graph_tasks import (
        extract_knowledge_from_document_task,
        rebuild_workspace_graph_task,
    )

    if request.document_id:
        # Single document extraction
        task = extract_knowledge_from_document_task.delay(
            document_id=request.document_id,
            developer_id=developer_id,
            workspace_id=workspace_id,
        )
        return TriggerExtractionResponse(
            job_id=task.id,
            status="pending",
            message=f"Incremental extraction queued for document {request.document_id}",
        )
    else:
        # Full workspace extraction
        task = rebuild_workspace_graph_task.delay(
            workspace_id=workspace_id,
            developer_id=developer_id,
        )
        return TriggerExtractionResponse(
            job_id=task.id,
            status="pending",
            message="Full workspace extraction queued",
        )


@router.post(
    "/extract/document/{document_id}",
    response_model=TriggerExtractionResponse,
    summary="Extract single document",
    description="Trigger extraction for a single document.",
)
async def extract_document(
    workspace_id: Annotated[str, Depends(require_enterprise_workspace)],
    document_id: str,
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Trigger extraction for a specific document."""
    from aexy.processing.knowledge_graph_tasks import extract_knowledge_from_document_task

    task = extract_knowledge_from_document_task.delay(
        document_id=document_id,
        developer_id=developer_id,
        workspace_id=workspace_id,
    )

    return TriggerExtractionResponse(
        job_id=task.id,
        status="pending",
        message=f"Extraction queued for document {document_id}",
    )


@router.get(
    "/jobs",
    response_model=ExtractionJobListResponse,
    summary="List extraction jobs",
    description="List recent knowledge extraction jobs.",
)
async def list_extraction_jobs(
    workspace_id: Annotated[str, Depends(require_enterprise_workspace)],
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=20, ge=1, le=100, description="Max jobs to return"),
):
    """List extraction jobs."""
    service = KnowledgeGraphService(db)
    jobs = await service.get_extraction_jobs(workspace_id, limit)

    return ExtractionJobListResponse(
        jobs=[ExtractionJobResponse(**j) for j in jobs]
    )


@router.get(
    "/jobs/{job_id}",
    response_model=ExtractionJobResponse,
    summary="Get job status",
    description="Get the status of a specific extraction job.",
)
async def get_job_status(
    workspace_id: Annotated[str, Depends(require_enterprise_workspace)],
    job_id: str,
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get extraction job status."""
    from sqlalchemy import select
    from aexy.models.knowledge_graph import KnowledgeExtractionJob

    stmt = select(KnowledgeExtractionJob).where(
        KnowledgeExtractionJob.workspace_id == workspace_id,
        KnowledgeExtractionJob.id == job_id,
    )
    result = await db.execute(stmt)
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    return ExtractionJobResponse(
        id=str(job.id),
        job_type=job.job_type,
        status=job.status,
        document_id=str(job.document_id) if job.document_id else None,
        entities_found=job.entities_found,
        relationships_found=job.relationships_found,
        documents_processed=job.documents_processed,
        error_message=job.error_message,
        tokens_used=job.tokens_used,
        started_at=job.started_at,
        completed_at=job.completed_at,
        created_at=job.created_at,
    )
