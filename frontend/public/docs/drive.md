# Drive

The workspace file store — upload, foldering, sharing, search and quota.
`api/drive.py` (18 endpoints), `api/file_search.py`, models in
`models/drive.py`. Routes: `/docs/drive`, `/docs/drive/[fileId]`,
`/docs/drive/smart-views/[viewId]`.

`documents-and-drive.md` covers Docs — the editor, the knowledge graph, and the
AI metadata pipeline that annotates uploads. This is the file browser those
uploads land in.

## Mental model

- **File** — a `drive_files` row. Bytes live in object storage (RustFS/S3, see
  `guides/file-uploads.md`); the row holds the metadata and the URL.
- **Folder** — the same table, `kind="folder"`, `file_url` NULL. The hierarchy
  is a self-referencing `parent_id`, so a folder is a file that contains
  nothing but a name and a place in the tree.
- **Smart View** — a saved filter that *looks* like a folder and moves nothing.
  It stores a `filter_query` JSONB document (`{"all_tags": ["invoice"]}`) which
  the drive service compiles to a GIN-indexed query against
  `file_metadata.ai_tags`. One file appears in every smart view it matches, and
  in exactly one real folder.

That distinction is the whole design. Foldering forces one answer to "where
does this belong"; smart views let the AI tags answer it many times over
without duplicating anything.

## API

    GET    /files                       list, by folder
    GET    /files/{id}                  metadata
    GET    /files/{id}/content          the bytes
    POST   /folders                     create a folder
    PATCH  /files/{id}                  rename, move, retag
    DELETE /files/{id}
    POST   /files/{id}/reannotate       re-run the AI pipeline — 202, async
    GET    /smart-views
    POST   /smart-views
    PATCH  /smart-views/{id}
    DELETE /smart-views/{id}
    GET    /usage                       quota

Uploads are presigned rather than proxied: the client asks for a URL and PUTs
the bytes straight to storage, so a large file never occupies an API worker.

## Quota

`GET /usage` returns `used_bytes`, `limit_bytes`, `unlimited`, `percent_used`
and `files_count`. The limit is a plan property, so a workspace can be
`unlimited: true` and the other numbers are still meaningful for display.

Nothing enforces the quota at upload time in the presigned path — the check
happens when the upload is registered. A workspace can therefore exceed its
limit by one file, which is deliberate: failing after the bytes are already
transferred is worse than allowing the overshoot and refusing the next one.

## Search

`api/file_search.py` searches names, AI tags and extracted content.
It is a different index from the handbook's docs search and from the CRM's;
they do not share ranking.

## Common pitfalls

- **Deleting a folder does not delete its contents** through the API — the
  children are reparented. The cascade in the schema is on `workspace_id`, not
  `parent_id`.
- **`reannotate` returns 202.** The tags do not change by the time the response
  arrives, and the smart views that depend on them update later.
- **A smart view is not a place.** Moving a file "out of" one means changing
  its tags, not dragging it. The UI makes this look like a folder and it is
  not.
- **Quota counts stored bytes, not visible files.** A file in the trash still
  counts until it is purged.
