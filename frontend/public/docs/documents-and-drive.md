# Documents, Drive & Knowledge Graph

Three closely related modules that share a single AI metadata pipeline:

- **Documents** — Notion-like rich-text docs grouped into **Document Spaces**
- **Drive** — file browser (S3-backed) with folders and previews
- **Knowledge Graph** — entities + relationships extracted from documents and other content, surfaced as a queryable graph

All three flow through the same `FileMetadata` table and the same Temporal `extract_file_ai_metadata` activity for summaries, embeddings, and tagging.

## Documents

Rich-text collaborative docs organized into spaces.

### Routers

| Router | Purpose |
|---|---|
| `api/documents.py` | Document CRUD, versions, comments |
| `api/document_spaces.py` | Space (folder) management, sharing |

### Models

**`DocumentSpace`** — a top-level container, like a Notion workspace section.

**`Document`** — the document.

| Field | Note |
|---|---|
| `workspace_id`, `space_id` | Scope |
| `title`, `content` (ProseMirror JSON) | |
| `parent_id` | For nested docs |
| `is_public`, `public_slug` | For shareable URLs |
| `version_count`, `last_edited_by_id`, `last_edited_at` | |

Documents support embedded references to other Aexy entities (records, tasks, files) via inline block types in the ProseMirror schema.

### Frontend

`/frontend/src/app/(app)/documents/` — Notion-like UI: tree of spaces and docs, rich-text editor, comment threads, version history.

## Drive

File browser with hierarchical folders, previews, and AI metadata.

### Routers

| Router | Purpose |
|---|---|
| `api/drive.py` | File/folder CRUD, move, rename, presigned URLs |
| `api/file_search.py` | Cross-workspace search over file content (uses `FileEmbedding`) |

### Models (`models/drive.py`)

**`DriveFile`** — file or folder:

| Field | Note |
|---|---|
| `workspace_id`, `parent_id` | Tree |
| `name`, `kind` | `file` / `folder` / `image` / `video` / `audio` / `pdf` / `doc` |
| `file_url` | Reference to the S3 object |
| `file_size_bytes`, `content_type` | |
| `uploaded_by_id`, `created_at`, `updated_at` | |

Files are stored in the S3-compatible backend (RustFS in dev; configurable in prod). See [file-uploads.md](./guides/file-uploads.md) for the upload pattern.

### Frontend

`/frontend/src/app/(app)/drive/` — file browser with drag-drop upload, breadcrumbs, previews, and bulk operations.

## FileMetadata: the polymorphic spine

`backend/src/aexy/models/file_metadata.py` is where the three modules converge.

```
FileMetadata
  ├── source_type           # drive_file | task_attachment | compliance_document | crm_record_attachment | recording
  ├── source_id             # FK to the source-specific row
  ├── ai_summary, ai_tags
  ├── extracted_text
  └── FileEmbedding[]       # chunk-level embeddings, Vector(1024)
```

The polymorphism (`source_type` + `source_id` instead of one row per source kind) is what lets the AI metadata pipeline treat all binary content uniformly. A PDF in Drive, an attachment on a sprint task, and a compliance document all run through the same code path.

### FileEmbedding

| Field | Note |
|---|---|
| `metadata_id`, `chunk_index` | Identity (unique together) |
| `chunk_text` | The text chunk |
| `embedding` (`Vector(1024)` via `pgvector`) | The vector |
| `embedding_model` | `text-embedding-3-large@1024` (OpenRouter) or `bge-m3` (Ollama) |

Both models output 1024-dimensional vectors — chosen for cost/quality balance and so the column can be a single vector type.

## AI metadata pipeline

`services/file_ai_pipeline.py:run_pipeline(db, source_type, source_id, gateway)` is the entry point. Steps:

1. **Locate** the binary in S3 via `FileMetadata.file_url`.
2. **Extract** text — PDFs via `pypdf`, DOCX via `python-docx`, video via `ffmpeg` keyframes + Whisper, images via vision model.
3. **Chunk** the extracted text.
4. **Embed** each chunk and write to `FileEmbedding`.
5. **Summarize** with the LLM gateway; write `ai_summary`, `ai_tags` back to `FileMetadata`.
6. **Index** for knowledge graph (next section).

Dispatched as the Temporal activity `extract_file_ai_metadata` (LLM retry, 30-minute timeout, 5-minute heartbeats — `dispatch.py:60-68`). Workspace-wide backfill is the separate activity `backfill_workspace_file_metadata` (6-hour timeout, throttled to ~10 files/min/workspace).

The legacy `drive_ai_pipeline.py` is a deprecated shim that delegates to the polymorphic version.

## Knowledge Graph

Entities and relationships extracted from documents and surfaced for querying.

### Router

`api/knowledge_graph.py` — Enterprise-gated (`require_enterprise_workspace`, line 48-80).

### Models (`models/knowledge_graph.py`)

**`KnowledgeEntity`**:

