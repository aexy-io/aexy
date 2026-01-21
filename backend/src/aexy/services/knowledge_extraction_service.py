"""Service for extracting knowledge entities from documents using LLM."""

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.llm.base import AnalysisRequest, AnalysisType
from aexy.llm.gateway import get_llm_gateway
from aexy.models.documentation import Document
from aexy.models.knowledge_graph import (
    KnowledgeEntity,
    KnowledgeEntityMention,
    KnowledgeEntityType,
    KnowledgeExtractionJob,
    KnowledgeExtractionJobType,
    KnowledgeExtractionStatus,
    KnowledgeRelationship,
    KnowledgeRelationType,
    KnowledgeDocumentRelationship,
)

logger = logging.getLogger(__name__)


# LLM prompt for entity extraction
ENTITY_EXTRACTION_SYSTEM_PROMPT = """You are an expert at analyzing technical documentation and extracting structured knowledge entities.

Your task is to identify and extract entities from the provided document content. Extract the following types of entities:

1. **People**: Team members, authors, stakeholders, contributors mentioned in the document
2. **Concepts**: Technical or business concepts, methodologies, principles
3. **Technologies**: Programming languages, frameworks, libraries, tools, platforms
4. **Projects**: Product names, project names, codenames, initiatives
5. **Organizations**: Teams, companies, departments, external organizations
6. **Code**: Function names, class names, API endpoints, modules, packages
7. **External**: External links, references to other systems or resources

For each entity, provide:
- name: The canonical name of the entity
- type: One of: person, concept, technology, project, organization, code, external
- description: A brief description (1-2 sentences)
- aliases: Alternative names or abbreviations for this entity
- confidence: How confident you are this is a valid entity (0.0-1.0)

Output your response as a valid JSON object with a single "entities" array."""

ENTITY_EXTRACTION_PROMPT = """Analyze the following documentation and extract all relevant entities.

Document Title: {title}

Document Content:
{content}

Extract all entities and return them as JSON in this format:
{{
  "entities": [
    {{
      "name": "Entity Name",
      "type": "technology",
      "description": "Brief description",
      "aliases": ["alias1", "alias2"],
      "confidence": 0.9
    }}
  ]
}}

Important guidelines:
- Focus on entities that would be useful for building a knowledge graph
- Extract specific, named entities rather than generic terms
- Include technical terms, people, and concepts that appear multiple times or seem important
- For code entities, include function names, class names, and API endpoints
- Set confidence lower for entities that are ambiguous or might be false positives
- Do not include common words or generic programming terms unless they're specifically named/defined
"""

RELATIONSHIP_EXTRACTION_SYSTEM_PROMPT = """You are an expert at analyzing relationships between entities in technical documentation.

Given a list of entities extracted from documents, identify meaningful relationships between them.

Relationship types:
- mentions: Entity A mentions or references Entity B
- related_to: Entities are conceptually related
- depends_on: Entity A depends on or requires Entity B
- authored_by: Entity A was created/authored by Entity B
- implements: Entity A implements or realizes Entity B
- references: Entity A references or links to Entity B

For each relationship, provide:
- source: The name of the source entity
- target: The name of the target entity
- relationship_type: One of the types listed above
- strength: How strong the relationship is (0.0-1.0)
- bidirectional: Whether the relationship goes both ways

Output as JSON with a "relationships" array."""

RELATIONSHIP_EXTRACTION_PROMPT = """Given these entities extracted from a document, identify relationships between them.

Document Title: {title}

Entities:
{entities}

Document Context:
{content}

Extract relationships and return them as JSON:
{{
  "relationships": [
    {{
      "source": "Entity A Name",
      "target": "Entity B Name",
      "relationship_type": "related_to",
      "strength": 0.8,
      "bidirectional": false
    }}
  ]
}}

Focus on meaningful, non-obvious relationships. Don't create relationships between every pair of entities - only where there's a clear semantic connection in the document."""


