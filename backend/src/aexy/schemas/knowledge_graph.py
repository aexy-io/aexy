"""Pydantic schemas for knowledge graph API."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class KnowledgeEntityTypeEnum(str, Enum):
    """Types of entities that can be extracted from documents."""

    PERSON = "person"
    CONCEPT = "concept"
    TECHNOLOGY = "technology"
    PROJECT = "project"
    ORGANIZATION = "organization"
    CODE = "code"
    EXTERNAL = "external"


class KnowledgeRelationTypeEnum(str, Enum):
    """Types of relationships between entities."""

    MENTIONS = "mentions"
    RELATED_TO = "related_to"
    DEPENDS_ON = "depends_on"
    AUTHORED_BY = "authored_by"
    IMPLEMENTS = "implements"
    REFERENCES = "references"
    LINKS_TO = "links_to"
    SHARES_ENTITY = "shares_entity"
    MENTIONED_IN = "mentioned_in"


class KnowledgeExtractionStatusEnum(str, Enum):
    """Status of a knowledge extraction job."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


# =============================================================================
# Request Schemas
# =============================================================================


class GraphFiltersRequest(BaseModel):
    """Filters for graph queries."""

    entity_types: list[KnowledgeEntityTypeEnum] | None = Field(
        default=None,
        description="Filter by entity types",
    )
    relationship_types: list[KnowledgeRelationTypeEnum] | None = Field(
        default=None,
        description="Filter by relationship types",
    )
    space_ids: list[str] | None = Field(
        default=None,
        description="Filter by document space IDs",
    )
    date_from: datetime | None = Field(
        default=None,
        description="Filter entities/documents from this date",
    )
    date_to: datetime | None = Field(
        default=None,
        description="Filter entities/documents up to this date",
    )
    min_confidence: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Minimum confidence score for entities",
    )
    include_documents: bool = Field(
        default=True,
        description="Include document nodes in the graph",
    )
    include_entities: bool = Field(
        default=True,
        description="Include entity nodes in the graph",
    )
    max_nodes: int = Field(
        default=200,
        ge=1,
        le=1000,
        description="Maximum number of nodes to return",
    )


class TriggerExtractionRequest(BaseModel):
    """Request to trigger knowledge extraction."""

    document_id: str | None = Field(
        default=None,
        description="Specific document ID for incremental extraction. If not provided, runs full workspace extraction.",
    )


class PathFindRequest(BaseModel):
    """Request to find a path between two nodes."""

    source_id: str = Field(description="Source node ID")
    target_id: str = Field(description="Target node ID")
    max_depth: int = Field(
        default=5,
        ge=1,
        le=10,
        description="Maximum path length",
    )


class SearchEntitiesRequest(BaseModel):
    """Request to search entities."""

    query: str = Field(min_length=1, description="Search query")
    entity_type: KnowledgeEntityTypeEnum | None = Field(
        default=None,
        description="Filter by entity type",
    )
    limit: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Maximum results to return",
    )


# =============================================================================
# Response Schemas
# =============================================================================


class GraphNodeResponse(BaseModel):
    """A node in the knowledge graph."""

    id: str = Field(description="Node ID (entity ID or document ID)")
    label: str = Field(description="Display label for the node")
    node_type: str = Field(
        description="Node type: 'document' or entity type (person, concept, etc.)"
    )
    metadata: dict = Field(
        default_factory=dict,
        description="Additional metadata (created_at, updated_at, activity_score, etc.)",
    )


class GraphEdgeResponse(BaseModel):
    """An edge in the knowledge graph."""

    source: str = Field(description="Source node ID")
    target: str = Field(description="Target node ID")
    relationship_type: str = Field(description="Type of relationship")
    strength: float = Field(
        ge=0.0,
        le=1.0,
        description="Relationship strength (0-1)",
    )


class GraphStatisticsResponse(BaseModel):
    """Statistics about the knowledge graph."""

    total_entities: int = Field(default=0, description="Total number of entities")
    total_documents: int = Field(
        default=0, description="Total documents with entity mentions"
    )
    total_relationships: int = Field(
        default=0, description="Total number of relationships"
    )
    entity_type_counts: dict[str, int] = Field(
        default_factory=dict,
        description="Count of entities by type",
    )
    relationship_type_counts: dict[str, int] = Field(
        default_factory=dict,
        description="Count of relationships by type",
    )
    avg_connections_per_node: float = Field(
        default=0.0,
        description="Average number of connections per node",
    )
    most_connected_entities: list[dict] = Field(
        default_factory=list,
        description="Top 10 most connected entities",
    )


class TemporalDataResponse(BaseModel):
    """Temporal data for timeline visualization."""

    entity_timeline: list[dict] = Field(
        default_factory=list,
        description="Entity creation counts by date",
    )
    document_activity: list[dict] = Field(
        default_factory=list,
        description="Document activity counts by date",
    )
    activity_scores: dict[str, float] = Field(
        default_factory=dict,
        description="Activity score per entity ID for heatmap coloring",
    )
    date_range: dict = Field(
        default_factory=dict,
        description="Date range for the temporal data",
    )


