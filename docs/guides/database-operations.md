# Database Operations

Reference for everything that touches PostgreSQL on Aexy: migrations, image
rebuilds, backups, restores, and version upgrades.

The deployment uses a **custom postgres image** built from
`postgres/Dockerfile` — stock `postgres:18-alpine` with `pgvector v0.8.1`
compiled in. Data lives in a Docker named volume (`postgres_data`); the
image and the data are independent.

---

## Custom SQL migration system

Aexy does **not** use Alembic. Migrations are SQL files in
`backend/scripts/migrate_*.sql`, tracked in a `schema_migrations` table
with checksums, run in alphabetical order by `backend/scripts/run_migrations.py`.

```bash
# List migrations and their applied/pending status
docker exec aexy-backend python scripts/run_migrations.py --list

# Preview without executing (dry run)
docker exec aexy-backend python scripts/run_migrations.py --dry-run

# Run all pending migrations
docker exec aexy-backend python scripts/run_migrations.py

# Run a specific migration file
docker exec aexy-backend python scripts/run_migrations.py \
  --file migrate_billing_period_snapshots.sql

# Force re-run an already-applied migration (DANGEROUS — use only when
# the prior run failed mid-file and you've cleaned up partial state)
docker exec aexy-backend python scripts/run_migrations.py \
  --file migrate_thing.sql --force
```

To add a new migration:
1. Create `backend/scripts/migrate_<descriptive_name>.sql`. Filename order
   is alphabetical, so prefix with the date (`migrate_2026_05_07_billing.sql`)
   if order matters.
2. Make it idempotent where possible (`CREATE TABLE IF NOT EXISTS`,
   `ALTER TABLE … ADD COLUMN IF NOT EXISTS`). Failed mid-file applies
   easier.
3. Run `--dry-run` first to confirm it parses, then apply.

> Alembic is installed as a transitive dependency but is not used. Don't
> create Alembic migrations.

---

## Will rebuilding postgres delete my data?

**No** — as long as you don't pass `-v` to `down` or remove the named
volume.

The compose file mounts:
```yaml
postgres:
  build: ./postgres
  image: aexy-postgres:18-alpine-pgvector
  volumes:
    - postgres_data:/var/lib/postgresql/data
```

`docker-compose build postgres` produces a new image. `docker-compose up -d
postgres` starts a fresh container that mounts the same volume and reads
the existing PGDATA. Your data is intact.

### What WOULD destroy data

| Action | What it does |
|---|---|
| `docker-compose down -v` | Removes named volumes including `postgres_data`. |
| `docker volume rm <project>_postgres_data` | Same effect. |
| Major version bump (e.g. PG 17 → PG 18) | New server can't read old PGDATA without `pg_upgrade`. |
| Base image switch (alpine → debian) | UID of `postgres` user differs (alpine ~70, debian 999); container won't start without a `chown -R`. |
| Glibc/musl collation change | Text indexes built under one libc can corrupt under the other. Requires a `REINDEX`. |

The `postgres/Dockerfile` deliberately stays on `postgres:18-alpine` to
avoid the latter two — see the comment at the top of the Dockerfile.

### Safe rebuild flow

```bash
# 1. Take a manual dump first (cheap insurance)
docker exec aexy-postgres pg_dump -U postgres -d aexy \
  | gzip > pre_rebuild_$(date +%Y%m%d_%H%M%S).sql.gz

# 2. Rebuild the image
docker-compose build postgres

# 3. Restart against the same volume
docker-compose up -d postgres

# 4. Sanity-check
docker exec aexy-postgres psql -U postgres -d aexy \
  -c "SELECT count(*) FROM workspaces;"
```

For production swap `postgres`/`aexy` for the values in `.env.prod`
(`POSTGRES_USER`, `POSTGRES_DB`).

---

## Backups

### Production: automated daily backups

`docker-compose.prod.yml` runs an `aexy-backup` sidecar that wakes every
30 minutes and, at 02:00 UTC, runs `pg_dump | gzip` into the `backup_data`
volume under `/backup/dumps/`. Default retention is 7 days
(`BACKUP_RETENTION_DAYS`).

```bash
# List backups
docker exec aexy-backup ls -lh /backup/dumps/

# Pull a backup to the host
docker cp aexy-backup:/backup/dumps/aexy_20260507_020000.sql.gz ./
```

### Production: manual on-demand backup

The sidecar's command is inline (it doesn't mount the helper scripts), so
trigger a manual backup directly from the postgres container:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  | gzip > manual_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Dev (compose)

```bash
docker exec aexy-postgres pg_dump -U postgres -d aexy \
  | gzip > dev_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Volume snapshot (faster, but stricter)

A binary copy of `postgres_data` works as long as the postgres major
version and base image are identical to the dump's source. Useful for
"roll back the rebuild itself" scenarios.

```bash
# Snapshot
docker-compose stop postgres
docker run --rm \
  -v aexy_postgres_data:/data \
  -v "$PWD":/b alpine \
  tar czf /b/postgres_data_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .
docker-compose start postgres
```

### Off-site sync (production)

Run on the host via cron:

```cron
# Sync the daily dumps off-site every hour
0 * * * * aws s3 sync /var/lib/docker/volumes/aexy_backup_data/_data/dumps/ \
  s3://your-bucket/aexy-backups/
```

(Adjust the docker volumes path for your platform.)

---

## Restore

### From a sql dump

```bash
# 1. Stop writers so the restore is consistent
docker-compose stop backend temporal-worker