class KnowledgeExtractionService:
    """Service for extracting entities and relationships from documents."""

    def __init__(self, db: AsyncSession):
        """Initialize the knowledge extraction service.

        Args:
            db: Async database session.
        """
        self.db = db
        self.gateway = get_llm_gateway()

    async def extract_entities_from_document(
        self,
        document_id: str,
        developer_id: str | None = None,
    ) -> list[KnowledgeEntity]:
        """Extract entities from a single document.

        Args:
            document_id: ID of the document to extract from.
            developer_id: Developer ID for usage tracking.

        Returns:
            List of extracted KnowledgeEntity objects.
        """
        if not self.gateway:
            logger.error("LLM gateway not configured")
            return []

        # Fetch document
        stmt = select(Document).where(Document.id == document_id)
        result = await self.db.execute(stmt)
        document = result.scalar_one_or_none()

        if not document:
            logger.error(f"Document {document_id} not found")
            return []

        # Extract plain text content
        content_text = self._extract_text_from_tiptap(document.content)
        if not content_text or len(content_text.strip()) < 50:
            logger.info(f"Document {document_id} has insufficient content for extraction")
            return []

        # Prepare prompt
        formatted_prompt = ENTITY_EXTRACTION_PROMPT.format(
            title=document.title or "Untitled",
            content=content_text[:15000],  # Limit content to avoid token limits
        )

        # Create analysis request
        request = AnalysisRequest(
            content=formatted_prompt,
            analysis_type=AnalysisType.CODE,  # Using CODE as generic analysis type
            context={
                "system_prompt": ENTITY_EXTRACTION_SYSTEM_PROMPT,
                "output_format": "json",
            },
        )

        try:
            # Execute LLM request
            llm_result = await self.gateway.analyze(
                request,
                use_cache=True,
                db=self.db,
                developer_id=developer_id,
            )

            # Parse the result
            extracted_data = self._parse_json_response(llm_result.raw_response)
            entities_data = extracted_data.get("entities", [])

            # Create or update entities in database
            entities = []
            for entity_data in entities_data:
                entity = await self._create_or_update_entity(
                    workspace_id=str(document.workspace_id),
                    entity_data=entity_data,
                )
                if entity:
                    entities.append(entity)
                    # Create mention for this document
                    await self._create_entity_mention(
                        entity_id=str(entity.id),
                        document_id=document_id,
                        confidence_score=entity_data.get("confidence", 0.5),
                    )

            await self.db.commit()
            return entities

        except Exception as e:
            logger.error(f"Entity extraction failed for document {document_id}: {e}")
            raise

    async def extract_relationships(
        self,
        workspace_id: str,
        document_ids: list[str] | None = None,
        developer_id: str | None = None,
    ) -> list[KnowledgeRelationship]:
        """Extract relationships between entities in a workspace.

        Args:
            workspace_id: Workspace ID to analyze.
            document_ids: Optional list of specific document IDs to analyze.
            developer_id: Developer ID for usage tracking.

        Returns:
            List of extracted KnowledgeRelationship objects.
        """
        if not self.gateway:
            logger.error("LLM gateway not configured")
            return []

        # Get entities for the workspace
        stmt = select(KnowledgeEntity).where(
            KnowledgeEntity.workspace_id == workspace_id
        )
        result = await self.db.execute(stmt)
        entities = result.scalars().all()

        if len(entities) < 2:
            logger.info(f"Workspace {workspace_id} has insufficient entities for relationship extraction")
            return []

        # Build entity summary for prompt
        entities_summary = "\n".join([
            f"- {e.name} ({e.entity_type}): {e.description or 'No description'}"
            for e in entities[:50]  # Limit to 50 entities
        ])

        # Get document content for context
        doc_query = select(Document).where(Document.workspace_id == workspace_id)
        if document_ids:
            doc_query = doc_query.where(Document.id.in_(document_ids))
        doc_result = await self.db.execute(doc_query.limit(5))
        documents = doc_result.scalars().all()

        content_context = "\n\n".join([
            f"### {d.title}\n{self._extract_text_from_tiptap(d.content)[:2000]}"
            for d in documents
        ])

        # Prepare prompt
        formatted_prompt = RELATIONSHIP_EXTRACTION_PROMPT.format(
            title="Multiple Documents",
            entities=entities_summary,
            content=content_context[:10000],
        )

        request = AnalysisRequest(
            content=formatted_prompt,
            analysis_type=AnalysisType.CODE,
            context={
                "system_prompt": RELATIONSHIP_EXTRACTION_SYSTEM_PROMPT,
                "output_format": "json",
            },
        )

        try:
            llm_result = await self.gateway.analyze(
                request,
                use_cache=True,
                db=self.db,
                developer_id=developer_id,
            )

            extracted_data = self._parse_json_response(llm_result.raw_response)
            relationships_data = extracted_data.get("relationships", [])

            # Create entity name to ID mapping
            entity_map = {e.name.lower(): e for e in entities}
            for e in entities:
                for alias in e.aliases:
                    entity_map[alias.lower()] = e

            # Create relationships
            relationships = []
            for rel_data in relationships_data:
                relationship = await self._create_relationship(
                    workspace_id=workspace_id,
                    rel_data=rel_data,
                    entity_map=entity_map,
                )
                if relationship:
                    relationships.append(relationship)

            await self.db.commit()
            return relationships

        except Exception as e:
            logger.error(f"Relationship extraction failed for workspace {workspace_id}: {e}")
            raise

    async def build_document_relationships(
        self,
        workspace_id: str,
    ) -> list[KnowledgeDocumentRelationship]:
        """Build document-to-document relationships based on shared entities.

        Args:
            workspace_id: Workspace ID to analyze.

        Returns:
            List of document relationships created.
        """
        # Get all documents with their entity mentions
        stmt = select(KnowledgeEntityMention).join(
            KnowledgeEntity
        ).where(
            KnowledgeEntity.workspace_id == workspace_id
        )
        result = await self.db.execute(stmt)
        mentions = result.scalars().all()

        # Build document -> entity mapping
        doc_entities: dict[str, set[str]] = {}
        for mention in mentions:
            doc_id = str(mention.document_id)
            entity_id = str(mention.entity_id)
            if doc_id not in doc_entities:
                doc_entities[doc_id] = set()
            doc_entities[doc_id].add(entity_id)

        # Find document pairs with shared entities
        doc_ids = list(doc_entities.keys())
        relationships = []

        for i, doc_a in enumerate(doc_ids):
            for doc_b in doc_ids[i + 1:]:
                shared = doc_entities[doc_a] & doc_entities[doc_b]
                if shared:
                    # Calculate strength based on number of shared entities
                    max_entities = max(len(doc_entities[doc_a]), len(doc_entities[doc_b]))
                    strength = len(shared) / max_entities if max_entities > 0 else 0

                    # Check if relationship already exists
                    existing_stmt = select(KnowledgeDocumentRelationship).where(
                        KnowledgeDocumentRelationship.workspace_id == workspace_id,
                        KnowledgeDocumentRelationship.source_document_id == doc_a,
                        KnowledgeDocumentRelationship.target_document_id == doc_b,
                        KnowledgeDocumentRelationship.relationship_type == KnowledgeRelationType.SHARES_ENTITY.value,
                    )
                    existing_result = await self.db.execute(existing_stmt)
                    existing = existing_result.scalar_one_or_none()

                    if existing:
                        existing.shared_entities = list(shared)
                        existing.strength = strength
                    else:
                        relationship = KnowledgeDocumentRelationship(
                            workspace_id=workspace_id,
                            source_document_id=doc_a,
                            target_document_id=doc_b,
                            relationship_type=KnowledgeRelationType.SHARES_ENTITY.value,
                            shared_entities=list(shared),
                            strength=strength,
                        )
                        self.db.add(relationship)
                        relationships.append(relationship)

        await self.db.commit()
        return relationships

    async def run_full_extraction(
        self,
        workspace_id: str,
        developer_id: str | None = None,
    ) -> KnowledgeExtractionJob:
        """Run full extraction for all documents in a workspace.

        Args:
            workspace_id: Workspace ID to process.
            developer_id: Developer ID for usage tracking.

        Returns:
            Extraction job with results.
        """
        # Create job record
        job = KnowledgeExtractionJob(
            workspace_id=workspace_id,
            triggered_by_id=developer_id,
            job_type=KnowledgeExtractionJobType.FULL_WORKSPACE.value,
            status=KnowledgeExtractionStatus.PROCESSING.value,
            started_at=datetime.now(timezone.utc),
        )
        self.db.add(job)
        await self.db.commit()

        try:
            # Get all documents
            stmt = select(Document).where(
                Document.workspace_id == workspace_id,
                Document.is_template == False,
            )
            result = await self.db.execute(stmt)
            documents = result.scalars().all()

            total_entities = 0
            total_relationships = 0
            document_ids = []

            # Extract entities from each document
            for doc in documents:
                try:
                    entities = await self.extract_entities_from_document(
                        document_id=str(doc.id),
                        developer_id=developer_id,
                    )
                    total_entities += len(entities)
                    document_ids.append(str(doc.id))
                    job.documents_processed += 1
                except Exception as e:
                    logger.error(f"Failed to extract from document {doc.id}: {e}")

            # Extract relationships between entities
            if document_ids:
                relationships = await self.extract_relationships(
                    workspace_id=workspace_id,
                    document_ids=document_ids,
                    developer_id=developer_id,
                )
                total_relationships += len(relationships)

            # Build document relationships
            doc_relationships = await self.build_document_relationships(workspace_id)
            total_relationships += len(doc_relationships)

            # Update job
            job.status = KnowledgeExtractionStatus.COMPLETED.value
            job.entities_found = total_entities
            job.relationships_found = total_relationships
            job.completed_at = datetime.now(timezone.utc)

        except Exception as e:
            job.status = KnowledgeExtractionStatus.FAILED.value
            job.error_message = str(e)
            job.completed_at = datetime.now(timezone.utc)
            logger.error(f"Full extraction failed for workspace {workspace_id}: {e}")

        await self.db.commit()
        return job

    async def run_incremental_extraction(
        self,
        workspace_id: str,
        document_id: str,
        developer_id: str | None = None,
    ) -> KnowledgeExtractionJob:
        """Run incremental extraction for a single document.

        Args:
            workspace_id: Workspace ID.
            document_id: Document ID to process.
            developer_id: Developer ID for usage tracking.

        Returns:
            Extraction job with results.
        """
        # Create job record
        job = KnowledgeExtractionJob(
            workspace_id=workspace_id,
            document_id=document_id,
            triggered_by_id=developer_id,
            job_type=KnowledgeExtractionJobType.INCREMENTAL.value,
            status=KnowledgeExtractionStatus.PROCESSING.value,
            started_at=datetime.now(timezone.utc),
        )
        self.db.add(job)
        await self.db.commit()

        try:
            # Clear existing mentions for this document
            await self._clear_document_mentions(document_id)

            # Extract entities
            entities = await self.extract_entities_from_document(
                document_id=document_id,
                developer_id=developer_id,
            )

            # Rebuild document relationships
            doc_relationships = await self.build_document_relationships(workspace_id)

            # Update job
            job.status = KnowledgeExtractionStatus.COMPLETED.value
            job.entities_found = len(entities)
            job.relationships_found = len(doc_relationships)
            job.documents_processed = 1
            job.completed_at = datetime.now(timezone.utc)

        except Exception as e:
            job.status = KnowledgeExtractionStatus.FAILED.value
            job.error_message = str(e)
            job.completed_at = datetime.now(timezone.utc)
            logger.error(f"Incremental extraction failed for document {document_id}: {e}")

        await self.db.commit()
        return job

    async def _create_or_update_entity(
        self,
        workspace_id: str,
        entity_data: dict[str, Any],
    ) -> KnowledgeEntity | None:
        """Create or update an entity in the database.

        Args:
            workspace_id: Workspace ID.
            entity_data: Extracted entity data from LLM.

        Returns:
            Created or updated entity.
        """
        name = entity_data.get("name", "").strip()
        if not name:
            return None

        normalized_name = name.lower().strip()
        entity_type = entity_data.get("type", "concept")

        # Validate entity type
        valid_types = [t.value for t in KnowledgeEntityType]
        if entity_type not in valid_types:
            entity_type = KnowledgeEntityType.CONCEPT.value

        # Check for existing entity
        stmt = select(KnowledgeEntity).where(
            KnowledgeEntity.workspace_id == workspace_id,
            KnowledgeEntity.normalized_name == normalized_name,
            KnowledgeEntity.entity_type == entity_type,
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing entity
            existing.occurrence_count += 1
            existing.last_seen_at = datetime.now(timezone.utc)
            # Merge aliases
            new_aliases = entity_data.get("aliases", [])
            existing_aliases = set(existing.aliases or [])
            for alias in new_aliases:
                if alias and alias.lower() != normalized_name:
                    existing_aliases.add(alias)
            existing.aliases = list(existing_aliases)
            # Update confidence if higher
            new_confidence = entity_data.get("confidence", 0.5)
            if new_confidence > existing.confidence_score:
                existing.confidence_score = new_confidence
            return existing
        else:
            # Create new entity
            entity = KnowledgeEntity(
                workspace_id=workspace_id,
                name=name,
                normalized_name=normalized_name,
                entity_type=entity_type,
                description=entity_data.get("description"),
                aliases=entity_data.get("aliases", []),
                confidence_score=entity_data.get("confidence", 0.5),
            )
            self.db.add(entity)
            return entity

    async def _create_entity_mention(
        self,
        entity_id: str,
        document_id: str,
        confidence_score: float = 0.5,
        context_text: str | None = None,
    ) -> KnowledgeEntityMention:
        """Create a mention linking an entity to a document.

        Args:
            entity_id: Entity ID.
            document_id: Document ID.
            confidence_score: Confidence of the mention.
            context_text: Optional context around the mention.

        Returns:
            Created mention.
        """
        mention = KnowledgeEntityMention(
            entity_id=entity_id,
            document_id=document_id,
            confidence_score=confidence_score,
            context_text=context_text,
        )
        self.db.add(mention)
        return mention

    async def _create_relationship(
        self,
        workspace_id: str,
        rel_data: dict[str, Any],
        entity_map: dict[str, KnowledgeEntity],
    ) -> KnowledgeRelationship | None:
        """Create a relationship between entities.

        Args:
            workspace_id: Workspace ID.
            rel_data: Relationship data from LLM.
            entity_map: Mapping of entity names to entities.

        Returns:
            Created relationship or None if entities not found.
        """
        source_name = rel_data.get("source", "").lower()
        target_name = rel_data.get("target", "").lower()

        source_entity = entity_map.get(source_name)
        target_entity = entity_map.get(target_name)

        if not source_entity or not target_entity:
            return None

        if source_entity.id == target_entity.id:
            return None

        rel_type = rel_data.get("relationship_type", "related_to")
        valid_types = [t.value for t in KnowledgeRelationType]
        if rel_type not in valid_types:
            rel_type = KnowledgeRelationType.RELATED_TO.value

        # Check for existing relationship
        stmt = select(KnowledgeRelationship).where(
            KnowledgeRelationship.workspace_id == workspace_id,
            KnowledgeRelationship.source_entity_id == str(source_entity.id),
            KnowledgeRelationship.target_entity_id == str(target_entity.id),
            KnowledgeRelationship.relationship_type == rel_type,
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            # Update strength if higher
            new_strength = rel_data.get("strength", 0.5)
            if new_strength > existing.strength:
                existing.strength = new_strength
            return existing
        else:
            relationship = KnowledgeRelationship(
                workspace_id=workspace_id,
                source_entity_id=str(source_entity.id),
                target_entity_id=str(target_entity.id),
                relationship_type=rel_type,
                strength=rel_data.get("strength", 0.5),
                bidirectional=rel_data.get("bidirectional", False),
            )
            self.db.add(relationship)
            return relationship

    async def _clear_document_mentions(self, document_id: str) -> None:
        """Clear all entity mentions for a document.

        Args:
            document_id: Document ID to clear.
        """
        from sqlalchemy import delete
        stmt = delete(KnowledgeEntityMention).where(
            KnowledgeEntityMention.document_id == document_id
        )
        await self.db.execute(stmt)

    def _extract_text_from_tiptap(self, content: dict | None) -> str:
        """Extract plain text from TipTap JSON content.

        Args:
            content: TipTap JSON document content.

        Returns:
            Extracted plain text.
        """
        if not content:
            return ""

        def extract_text(node: dict) -> str:
            text_parts = []
            if node.get("type") == "text":
                text_parts.append(node.get("text", ""))
            if "content" in node:
                for child in node["content"]:
                    text_parts.append(extract_text(child))
            return " ".join(text_parts)

        return extract_text(content).strip()

    def _parse_json_response(self, response: str) -> dict[str, Any]:
        """Parse JSON from LLM response, handling markdown code blocks.

        Args:
            response: Raw LLM response.

        Returns:
            Parsed JSON dict.
        """
        # Try to extract JSON from markdown code blocks
        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', response)
        if json_match:
            response = json_match.group(1)

        # Clean up the response
        response = response.strip()

        try:
            return json.loads(response)
        except json.JSONDecodeError:
            logger.warning(f"Failed to parse LLM response as JSON: {response[:200]}")
            return {"entities": [], "relationships": []}
