# File Uploads & Object Storage

Aexy stores all user-uploaded binary content (task attachments, drive files, compliance documents, recordings, AI agent outputs, etc.) in an **S3-compatible object store**. In development that's **RustFS** bundled in `docker-compose`; in production it can be RustFS, MinIO, AWS S3, Cloudflare R2, or any other S3-compatible backend.

## Stack

| Component | Where |
|---|---|
| S3 client + presigned URLs | `backend/src/aexy/services/storage_service.py:StorageService` |
| Provider-managed bucket creation | `StorageService.ensure_bucket_exists` |
| Per-feature uploaders (CRM attachments, drive, compliance docs, etc.) | use `StorageService` as a dependency |
| AI metadata pipeline (extract → embed → index) | `services/file_ai_pipeline.py` + Temporal `extract_file_ai_metadata` |
| Nginx public proxy | `/storage/<key>` → `rustfs:9000/<bucket>/<key>` in prod |

## Configuration

In `.env`:

```bash
# Generic S3 config (preferred)
S3_ENDPOINT_URL=http://rustfs:9000              # Internal — used by the backend container
S3_PUBLIC_ENDPOINT_URL=https://server.aexy.io/storage  # External — for browser-served URLs
S3_BUCKET_NAME=aexy
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_REGION=auto                                  # "auto" is fine for RustFS/R2

# Optional per-purpose prefixes
S3_RECORDINGS_PREFIX=recordings/
S3_COMPLIANCE_PREFIX=compliance/

# Cloudflare R2 fallback (for legacy installs)
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
```

`StorageService.__init__` (`storage_service.py:23-65`) prefers `S3_*` and falls back to `R2_*` if the S3 endpoint isn't set. Either way, it builds two boto3 clients:

- An **internal client** pointed at `S3_ENDPOINT_URL` for `PutObject` / `GetObject` — the backend uses this directly.
- A **public client** pointed at `S3_PUBLIC_ENDPOINT_URL` for **presigned URLs handed to the browser**. The public client is built only if the public endpoint differs from the internal one. This split exists because internal Docker hostnames (`rustfs:9000`) aren't reachable from the user's browser, but the signed URL must be valid there.

Both clients use `signature_version="s3v4"` with `addressing_style="path"` — required for RustFS and MinIO; AWS accepts both.

## RustFS in docker-compose

`docker-compose.yml` brings up a `rustfs` service on `:9000` with root creds from `RUSTFS_ROOT_USER` / `RUSTFS_ROOT_PASSWORD`. The same credentials feed the backend's `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`. Nginx proxies `/storage/` → `rustfs:9000/<bucket>/` so signed URLs work cleanly behind one origin.

To inspect contents:

```bash
docker exec aexy-rustfs ls /data
# or with mc (MinIO client), aws-cli, rclone, etc. pointed at S3_ENDPOINT_URL
```

## Upload flow

There are two patterns in the codebase. Use the second one for anything new.

### A) Server-side upload (legacy / small files)

The frontend POSTs to a backend endpoint with `multipart/form-data`. The backend reads the bytes, calls `StorageService.upload_bytes(...)`, and persists a `FileMetadata` row.

Pros: simple, easy to virus-scan or transform on the fly.
Cons: bytes flow through your API workers — bad for large files (>~25 MB).

### B) Presigned URL (preferred for anything user-uploaded)

1. Frontend asks the backend for a presigned PUT URL (`POST /workspaces/{id}/drive/upload-url` or per-module equivalent).
2. Backend calls `storage_service.generate_presigned_put_url(key, content_type, expires=300)` and returns it.
3. Frontend `PUT`s the file directly at the presigned URL, no backend round-trip for bytes.
4. On success, the frontend tells the backend "upload finished" (`POST /.../complete`) and the backend creates the `FileMetadata` row, dispatches the AI metadata pipeline, etc.

This is the only viable pattern for large recordings or video — the API never proxies the bytes.

### Reading

For private files, the backend issues a **presigned GET URL** with a short TTL (typically 5 minutes) via the **public** boto3 client so the URL is reachable from the browser. Frontends should treat these URLs as ephemeral — re-fetch on each render rather than caching.

