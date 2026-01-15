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

```bash
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

---

## Backup & Restore

### Automated Backups
Backups run automatically at 2 AM daily. Files are stored in `./backup/dumps/`

### Manual Backup
```bash
docker compose -f docker-compose.prod.yml exec backup /bin/sh /backup.sh
```

### Restore from Backup
```bash
# List available backups
ls -la backup/dumps/

# Restore (WARNING: overwrites all data!)
docker compose -f docker-compose.prod.yml exec backup /bin/sh /backup/restore.sh dumps/<backup_file>.sql.gz
```

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

### Celery Monitoring (Flower)
Flower is not exposed publicly by default. To access:
```bash
# SSH tunnel from your local machine
ssh -L 5555:localhost:5555 user@your-server

# Then open http://localhost:5555 in your browser
```

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
