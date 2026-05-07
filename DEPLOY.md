# Production Deployment Guide

## Quick Start

### 1. Server Setup

Get a VPS with at least 4GB RAM (DigitalOcean, Hetzner, Linode, etc.)

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin
```

### 2. Clone and Configure

```bash
git clone <your-repo-url> /opt/aexy
cd /opt/aexy

# Create production environment file
cp .env.prod.example .env.prod

# Edit with your values (REQUIRED)
nano .env.prod
```

**Required values in `.env.prod`:**
- `POSTGRES_PASSWORD` - Strong database password
- `SECRET_KEY` - Generate with: `openssl rand -hex 32`
- `GEMINI_API_KEY` - Your Gemini API key

### 3. Deploy

```bash
# Build and start all services
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# Check status
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f
```

### 4. Run Database Migrations

Aexy uses a **custom SQL migration system** (not Alembic). Migration
files live under `backend/scripts/migrate_*.sql` and are tracked in a
`schema_migrations` table.

```bash
# Status of all migrations
docker compose -f docker-compose.prod.yml exec backend \
  python scripts/run_migrations.py --list

# Apply all pending migrations
docker compose -f docker-compose.prod.yml exec backend \
  python scripts/run_migrations.py
```

For full migration commands and database operations, see the
[Database Operations guide](docs/guides/database-operations.md).

---

## Backup & Restore

### Automated Backups
The `aexy-backup` sidecar wakes every 30 minutes and runs `pg_dump | gzip`
at 02:00 UTC daily into the `backup_data` volume under `/backup/dumps/`.
Default retention is 7 days (`BACKUP_RETENTION_DAYS`).

```bash
# List backups inside the container
docker compose -f docker-compose.prod.yml exec backup ls -lh /backup/dumps/

# Pull a backup file to the host
docker cp aexy-backup:/backup/dumps/aexy_YYYYMMDD_HHMMSS.sql.gz ./
```

### Manual Backup
The sidecar uses an inline command and does not mount the helper scripts,
so trigger manual backups directly against postgres:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  | gzip > manual_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Restore from Backup
```bash
# Stop writers
docker compose -f docker-compose.prod.yml stop backend temporal-worker

# Drop, recreate, restore
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U "$POSTGRES_USER" -c "DROP DATABASE IF EXISTS $POSTGRES_DB;"
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U "$POSTGRES_USER" -c "CREATE DATABASE $POSTGRES_DB;"

gunzip -c manual_YYYYMMDD_HHMMSS.sql.gz \
  | docker compose -f docker-compose.prod.yml exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

# Bring writers back
docker compose -f docker-compose.prod.yml start backend temporal-worker
```

> Rebuilding the postgres image (`docker compose build postgres`) does
> **not** delete data — the `postgres_data` named volume is independent
> of the image. Major-version bumps and base-image switches do require a
> dump/restore cycle. See the
> [Database Operations guide](docs/guides/database-operations.md#will-rebuilding-postgres-delete-my-data).

### Offsite Backup (Recommended)
Set up a cron job to sync backups to cloud storage:

```bash
# Example: sync to S3 every hour
0 * * * * aws s3 sync /opt/aexy/backup/dumps/ s3://your-bucket/aexy-backups/
```

---

## SSL/HTTPS Setup

### Option A: Let's Encrypt (Free)

1. Point your domain to your server's IP
2. Install certbot:
```bash
sudo apt install certbot
```

3. Get certificates:
```bash
# Stop nginx temporarily
docker compose -f docker-compose.prod.yml stop nginx

# Get certificate
sudo certbot certonly --standalone -d your-domain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/
```

4. Update `nginx/nginx.conf`:
   - Uncomment the HTTPS server block
   - Uncomment the HTTP to HTTPS redirect
   - Replace `your-domain.com` with your actual domain

5. Restart nginx:
```bash
docker compose -f docker-compose.prod.yml restart nginx
```

### Option B: Cloudflare (Easiest)
1. Add your domain to Cloudflare
2. Enable "Full" SSL mode
3. Cloudflare handles SSL termination

---

## Common Commands

```bash
# Start services
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Stop services
docker compose -f docker-compose.prod.yml down

# View logs
docker compose -f docker-compose.prod.yml logs -f [service_name]

# Restart a service
docker compose -f docker-compose.prod.yml restart backend

# Update and redeploy
git pull
docker compose -f docker-compose.prod.yml up -d --build

# Shell into a container
docker compose -f docker-compose.prod.yml exec backend /bin/sh

# Check resource usage
docker stats
```

---

## Monitoring

### Health Check
```bash
curl http://localhost/health
```

### Temporal UI (workflow monitoring)
Aexy uses Temporal for background processing (replaces Celery). The
Temporal UI runs on port 8080 and is **not** exposed publicly by default
in `docker-compose.prod.yml`. To access:

```bash
# SSH tunnel from your local machine
ssh -L 8080:localhost:8080 user@your-server

# Then open http://localhost:8080 in your browser
```

The UI shows running workflows, schedules, activity history, and retry
state. For scheduled jobs (daily aggregations, periodic checks) look
under "Schedules"; for ad-hoc workflow runs look under "Workflows".

---

## Troubleshooting

### Container won't start
```bash
docker compose -f docker-compose.prod.yml logs [service_name]
```

### Database connection issues
```bash
# Check if postgres is healthy
docker compose -f docker-compose.prod.yml exec postgres pg_isready -U aexy
```

### Out of disk space
```bash
# Clean up Docker
docker system prune -a

# Check backup sizes
du -sh backup/dumps/*
```

### Reset everything (CAUTION: deletes all data)
```bash
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml up -d --build
```
