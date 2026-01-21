"""Service for querying and analyzing the knowledge graph."""

import logging
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.documentation import Document
from aexy.models.knowledge_graph import (
    KnowledgeDocumentRelationship,
    KnowledgeEntity,
    KnowledgeEntityMention,
    KnowledgeEntityType,
    KnowledgeExtractionJob,
    KnowledgeRelationship,
    KnowledgeRelationType,
)

logger = logging.getLogger(__name__)


class GraphFilters:
    """Filters for graph queries."""

    def __init__(
        self,
        entity_types: list[str] | None = None,
        relationship_types: list[str] | None = None,
        space_ids: list[str] | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        min_confidence: float = 0.5,
        include_documents: bool = True,
        include_entities: bool = True,
        max_nodes: int = 200,
    ):
        self.entity_types = entity_types
        self.relationship_types = relationship_types
        self.space_ids = space_ids
        self.date_from = date_from
        self.date_to = date_to
        self.min_confidence = min_confidence
        self.include_documents = include_documents
        self.include_entities = include_entities
        self.max_nodes = max_nodes


class GraphNode:
    """Represents a node in the knowledge graph."""

    def __init__(
        self,
        id: str,
        label: str,
        node_type: str,
        metadata: dict[str, Any] | None = None,
    ):
        self.id = id
        self.label = label
        self.node_type = node_type
        self.metadata = metadata or {}

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "node_type": self.node_type,
            "metadata": self.metadata,
        }


class GraphEdge:
    """Represents an edge in the knowledge graph."""

    def __init__(
        self,
        source: str,
        target: str,
        relationship_type: str,
        strength: float = 0.5,
    ):
        self.source = source
        self.target = target
        self.relationship_type = relationship_type
        self.strength = strength

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "target": self.target,
            "relationship_type": self.relationship_type,
            "strength": self.strength,
        }


class GraphStatistics:
    """Statistics about the knowledge graph."""

    def __init__(
        self,
        total_entities: int = 0,
        total_documents: int = 0,
        total_relationships: int = 0,
        entity_type_counts: dict[str, int] | None = None,
        relationship_type_counts: dict[str, int] | None = None,
        avg_connections_per_node: float = 0.0,
        most_connected_entities: list[dict[str, Any]] | None = None,
    ):
        self.total_entities = total_entities
        self.total_documents = total_documents
        self.total_relationships = total_relationships
        self.entity_type_counts = entity_type_counts or {}
        self.relationship_type_counts = relationship_type_counts or {}
        self.avg_connections_per_node = avg_connections_per_node
        self.most_connected_entities = most_connected_entities or []

    def to_dict(self) -> dict[str, Any]:
        return {
            "total_entities": self.total_entities,
            "total_documents": self.total_documents,
            "total_relationships": self.total_relationships,
            "entity_type_counts": self.entity_type_counts,
            "relationship_type_counts": self.relationship_type_counts,
            "avg_connections_per_node": self.avg_connections_per_node,
            "most_connected_entities": self.most_connected_entities,
        }


class GraphData:
    """Complete graph data response."""

    def __init__(
        self,
        nodes: list[GraphNode] | None = None,
        edges: list[GraphEdge] | None = None,
        statistics: GraphStatistics | None = None,
        temporal: dict[str, Any] | None = None,
    ):
        self.nodes = nodes or []
        self.edges = edges or []
        self.statistics = statistics or GraphStatistics()
        self.temporal = temporal

    def to_dict(self) -> dict[str, Any]:
        return {
            "nodes": [n.to_dict() for n in self.nodes],
            "edges": [e.to_dict() for e in self.edges],
            "statistics": self.statistics.to_dict(),
            "temporal": self.temporal,
        }