# 2. Drop and recreate the database
docker exec aexy-postgres psql -U postgres \
  -c "DROP DATABASE IF EXISTS aexy;"
docker exec aexy-postgres psql -U postgres \
  -c "CREATE DATABASE aexy;"

# 3. Pipe the dump into psql
gunzip -c pre_rebuild_YYYYMMDD_HHMMSS.sql.gz \
  | docker exec -i aexy-postgres psql -U postgres -d aexy

# 4. Bring writers back
docker-compose start backend temporal-worker
```

For prod swap `postgres`/`aexy` for `$POSTGRES_USER`/`$POSTGRES_DB` and
use `docker compose -f docker-compose.prod.yml`.

### From a volume snapshot

Only valid when the postgres major version and base image match.

```bash
docker-compose stop postgres
docker run --rm \
  -v aexy_postgres_data:/data \
  -v "$PWD":/b alpine \
  sh -c "rm -rf /data/* && tar xzf /b/postgres_data_YYYYMMDD_HHMMSS.tar.gz -C /data"
docker-compose start postgres
```

### Helper scripts at `backup/`

The repo ships `backup/backup.sh` and `backup/restore.sh` as standalone
helper scripts. They're **not** mounted into the production `aexy-backup`
container, so you can either:

- Mount them yourself and exec inside the container:
  ```yaml
  # in docker-compose.prod.yml under the `backup` service
  volumes:
    - backup_data:/backup
    - ./backup:/scripts:ro
  ```
  ```bash
  docker compose -f docker-compose.prod.yml exec backup \
    /bin/sh /scripts/backup.sh
  ```
- Or run them directly from the host with `PGHOST=localhost` and the
  postgres port forwarded.

---

## Major version upgrade (e.g. 18 → 19)

PG major versions can't share PGDATA. Plan a maintenance window.

```bash
# 1. Stop everything that writes
docker-compose stop backend temporal-worker

# 2. Take a fresh dump from the current version
docker exec aexy-postgres pg_dump -U postgres -d aexy \
  | gzip > pre_upgrade_v18_$(date +%Y%m%d_%H%M%S).sql.gz

# 3. Bump postgres/Dockerfile to the new base, rebuild
sed -i '' 's/FROM postgres:18-alpine/FROM postgres:19-alpine/' postgres/Dockerfile
docker-compose build postgres

# 4. Wipe the volume so the new server initialises cleanly
docker-compose down
docker volume rm aexy_postgres_data
docker-compose up -d postgres

# 5. Restore the dump (recreates schema and data)
gunzip -c pre_upgrade_v18_YYYYMMDD_HHMMSS.sql.gz \
  | docker exec -i aexy-postgres psql -U postgres -d aexy

# 6. Re-run pending migrations and bring the rest back
docker-compose up -d
docker exec aexy-backend python scripts/run_migrations.py --list
docker exec aexy-backend python scripts/run_migrations.py
```

Don't try to copy the old PGDATA into the new image — the on-disk format
differs across major versions and the new server will refuse to start.

---

## pgvector specifics

The image ships with pgvector v0.8.1 (the first release with PG 18
support). Rebuild after bumping `PGVECTOR_VERSION` in `postgres/Dockerfile`:

```bash
docker-compose build --build-arg PGVECTOR_VERSION=v0.8.2 postgres
docker-compose up -d postgres
```

Existing `vector` columns and indexes survive a pgvector point-version
bump — the on-disk format hasn't changed within the 0.x line. Major
pgvector upgrades (0.x → 1.x, when that happens) require a `REINDEX`.

---

## Common operational tasks

```bash
# psql shell
docker exec -it aexy-postgres psql -U postgres -d aexy

# Largest tables
docker exec aexy-postgres psql -U postgres -d aexy -c "
  SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS size
  FROM pg_catalog.pg_statio_user_tables
  ORDER BY pg_total_relation_size(relid) DESC
  LIMIT 20;"

# Active connections
docker exec aexy-postgres psql -U postgres -d aexy -c "
  SELECT pid, state, query_start, left(query, 80) AS query
  FROM pg_stat_activity WHERE datname = 'aexy' ORDER BY query_start;"

# Long-running queries (>1 min)
docker exec aexy-postgres psql -U postgres -d aexy -c "
  SELECT pid, now() - query_start AS duration, left(query, 100)
  FROM pg_stat_activity
  WHERE state = 'active' AND now() - query_start > interval '1 minute';"

# Reindex one table (online — pgvector indexes too)
docker exec aexy-postgres psql -U postgres -d aexy \
  -c "REINDEX TABLE CONCURRENTLY workspaces;"

# Vacuum + analyze (autovacuum usually handles this)
docker exec aexy-postgres psql -U postgres -d aexy -c "VACUUM ANALYZE;"
```

---

## Troubleshooting

**Backup container is empty / no dumps appearing.** It only writes at
02:00 UTC. Trigger a manual one (above) to confirm credentials and the
volume mount work.

**`pg_dump: error: server version mismatch`.** The client and server PG
versions diverged after a rebuild. Run `pg_dump` from the postgres
container itself (`docker exec aexy-postgres pg_dump …`) instead of the
host so client and server match.

**Container won't start after a rebuild with `FATAL: database files are
incompatible with server`.** You changed the major version. Either revert
the version in `postgres/Dockerfile` or follow the major-version upgrade
flow above.

**`connection refused` from backend even though postgres is up.** Check
the healthcheck (`docker-compose ps`) — the backend depends on
`service_healthy`, so a slow-starting postgres can keep backend in
`Created` state. Tail `docker-compose logs postgres` for init errors.