| Field | Note |
|---|---|
| `entity_type` (`KnowledgeEntityType`) | `PERSON` / `CONCEPT` / `TECHNOLOGY` / `PROJECT` / `ORGANIZATION` / `CODE` / `EXTERNAL` |
| `name`, `description` | |
| `attributes` (JSONB) | Type-specific attributes |
| `confidence` | Extraction confidence |
| `source_document_ids` (JSONB) | Where this entity was found |

**`KnowledgeRelationship`**:

| Field | Note |
|---|---|
| `source_entity_id`, `target_entity_id` | |
| `relationship_type` (`KnowledgeRelationType`) | `MENTIONS` / `RELATED_TO` / `DEPENDS_ON` / `AUTHORED_BY` / `IMPLEMENTS` / `REFERENCES` / `LINKS_TO` / `SHARES_ENTITY` |
| `confidence` | |
| `evidence_excerpts` (JSONB) | Snippets from source docs |

**`KnowledgeDocumentRelationship`** — joins entities back to their source docs for "show me where this came from" UX.

### Service

`services/knowledge_graph_service.py`:

- `GraphFilters` — `entity_types[]`, `relationship_types[]`, `space_ids[]`, date range, `min_confidence`, `max_nodes`
- `GraphNode`, `GraphEdge` — serialization shapes for the frontend visualizer
- `query_graph(filters)` — runs the filter against the entity/relationship tables and returns a connected subgraph

Extraction is dispatched as the `extract_knowledge_from_document` Temporal activity (LLM retry, 30-minute timeout). Triggered when a document is created/updated; pulls in entities and relationships incrementally.

Workspace-wide rebuild is `rebuild_workspace_graph` (LLM retry, 2-hour timeout, 5-minute heartbeats) — re-extracts from every doc, used for major model upgrades.

## MCP (Model Context Protocol)

Aexy is an **MCP host** — it exposes its internal APIs as MCP tools so external LLMs (Claude Desktop, agentic frontends) can use them.

### What's exposed

From `frontend/src/app/(app)/mcp/page.tsx`, the registered tool namespaces include:

| Category | Tools |
|---|---|
| Sprint management | `aexy_sprints`, `aexy_sprint_tasks`, `aexy_sprint_analytics`, `aexy_projects`, `aexy_epics`, `aexy_bugs` |
| CRM | `aexy_crm_objects`, `aexy_crm_records`, `aexy_crm_automations` |
| AI agents | `aexy_agents`, `aexy_agent_policies`, `aexy_workflows` |
| Email & GTM | `aexy_email_campaigns`, `aexy_email_infrastructure`, `aexy_gtm_leads`, `aexy_gtm_sequences` |
| Analytics | `aexy_analytics`, `aexy_developer_insights`, `aexy_compliance`, `aexy_assessments` |
| Platform | `aexy_workspaces`, `aexy_notifications`, `aexy_documents` |

### Authentication

MCP clients authenticate with `aexy_…` API tokens (see [authentication.md](./guides/authentication.md#api-tokens)). The workspace scope is set per-token.

### Direction

Aexy is an MCP **host/server** — it exposes tools. It does not currently **consume** external MCP servers (no inbound MCP client wired up). If your agent needs to call an external service, integrate it as a tool inside the agent rather than as an MCP consumer.

### Frontend

`/frontend/src/app/(app)/mcp/page.tsx` — read-only tool registry documentation. Tool definitions live on the backend; the UI surfaces them so admins can see what an external LLM can do with an API token from this workspace.

## Frontend summary

| Route | Purpose |
|---|---|
| `/documents` | Document spaces + editor |
| `/drive` | File browser |
| `/mcp` | MCP tool registry |
| Knowledge graph UI | Surfaced inside `/documents/{space}/graph` (the workspace-level view of entities derived from that space) |

## Common pitfalls

- **`FileMetadata` ≠ the source row.** Soft-deleting `FileMetadata` doesn't delete the `DriveFile` (or task attachment, etc.) — and vice versa. Cascade carefully.
- **Re-embedding every save is expensive.** Use stable `workflow_id`s like `file-meta-{file_id}-{content_hash}` so an unchanged file doesn't re-pay extraction cost. The pipeline checks chunk hashes, but only after re-fetching the binary.
- **Knowledge graph is Enterprise-gated.** Non-Enterprise workspaces get 403s on the router. Don't expose links to the graph view in shared UI without an Enterprise feature check.
- **Public docs leak embedded references.** A public `Document` with embedded `crm.record:{id}` blocks will render the reference; the public reader can see the linked record's `display_name`. Either resolve to a hard string at publish time or scrub embeds for public docs.
- **MCP tokens don't honor workspace switching.** A token created for workspace A only reaches workspace A. Switching the user's current workspace in the UI doesn't broaden the token.
- **Backfill at scale**: `backfill_workspace_file_metadata` is throttled. Don't kick it off and expect immediate results for big workspaces — it can take many hours.
