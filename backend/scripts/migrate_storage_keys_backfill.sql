-- Recover the storage key for task attachments so existing uploads stop 404ing.
--
-- `task_attachments.file_url` was written by StorageService.get_object_url() as
-- an *unsigned* path-style URL under S3_PUBLIC_ENDPOINT_URL, e.g.
--   https://server.aexy.io/storage/aexy-storage/task-attachments/<task>/<hex>_<name>
-- Two things make that a dead link in production:
--   1. nothing serves /storage/ — the request lands on the FastAPI app (which
--      404s) rather than being proxied to RustFS; and
--   2. put_object() sets no public-read ACL, so even with the proxy in place an
--      unsigned GET is rejected.
--
-- Responses now presign per request instead (see
-- storage_service.presign_stored_object), which needs the object *key* rather
-- than a URL. New rows persist it in `storage_key`; this backfills the rows
-- written before the column existed. The bytes were never lost — put_object
-- success is checked at upload time — so recovering the key is enough to make
-- every old attachment load again.
--
-- Keying off the 'task-attachments/' prefix rather than the bucket name keeps
-- this correct across deployments with different S3_BUCKET_NAME values, and
-- matches every key ATTACHMENTS_PREFIX has ever produced.

ALTER TABLE task_attachments
    ADD COLUMN IF NOT EXISTS storage_key VARCHAR(1024);

-- split_part strips any query string, so rows that happened to store a
-- presigned URL yield the bare key too.
UPDATE task_attachments
SET storage_key = substring(
        split_part(file_url, '?', 1)
        FROM position('task-attachments/' IN file_url)
    )
WHERE storage_key IS NULL
  AND file_url IS NOT NULL
  AND position('task-attachments/' IN file_url) > 0;

-- Drive files have the identical defect (api/drive.py persisted
-- get_object_url() too, and the Drive UI opens that URL directly), so recover
-- their keys the same way. Folders are rows with a NULL file_url and correctly
-- get no storage_key.
ALTER TABLE drive_files
    ADD COLUMN IF NOT EXISTS storage_key VARCHAR(1024);

UPDATE drive_files
SET storage_key = substring(
        split_part(file_url, '?', 1)
        FROM position('drive/' IN file_url)
    )
WHERE storage_key IS NULL
  AND file_url IS NOT NULL
  AND position('drive/' IN file_url) > 0;

-- Report anything left behind. A non-zero count means those rows' URLs don't
-- follow the expected prefix layout (hand-inserted or imported); they keep
-- working through the key_from_url fallback in presign_stored_object.
DO $$
DECLARE
    unresolved_attachments INTEGER;
    unresolved_drive INTEGER;
BEGIN
    SELECT count(*) INTO unresolved_attachments
    FROM task_attachments
    WHERE storage_key IS NULL;

    IF unresolved_attachments > 0 THEN
        RAISE NOTICE
            'task_attachments: % row(s) have no derivable storage_key; falling back to key_from_url at read time',
            unresolved_attachments;
    END IF;

    SELECT count(*) INTO unresolved_drive
    FROM drive_files
    WHERE storage_key IS NULL
      AND file_url IS NOT NULL;

    IF unresolved_drive > 0 THEN
        RAISE NOTICE
            'drive_files: % non-folder row(s) have no derivable storage_key; falling back to key_from_url at read time',
            unresolved_drive;
    END IF;
END $$;