class KnowledgeGraphService:
    """Service for querying the knowledge graph."""

    def __init__(self, db: AsyncSession):
        """Initialize the knowledge graph service.

        Args:
            db: Async database session.
        """
        self.db = db

    async def get_graph_data(
        self,
        workspace_id: str,
        filters: GraphFilters | None = None,
    ) -> GraphData:
        """Get the full graph data for a workspace.

        Args:
            workspace_id: Workspace ID to query.
            filters: Optional filters to apply.

        Returns:
            Graph data with nodes, edges, and statistics.
        """
        if filters is None:
            filters = GraphFilters()

        nodes: list[GraphNode] = []
        edges: list[GraphEdge] = []
        node_ids: set[str] = set()

        # Get entities (entity nodes)
        if filters.include_entities:
            entity_nodes, entity_ids = await self._get_entity_nodes(workspace_id, filters)
            nodes.extend(entity_nodes)
            node_ids.update(entity_ids)

        # Get documents (document nodes)
        if filters.include_documents:
            doc_nodes, doc_ids = await self._get_document_nodes(workspace_id, filters)
            nodes.extend(doc_nodes)
            node_ids.update(doc_ids)

        # Limit nodes if needed
        if len(nodes) > filters.max_nodes:
            # Sort by importance (occurrence_count for entities, updated_at for documents)
            nodes = sorted(
                nodes,
                key=lambda n: n.metadata.get("occurrence_count", 0) + n.metadata.get("activity_score", 0),
                reverse=True
            )[:filters.max_nodes]
            node_ids = {n.id for n in nodes}

        # Get entity-to-entity relationships
        if filters.include_entities:
            entity_edges = await self._get_entity_relationships(workspace_id, node_ids, filters)
            edges.extend(entity_edges)

        # Get entity mentions (entity-to-document edges)
        if filters.include_entities and filters.include_documents:
            mention_edges = await self._get_entity_mention_edges(workspace_id, node_ids, filters)
            edges.extend(mention_edges)

        # Get document-to-document relationships
        if filters.include_documents:
            doc_edges = await self._get_document_relationships(workspace_id, node_ids, filters)
            edges.extend(doc_edges)

        # Get statistics
        statistics = await self.get_graph_statistics(workspace_id)

        # Get temporal data if date filters are applied
        temporal = None
        if filters.date_from or filters.date_to:
            temporal = await self.get_temporal_data(
                workspace_id,
                date_from=filters.date_from,
                date_to=filters.date_to,
            )

        return GraphData(
            nodes=nodes,
            edges=edges,
            statistics=statistics,
            temporal=temporal,
        )

    async def get_entity_neighborhood(
        self,
        workspace_id: str,
        entity_id: str,
        depth: int = 1,
    ) -> GraphData:
        """Get the neighborhood of an entity.

        Args:
            workspace_id: Workspace ID.
            entity_id: Entity ID to get neighborhood for.
            depth: How many hops to include.

        Returns:
            Graph data for the neighborhood.
        """
        nodes: list[GraphNode] = []
        edges: list[GraphEdge] = []
        visited_ids: set[str] = set()
        to_visit: deque[tuple[str, int]] = deque([(entity_id, 0)])

        while to_visit:
            current_id, current_depth = to_visit.popleft()

            if current_id in visited_ids:
                continue
            visited_ids.add(current_id)

            # Get entity node
            stmt = select(KnowledgeEntity).where(
                KnowledgeEntity.workspace_id == workspace_id,
                KnowledgeEntity.id == current_id,
            )
            result = await self.db.execute(stmt)
            entity = result.scalar_one_or_none()

            if entity:
                nodes.append(GraphNode(
                    id=str(entity.id),
                    label=entity.name,
                    node_type=entity.entity_type,
                    metadata={
                        "description": entity.description,
                        "confidence_score": entity.confidence_score,
                        "occurrence_count": entity.occurrence_count,
                        "aliases": entity.aliases,
                    },
                ))

                # Get relationships for this entity if not at max depth
                if current_depth < depth:
                    # Get outgoing relationships
                    out_stmt = select(KnowledgeRelationship).where(
                        KnowledgeRelationship.workspace_id == workspace_id,
                        KnowledgeRelationship.source_entity_id == current_id,
                    )
                    out_result = await self.db.execute(out_stmt)
                    for rel in out_result.scalars().all():
                        edges.append(GraphEdge(
                            source=str(rel.source_entity_id),
                            target=str(rel.target_entity_id),
                            relationship_type=rel.relationship_type,
                            strength=rel.strength,
                        ))
                        if rel.target_entity_id not in visited_ids:
                            to_visit.append((str(rel.target_entity_id), current_depth + 1))

                    # Get incoming relationships
                    in_stmt = select(KnowledgeRelationship).where(
                        KnowledgeRelationship.workspace_id == workspace_id,
                        KnowledgeRelationship.target_entity_id == current_id,
                    )
                    in_result = await self.db.execute(in_stmt)
                    for rel in in_result.scalars().all():
                        edges.append(GraphEdge(
                            source=str(rel.source_entity_id),
                            target=str(rel.target_entity_id),
                            relationship_type=rel.relationship_type,
                            strength=rel.strength,
                        ))
                        if rel.source_entity_id not in visited_ids:
                            to_visit.append((str(rel.source_entity_id), current_depth + 1))

        return GraphData(nodes=nodes, edges=edges)

    async def get_document_connections(
        self,
        workspace_id: str,
        document_id: str,
    ) -> dict[str, Any]:
        """Get all connections for a specific document.

        Args:
            workspace_id: Workspace ID.
            document_id: Document ID.

        Returns:
            Document connections data.
        """
        # Get document
        doc_stmt = select(Document).where(Document.id == document_id)
        doc_result = await self.db.execute(doc_stmt)
        document = doc_result.scalar_one_or_none()

        if not document:
            return {"document": None, "entities": [], "related_documents": []}

        # Get entities mentioned in this document
        mention_stmt = select(KnowledgeEntityMention).options(
            selectinload(KnowledgeEntityMention.entity)
        ).where(
            KnowledgeEntityMention.document_id == document_id
        )
        mention_result = await self.db.execute(mention_stmt)
        mentions = mention_result.scalars().all()

        entities = [
            {
                "id": str(m.entity.id),
                "name": m.entity.name,
                "type": m.entity.entity_type,
                "confidence": m.confidence_score,
                "context": m.context_text,
            }
            for m in mentions if m.entity
        ]

        # Get related documents
        rel_stmt = select(KnowledgeDocumentRelationship).where(
            KnowledgeDocumentRelationship.workspace_id == workspace_id,
            or_(
                KnowledgeDocumentRelationship.source_document_id == document_id,
                KnowledgeDocumentRelationship.target_document_id == document_id,
            )
        )
        rel_result = await self.db.execute(rel_stmt)
        relationships = rel_result.scalars().all()

        # Get related document details
        related_doc_ids = set()
        for rel in relationships:
            if str(rel.source_document_id) == document_id:
                related_doc_ids.add(str(rel.target_document_id))
            else:
                related_doc_ids.add(str(rel.source_document_id))

        related_documents = []
        if related_doc_ids:
            related_stmt = select(Document).where(Document.id.in_(related_doc_ids))
            related_result = await self.db.execute(related_stmt)
            for doc in related_result.scalars().all():
                # Find the relationship for strength
                strength = 0.5
                for rel in relationships:
                    if str(rel.source_document_id) == str(doc.id) or str(rel.target_document_id) == str(doc.id):
                        strength = rel.strength
                        break
                related_documents.append({
                    "id": str(doc.id),
                    "title": doc.title,
                    "strength": strength,
                    "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
                })

        return {
            "document": {
                "id": str(document.id),
                "title": document.title,
            },
            "entities": entities,
            "related_documents": related_documents,
        }

    async def find_path(
        self,
        workspace_id: str,
        source_id: str,
        target_id: str,
        max_depth: int = 5,
    ) -> list[dict[str, Any]]:
        """Find the shortest path between two nodes.

        Args:
            workspace_id: Workspace ID.
            source_id: Source node ID.
            target_id: Target node ID.
            max_depth: Maximum path length.

        Returns:
            List of path nodes with relationships.
        """
        # BFS to find shortest path
        visited: set[str] = {source_id}
        queue: deque[list[tuple[str, str | None, str | None]]] = deque()
        queue.append([(source_id, None, None)])  # (node_id, rel_type, from_node)

        while queue:
            path = queue.popleft()
            current_id, _, _ = path[-1]

            if len(path) > max_depth:
                continue

            if current_id == target_id:
                # Found path, build result
                result = []
                for i, (node_id, rel_type, from_node) in enumerate(path):
                    # Get node details
                    entity_stmt = select(KnowledgeEntity).where(
                        KnowledgeEntity.id == node_id
                    )
                    entity_result = await self.db.execute(entity_stmt)
                    entity = entity_result.scalar_one_or_none()

                    if entity:
                        result.append({
                            "id": str(entity.id),
                            "label": entity.name,
                            "type": entity.entity_type,
                            "relationship_from_previous": rel_type,
                        })
                return result

            # Get neighbors
            rel_stmt = select(KnowledgeRelationship).where(
                KnowledgeRelationship.workspace_id == workspace_id,
                or_(
                    KnowledgeRelationship.source_entity_id == current_id,
                    KnowledgeRelationship.target_entity_id == current_id,
                )
            )
            rel_result = await self.db.execute(rel_stmt)
            for rel in rel_result.scalars().all():
                # Determine neighbor
                if str(rel.source_entity_id) == current_id:
                    neighbor_id = str(rel.target_entity_id)
                else:
                    neighbor_id = str(rel.source_entity_id)

                if neighbor_id not in visited:
                    visited.add(neighbor_id)
                    new_path = path + [(neighbor_id, rel.relationship_type, current_id)]
                    queue.append(new_path)

        return []  # No path found

    async def search_entities(
        self,
        workspace_id: str,
        query: str,
        entity_type: str | None = None,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Search for entities by name or description.

        Args:
            workspace_id: Workspace ID.
            query: Search query.
            entity_type: Optional type filter.
            limit: Max results.

        Returns:
            List of matching entities.
        """
        stmt = select(KnowledgeEntity).where(
            KnowledgeEntity.workspace_id == workspace_id,
            or_(
                KnowledgeEntity.name.ilike(f"%{query}%"),
                KnowledgeEntity.normalized_name.ilike(f"%{query}%"),
                KnowledgeEntity.description.ilike(f"%{query}%"),
            )
        )

        if entity_type:
            stmt = stmt.where(KnowledgeEntity.entity_type == entity_type)

        stmt = stmt.order_by(KnowledgeEntity.occurrence_count.desc()).limit(limit)

        result = await self.db.execute(stmt)
        entities = result.scalars().all()

        return [
            {
                "id": str(e.id),
                "name": e.name,
                "type": e.entity_type,
                "description": e.description,
                "confidence_score": e.confidence_score,
                "occurrence_count": e.occurrence_count,
                "aliases": e.aliases,
            }
            for e in entities
        ]

    async def get_graph_statistics(
        self,
        workspace_id: str,
    ) -> GraphStatistics:
        """Get statistics about the knowledge graph.

        Args:
            workspace_id: Workspace ID.

        Returns:
            Graph statistics.
        """
        # Count entities by type
        entity_type_stmt = select(
            KnowledgeEntity.entity_type,
            func.count(KnowledgeEntity.id)
        ).where(
            KnowledgeEntity.workspace_id == workspace_id
        ).group_by(KnowledgeEntity.entity_type)
        entity_type_result = await self.db.execute(entity_type_stmt)
        entity_type_counts = dict(entity_type_result.all())

        total_entities = sum(entity_type_counts.values())

        # Count documents with entities
        doc_count_stmt = select(func.count(func.distinct(KnowledgeEntityMention.document_id))).join(
            KnowledgeEntity
        ).where(
            KnowledgeEntity.workspace_id == workspace_id
        )
        doc_count_result = await self.db.execute(doc_count_stmt)
        total_documents = doc_count_result.scalar() or 0

        # Count relationships by type
        rel_type_stmt = select(
            KnowledgeRelationship.relationship_type,
            func.count(KnowledgeRelationship.id)
        ).where(
            KnowledgeRelationship.workspace_id == workspace_id
        ).group_by(KnowledgeRelationship.relationship_type)
        rel_type_result = await self.db.execute(rel_type_stmt)
        relationship_type_counts = dict(rel_type_result.all())

        # Add document relationship counts
        doc_rel_stmt = select(
            KnowledgeDocumentRelationship.relationship_type,
            func.count(KnowledgeDocumentRelationship.id)
        ).where(
            KnowledgeDocumentRelationship.workspace_id == workspace_id
        ).group_by(KnowledgeDocumentRelationship.relationship_type)
        doc_rel_result = await self.db.execute(doc_rel_stmt)
        for rel_type, count in doc_rel_result.all():
            relationship_type_counts[rel_type] = relationship_type_counts.get(rel_type, 0) + count

        total_relationships = sum(relationship_type_counts.values())

        # Calculate average connections
        avg_connections = 0.0
        if total_entities > 0:
            avg_connections = (total_relationships * 2) / total_entities

        # Get most connected entities
        most_connected_stmt = select(
            KnowledgeEntity.id,
            KnowledgeEntity.name,
            KnowledgeEntity.entity_type,
            func.count(KnowledgeRelationship.id).label("connection_count")
        ).outerjoin(
            KnowledgeRelationship,
            or_(
                KnowledgeEntity.id == KnowledgeRelationship.source_entity_id,
                KnowledgeEntity.id == KnowledgeRelationship.target_entity_id,
            )
        ).where(
            KnowledgeEntity.workspace_id == workspace_id
        ).group_by(
            KnowledgeEntity.id,
            KnowledgeEntity.name,
            KnowledgeEntity.entity_type,
        ).order_by(
            func.count(KnowledgeRelationship.id).desc()
        ).limit(10)

        most_connected_result = await self.db.execute(most_connected_stmt)
        most_connected_entities = [
            {
                "id": str(row[0]),
                "name": row[1],
                "type": row[2],
                "connection_count": row[3],
            }
            for row in most_connected_result.all()
        ]

        return GraphStatistics(
            total_entities=total_entities,
            total_documents=total_documents,
            total_relationships=total_relationships,
            entity_type_counts=entity_type_counts,
            relationship_type_counts=relationship_type_counts,
            avg_connections_per_node=avg_connections,
            most_connected_entities=most_connected_entities,
        )

    async def get_temporal_data(
        self,
        workspace_id: str,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> dict[str, Any]:
        """Get temporal data for the knowledge graph.

        Args:
            workspace_id: Workspace ID.
            date_from: Start date.
            date_to: End date.

        Returns:
            Temporal data including timeline and activity heatmap.
        """
        if not date_from:
            date_from = datetime.now(timezone.utc) - timedelta(days=30)
        if not date_to:
            date_to = datetime.now(timezone.utc)

        # Get entity creation timeline
        entity_timeline_stmt = select(
            func.date_trunc('day', KnowledgeEntity.created_at).label('date'),
            func.count(KnowledgeEntity.id).label('count')
        ).where(
            KnowledgeEntity.workspace_id == workspace_id,
            KnowledgeEntity.created_at >= date_from,
            KnowledgeEntity.created_at <= date_to,
        ).group_by(
            func.date_trunc('day', KnowledgeEntity.created_at)
        ).order_by('date')

        entity_timeline_result = await self.db.execute(entity_timeline_stmt)
        entity_timeline = [
            {"date": row[0].isoformat() if row[0] else None, "count": row[1]}
            for row in entity_timeline_result.all()
        ]

        # Get document activity (based on mentions created)
        doc_activity_stmt = select(
            func.date_trunc('day', KnowledgeEntityMention.extracted_at).label('date'),
            func.count(func.distinct(KnowledgeEntityMention.document_id)).label('count')
        ).join(
            KnowledgeEntity
        ).where(
            KnowledgeEntity.workspace_id == workspace_id,
            KnowledgeEntityMention.extracted_at >= date_from,
            KnowledgeEntityMention.extracted_at <= date_to,
        ).group_by(
            func.date_trunc('day', KnowledgeEntityMention.extracted_at)
        ).order_by('date')

        doc_activity_result = await self.db.execute(doc_activity_stmt)
        doc_activity = [
            {"date": row[0].isoformat() if row[0] else None, "count": row[1]}
            for row in doc_activity_result.all()
        ]

        # Get entity activity scores (for heatmap coloring)
        # Score based on last_seen_at proximity to now
        entity_activity_stmt = select(
            KnowledgeEntity.id,
            KnowledgeEntity.last_seen_at,
            KnowledgeEntity.occurrence_count,
        ).where(
            KnowledgeEntity.workspace_id == workspace_id
        )
        entity_activity_result = await self.db.execute(entity_activity_stmt)
        now = datetime.now(timezone.utc)
        activity_scores = {}
        for row in entity_activity_result.all():
            entity_id = str(row[0])
            last_seen = row[1]
            occurrence = row[2] or 1

            if last_seen:
                days_ago = (now - last_seen).days
                recency_score = max(0, 1 - (days_ago / 30))  # 0-1 based on 30 day window
            else:
                recency_score = 0

            # Combine recency with occurrence count
            activity_scores[entity_id] = min(1.0, (recency_score * 0.5) + (min(occurrence, 10) / 20))

        return {
            "entity_timeline": entity_timeline,
            "document_activity": doc_activity,
            "activity_scores": activity_scores,
            "date_range": {
                "from": date_from.isoformat(),
                "to": date_to.isoformat(),
            },
        }

    async def get_extraction_jobs(
        self,
        workspace_id: str,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Get recent extraction jobs for a workspace.

        Args:
            workspace_id: Workspace ID.
            limit: Max jobs to return.

        Returns:
            List of extraction jobs.
        """
        stmt = select(KnowledgeExtractionJob).where(
            KnowledgeExtractionJob.workspace_id == workspace_id
        ).order_by(
            KnowledgeExtractionJob.created_at.desc()
        ).limit(limit)

        result = await self.db.execute(stmt)
        jobs = result.scalars().all()

        return [
            {
                "id": str(j.id),
                "job_type": j.job_type,
                "status": j.status,
                "document_id": str(j.document_id) if j.document_id else None,
                "entities_found": j.entities_found,
                "relationships_found": j.relationships_found,
                "documents_processed": j.documents_processed,
                "error_message": j.error_message,
                "tokens_used": j.tokens_used,
                "started_at": j.started_at.isoformat() if j.started_at else None,
                "completed_at": j.completed_at.isoformat() if j.completed_at else None,
                "created_at": j.created_at.isoformat() if j.created_at else None,
            }
            for j in jobs
        ]

    async def get_entity_by_id(
        self,
        workspace_id: str,
        entity_id: str,
    ) -> dict[str, Any] | None:
        """Get detailed entity information.

        Args:
            workspace_id: Workspace ID.
            entity_id: Entity ID.

        Returns:
            Entity details with documents.
        """
        stmt = select(KnowledgeEntity).options(
            selectinload(KnowledgeEntity.mentions)
        ).where(
            KnowledgeEntity.workspace_id == workspace_id,
            KnowledgeEntity.id == entity_id,
        )
        result = await self.db.execute(stmt)
        entity = result.scalar_one_or_none()

        if not entity:
            return None

        # Get document details for mentions
        doc_ids = [str(m.document_id) for m in entity.mentions]
        documents = []
        if doc_ids:
            doc_stmt = select(Document).where(Document.id.in_(doc_ids))
            doc_result = await self.db.execute(doc_stmt)
            for doc in doc_result.scalars().all():
                documents.append({
                    "id": str(doc.id),
                    "title": doc.title,
                    "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
                })

        return {
            "id": str(entity.id),
            "name": entity.name,
            "type": entity.entity_type,
            "description": entity.description,
            "aliases": entity.aliases,
            "confidence_score": entity.confidence_score,
            "occurrence_count": entity.occurrence_count,
            "first_seen_at": entity.first_seen_at.isoformat() if entity.first_seen_at else None,
            "last_seen_at": entity.last_seen_at.isoformat() if entity.last_seen_at else None,
            "documents": documents,
        }

    # Private helper methods

    async def _get_entity_nodes(
        self,
        workspace_id: str,
        filters: GraphFilters,
    ) -> tuple[list[GraphNode], set[str]]:
        """Get entity nodes for the graph."""
        stmt = select(KnowledgeEntity).where(
            KnowledgeEntity.workspace_id == workspace_id,
            KnowledgeEntity.confidence_score >= filters.min_confidence,
        )

        if filters.entity_types:
            stmt = stmt.where(KnowledgeEntity.entity_type.in_(filters.entity_types))

        if filters.date_from:
            stmt = stmt.where(KnowledgeEntity.last_seen_at >= filters.date_from)

        if filters.date_to:
            stmt = stmt.where(KnowledgeEntity.first_seen_at <= filters.date_to)

        stmt = stmt.order_by(KnowledgeEntity.occurrence_count.desc())

        result = await self.db.execute(stmt)
        entities = result.scalars().all()

        nodes = []
        ids = set()
        for e in entities:
            node = GraphNode(
                id=str(e.id),
                label=e.name,
                node_type=e.entity_type,
                metadata={
                    "description": e.description,
                    "confidence_score": e.confidence_score,
                    "occurrence_count": e.occurrence_count,
                    "aliases": e.aliases,
                    "first_seen_at": e.first_seen_at.isoformat() if e.first_seen_at else None,
                    "last_seen_at": e.last_seen_at.isoformat() if e.last_seen_at else None,
                },
            )
            nodes.append(node)
            ids.add(str(e.id))

        return nodes, ids

    async def _get_document_nodes(
        self,
        workspace_id: str,
        filters: GraphFilters,
    ) -> tuple[list[GraphNode], set[str]]:
        """Get document nodes that have entity mentions."""
        # Get documents that have at least one entity mention
        subquery = select(func.distinct(KnowledgeEntityMention.document_id)).join(
            KnowledgeEntity
        ).where(
            KnowledgeEntity.workspace_id == workspace_id
        ).subquery()

        stmt = select(Document).where(
            Document.workspace_id == workspace_id,
            Document.id.in_(select(subquery)),
        )

        if filters.space_ids:
            stmt = stmt.where(Document.space_id.in_(filters.space_ids))

        if filters.date_from:
            stmt = stmt.where(Document.updated_at >= filters.date_from)

        if filters.date_to:
            stmt = stmt.where(Document.created_at <= filters.date_to)

        stmt = stmt.order_by(Document.updated_at.desc())

        result = await self.db.execute(stmt)
        documents = result.scalars().all()

        nodes = []
        ids = set()
        now = datetime.now(timezone.utc)
        for d in documents:
            # Calculate activity score based on recency
            if d.updated_at:
                days_since_update = (now - d.updated_at).days
                activity_score = max(0, 1 - (days_since_update / 30))
            else:
                activity_score = 0

            node = GraphNode(
                id=str(d.id),
                label=d.title or "Untitled",
                node_type="document",
                metadata={
                    "icon": d.icon,
                    "space_id": str(d.space_id) if d.space_id else None,
                    "created_at": d.created_at.isoformat() if d.created_at else None,
                    "updated_at": d.updated_at.isoformat() if d.updated_at else None,
                    "activity_score": activity_score,
                },
            )
            nodes.append(node)
            ids.add(str(d.id))

        return nodes, ids

    async def _get_entity_relationships(
        self,
        workspace_id: str,
        node_ids: set[str],
        filters: GraphFilters,
    ) -> list[GraphEdge]:
        """Get entity-to-entity relationships."""
        if not node_ids:
            return []

        stmt = select(KnowledgeRelationship).where(
            KnowledgeRelationship.workspace_id == workspace_id,
            KnowledgeRelationship.source_entity_id.in_(node_ids),
            KnowledgeRelationship.target_entity_id.in_(node_ids),
        )

        if filters.relationship_types:
            stmt = stmt.where(
                KnowledgeRelationship.relationship_type.in_(filters.relationship_types)
            )

        result = await self.db.execute(stmt)
        relationships = result.scalars().all()

        return [
            GraphEdge(
                source=str(r.source_entity_id),
                target=str(r.target_entity_id),
                relationship_type=r.relationship_type,
                strength=r.strength,
            )
            for r in relationships
        ]

    async def _get_entity_mention_edges(
        self,
        workspace_id: str,
        node_ids: set[str],
        filters: GraphFilters,
    ) -> list[GraphEdge]:
        """Get edges from entities to documents (mentions)."""
        if not node_ids:
            return []

        stmt = select(KnowledgeEntityMention).join(
            KnowledgeEntity
        ).where(
            KnowledgeEntity.workspace_id == workspace_id,
            KnowledgeEntityMention.entity_id.in_(node_ids),
            KnowledgeEntityMention.document_id.in_(node_ids),
            KnowledgeEntityMention.confidence_score >= filters.min_confidence,
        )

        result = await self.db.execute(stmt)
        mentions = result.scalars().all()

        return [
            GraphEdge(
                source=str(m.entity_id),
                target=str(m.document_id),
                relationship_type="mentioned_in",
                strength=m.confidence_score,
            )
            for m in mentions
        ]

    async def _get_document_relationships(
        self,
        workspace_id: str,
        node_ids: set[str],
        filters: GraphFilters,
    ) -> list[GraphEdge]:
        """Get document-to-document relationships."""
        if not node_ids:
            return []

        stmt = select(KnowledgeDocumentRelationship).where(
            KnowledgeDocumentRelationship.workspace_id == workspace_id,
            KnowledgeDocumentRelationship.source_document_id.in_(node_ids),
            KnowledgeDocumentRelationship.target_document_id.in_(node_ids),
        )

        if filters.relationship_types:
            stmt = stmt.where(
                KnowledgeDocumentRelationship.relationship_type.in_(filters.relationship_types)
            )

        result = await self.db.execute(stmt)
        relationships = result.scalars().all()

        return [
            GraphEdge(
                source=str(r.source_document_id),
                target=str(r.target_document_id),
                relationship_type=r.relationship_type,
                strength=r.strength,
            )
            for r in relationships
        ]