class GraphDataResponse(BaseModel):
    """Complete graph data response."""

    nodes: list[GraphNodeResponse] = Field(
        default_factory=list,
        description="Graph nodes (entities and documents)",
    )
    edges: list[GraphEdgeResponse] = Field(
        default_factory=list,
        description="Graph edges (relationships)",
    )
    statistics: GraphStatisticsResponse = Field(
        default_factory=GraphStatisticsResponse,
        description="Graph statistics",
    )
    temporal: TemporalDataResponse | None = Field(
        default=None,
        description="Temporal data for timeline (included when date filters are applied)",
    )


class EntityResponse(BaseModel):
    """Entity details response."""

    id: str = Field(description="Entity ID")
    name: str = Field(description="Entity name")
    type: str = Field(description="Entity type")
    description: str | None = Field(default=None, description="Entity description")
    aliases: list[str] = Field(default_factory=list, description="Alternative names")
    confidence_score: float = Field(description="Confidence score (0-1)")
    occurrence_count: int = Field(description="Number of occurrences")
    first_seen_at: datetime | None = Field(
        default=None, description="First time this entity was seen"
    )
    last_seen_at: datetime | None = Field(
        default=None, description="Last time this entity was seen"
    )


class EntityWithDocumentsResponse(EntityResponse):
    """Entity details with document list."""

    documents: list[dict] = Field(
        default_factory=list,
        description="Documents where this entity appears",
    )


class EntitySearchResult(BaseModel):
    """Entity search result."""

    id: str
    name: str
    type: str
    description: str | None
    confidence_score: float
    occurrence_count: int
    aliases: list[str]


class EntitySearchResponse(BaseModel):
    """Response for entity search."""

    results: list[EntitySearchResult] = Field(
        default_factory=list,
        description="Search results",
    )
    total: int = Field(description="Total matching results")


class PathNodeResponse(BaseModel):
    """A node in a path."""

    id: str = Field(description="Node ID")
    label: str = Field(description="Node label")
    type: str = Field(description="Node type")
    relationship_from_previous: str | None = Field(
        default=None,
        description="Relationship type from the previous node",
    )


class PathResponse(BaseModel):
    """Path between two nodes."""

    path: list[PathNodeResponse] = Field(
        default_factory=list,
        description="Nodes in the path from source to target",
    )
    found: bool = Field(description="Whether a path was found")


class DocumentConnectionsResponse(BaseModel):
    """Connections for a specific document."""

    document: dict | None = Field(description="Document info")
    entities: list[dict] = Field(
        default_factory=list,
        description="Entities mentioned in this document",
    )
    related_documents: list[dict] = Field(
        default_factory=list,
        description="Documents related through shared entities",
    )


class ExtractionJobResponse(BaseModel):
    """Knowledge extraction job response."""

    id: str = Field(description="Job ID")
    job_type: str = Field(description="Job type (single_document, full_workspace, incremental)")
    status: str = Field(description="Job status")
    document_id: str | None = Field(default=None, description="Document ID (for single document jobs)")
    entities_found: int = Field(default=0, description="Number of entities found")
    relationships_found: int = Field(default=0, description="Number of relationships found")
    documents_processed: int = Field(default=0, description="Number of documents processed")
    error_message: str | None = Field(default=None, description="Error message if failed")
    tokens_used: int = Field(default=0, description="LLM tokens consumed")
    started_at: datetime | None = Field(default=None, description="Job start time")
    completed_at: datetime | None = Field(default=None, description="Job completion time")
    created_at: datetime = Field(description="Job creation time")


class ExtractionJobListResponse(BaseModel):
    """List of extraction jobs."""

    jobs: list[ExtractionJobResponse] = Field(
        default_factory=list,
        description="Extraction jobs",
    )


class TriggerExtractionResponse(BaseModel):
    """Response after triggering extraction."""

    job_id: str = Field(description="Created job ID")
    status: str = Field(description="Initial job status")
    message: str = Field(description="Status message")


class RelationshipResponse(BaseModel):
    """Relationship details."""

    id: str = Field(description="Relationship ID")
    source_entity: EntityResponse = Field(description="Source entity")
    target_entity: EntityResponse = Field(description="Target entity")
    relationship_type: str = Field(description="Relationship type")
    strength: float = Field(description="Relationship strength")
    bidirectional: bool = Field(description="Whether bidirectional")


class RelationshipListResponse(BaseModel):
    """List of relationships."""

    relationships: list[RelationshipResponse] = Field(
        default_factory=list,
        description="Entity relationships",
    )
    total: int = Field(description="Total relationships")