Public assets that don't need auth (e.g. company logos, public form attachments) live under a prefix the storage layer is configured to expose unauthenticated through nginx.

## FileMetadata: the polymorphic record

`backend/src/aexy/models/file_metadata.py` is the canonical "we have a file" record, **polymorphic on `(source_type, source_id)`**:

| `source_type` | `source_id` points to | Used by |
|---|---|---|
| `drive_file` | `DriveFile.id` | Knowledge base / drive |
| `task_attachment` | `SprintTask` attachment row | Sprint tasks |
| `compliance_document` | `ComplianceDocument.id` | Compliance module |
| `crm_record_attachment` | CRM record file field | CRM |
| `recording` | call/meeting recording row | Booking / on-call |

Storing one `FileMetadata` row per upload lets the AI metadata pipeline (`file_ai_pipeline.py`) treat every file uniformly: extract text/audio, chunk, embed with `Vector(1024)` per chunk into `FileEmbedding`, and write back a summary/tags JSON. The pipeline is dispatched as the Temporal activity `extract_file_ai_metadata` (LLM retry, 30-minute timeout, 5-minute heartbeats — see `dispatch.py:60-68`).

There's also a workspace-level backfill activity, `backfill_workspace_file_metadata` (6-hour timeout, throttled to ~10 files/min per workspace), for re-indexing legacy uploads.

## Adding a new uploadable surface

1. Pick a new `source_type` slug — short, lowercase, snake-case.
2. Create the parent row (the thing the file belongs to) and persist its `id`.
3. Generate a presigned PUT URL via `StorageService`. Convention for keys: `<workspace_id>/<source_type>/<source_id>/<uuid>-<filename>`.
4. After the browser uploads, create a `FileMetadata` row with `(source_type, source_id, key, content_type, size_bytes, uploaded_by_id)`.
5. If you want AI metadata extracted (summary, embeddings, tags):
   ```python
   await dispatch(
       "extract_file_ai_metadata",
       ExtractFileMetadataInput(source_type="...", source_id=str(parent.id)),
       task_queue=TaskQueue.ANALYSIS,
       workflow_id=f"file-meta-{parent.id}",
   )
   ```
6. For deletes, soft-delete `FileMetadata` and either delete or lifecycle-rule the underlying object; the AI pipeline checks the soft-delete flag before re-indexing.

## Security

- **Presigned URLs are capability tokens** — anyone with the URL can read/write until it expires. Keep TTLs short (5 min for downloads, ≤15 min for uploads).
- **Allow-list MIME types** in the endpoint that issues the URL. boto3 will sign whatever you pass; the bucket doesn't enforce.
- **Cap upload size** by including `Content-Length` range constraints in the signed URL if your library supports it, or do a HEAD after upload and reject (and delete) anything oversized.
- **Public bucket access is off**. Nginx proxies `/storage/` but the bucket itself is private — public files go through signed-URL endpoints that omit auth, not through bucket ACLs.
- **Don't store secrets in `S3_PUBLIC_ENDPOINT_URL`** — it ends up baked into HTML for the user's browser to fetch.

## Common pitfalls

- **Internal vs public endpoint mismatch**: if the browser gets `http://rustfs:9000/...` as a signed URL, it can't reach it. Make sure `S3_PUBLIC_ENDPOINT_URL` is set to the externally-reachable origin.
- **path-style addressing**: RustFS/MinIO require `addressing_style="path"`. If you build a one-off S3 client elsewhere, copy the `Config` used in `storage_service.py:46-49`.
- **Forgetting to set `Content-Type` on PUT**: some downstream consumers (browser PDF viewer, video players) refuse to render without a proper MIME. Include it in the presigned URL signature.
- **Leaking objects on parent deletion**: when you delete a `DriveFile` or other parent, soft-delete `FileMetadata` and **schedule the object delete** — don't do it inline, since failed deletes shouldn't block the user's UI action.
- **Re-indexing every time**: the AI pipeline is expensive (LLM calls + embeddings). Make sure your `workflow_id` is stable per file version so re-uploads triggered by reloads don't re-pay the cost.
