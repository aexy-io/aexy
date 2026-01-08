# Deployment Guide

## Overview

This guide covers deploying Aexy to production environments, including Docker, Kubernetes, and cloud platforms.

## Prerequisites

- Docker and Docker Compose
- PostgreSQL 14+
- Redis 6+
- Domain with SSL certificate
- GitHub App configured for production

## Deployment Options

### Option 1: Docker Compose (Simple)

Best for small teams and initial deployments.

#### docker-compose.yml

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql+asyncpg://aexy:${DB_PASSWORD}@postgres:5432/aexy
      - REDIS_URL=redis://redis:6379/0
      - LLM_PROVIDER=${LLM_PROVIDER}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
      - GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://backend:8000/api
    depends_on:
      - backend
    restart: unless-stopped

  celery-worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: celery -A aexy.processing.celery_app worker --loglevel=info
    environment:
      - DATABASE_URL=postgresql+asyncpg://aexy:${DB_PASSWORD}@postgres:5432/aexy
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  celery-beat:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: celery -A aexy.processing.celery_app beat --loglevel=info
    environment:
      - DATABASE_URL=postgresql+asyncpg://aexy:${DB_PASSWORD}@postgres:5432/aexy
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: postgres:16
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=aexy
      - POSTGRES_USER=aexy
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - backend
      - frontend
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

#### Deploy

```bash
# Set environment variables
export DB_PASSWORD=your-secure-password
export JWT_SECRET_KEY=your-secure-jwt-key
export GITHUB_CLIENT_ID=your-client-id
export GITHUB_CLIENT_SECRET=your-client-secret
export LLM_PROVIDER=claude
export ANTHROPIC_API_KEY=your-api-key

# Start services
docker-compose up -d

# Run migrations
docker-compose exec backend alembic upgrade head

# Check logs
docker-compose logs -f
```

### Option 2: Kubernetes

Best for large-scale deployments with auto-scaling.

#### Namespace

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: aexy
```

#### Backend Deployment

```yaml
# k8s/backend-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aexy-backend
  namespace: aexy
spec:
  replicas: 3
  selector:
    matchLabels:
      app: aexy-backend
  template:
    metadata:
      labels:
        app: aexy-backend
    spec:
      containers:
        - name: backend
          image: aexy/backend:latest
          ports:
            - containerPort: 8000
          envFrom:
            - secretRef:
                name: aexy-secrets
            - configMapRef:
                name: aexy-config
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "500m"
          readinessProbe:
            httpGet:
              path: /api/ready
              port: 8000
            initialDelaySeconds: 10
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /api/health
              port: 8000
            initialDelaySeconds: 15
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: aexy-backend
  namespace: aexy
spec:
  selector:
    app: aexy-backend
  ports:
    - port: 80
      targetPort: 8000
```

#### Secrets

```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: aexy-secrets
  namespace: aexy
type: Opaque
stringData:
  DATABASE_URL: postgresql+asyncpg://user:pass@postgres:5432/aexy
  REDIS_URL: redis://redis:6379/0
  GITHUB_CLIENT_SECRET: your-secret
  ANTHROPIC_API_KEY: your-api-key
  JWT_SECRET_KEY: your-jwt-secret
```

#### ConfigMap

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: aexy-config
  namespace: aexy
data:
  LLM_PROVIDER: "claude"
  GITHUB_CLIENT_ID: "your-client-id"
  ENVIRONMENT: "production"
```

#### Ingress

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: aexy-ingress
  namespace: aexy
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts:
        - api.aexy.io
        - aexy.io
      secretName: aexy-tls
  rules:
    - host: api.aexy.io
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: aexy-backend
                port:
                  number: 80
    - host: aexy.io
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: aexy-frontend
                port:
                  number: 80
```

#### Deploy to Kubernetes

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Apply secrets and config
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmap.yaml

# Deploy services
kubectl apply -f k8s/

# Check status
kubectl get pods -n aexy
kubectl get services -n aexy
```

### Option 3: Cloud Platforms

#### AWS

**Services Used:**
- ECS/EKS for containers
- RDS for PostgreSQL
- ElastiCache for Redis
- ALB for load balancing
- S3 for file storage
- CloudWatch for monitoring

**Terraform Example:**

```hcl
# terraform/main.tf
module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  name   = "aexy-vpc"
  cidr   = "10.0.0.0/16"
}

module "rds" {
  source               = "terraform-aws-modules/rds/aws"
  identifier           = "aexy-db"
  engine               = "postgres"
  engine_version       = "16"
  instance_class       = "db.t3.medium"
  allocated_storage    = 20
  db_name              = "aexy"
  username             = "aexy"
  password             = var.db_password
}

module "elasticache" {
  source                 = "terraform-aws-modules/elasticache/aws"
  cluster_id             = "aexy-cache"
  engine                 = "redis"
  node_type              = "cache.t3.micro"
  num_cache_nodes        = 1
}
```

#### GCP

**Services Used:**
- Cloud Run for containers
- Cloud SQL for PostgreSQL
- Memorystore for Redis
- Cloud Load Balancing
- Cloud Storage for files

#### Azure

**Services Used:**
- Azure Container Apps
- Azure Database for PostgreSQL
- Azure Cache for Redis
- Azure Application Gateway

## Production Checklist

### Security

- [ ] SSL/TLS certificates configured
- [ ] Database passwords rotated
- [ ] API keys stored in secrets manager
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] Webhook signatures validated
- [ ] JWT tokens properly configured

### Database

- [ ] Regular backups configured
- [ ] Point-in-time recovery enabled
- [ ] Connection pooling enabled
- [ ] Read replicas for analytics (if needed)
- [ ] Migrations tested and applied

### Monitoring

- [ ] Health checks configured
- [ ] Metrics collection enabled
- [ ] Log aggregation set up
- [ ] Alerting configured
- [ ] Uptime monitoring active

### Performance

- [ ] CDN for frontend assets
- [ ] Redis caching enabled
- [ ] Database indexes optimized
- [ ] Horizontal scaling configured
- [ ] Auto-scaling policies set

## Environment Variables (Production)

```bash
# Application
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/aexy
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=10

# Redis
REDIS_URL=redis://host:6379/0

# GitHub App
GITHUB_CLIENT_ID=your-production-client-id
GITHUB_CLIENT_SECRET=your-production-client-secret
GITHUB_WEBHOOK_SECRET=your-production-webhook-secret

# LLM
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=your-production-api-key

# JWT
JWT_SECRET_KEY=your-production-jwt-secret
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440

# CORS
CORS_ORIGINS=https://aexy.io,https://app.aexy.io

# Frontend
NEXT_PUBLIC_API_URL=https://api.aexy.io/api
```

## Backup and Recovery

### Database Backup

```bash
# Manual backup
pg_dump -h host -U aexy aexy > backup.sql

# Automated backup (cron)
0 2 * * * pg_dump -h host -U aexy aexy | gzip > /backups/aexy-$(date +%Y%m%d).sql.gz
```

### Restore

```bash
# Restore from backup
psql -h host -U aexy aexy < backup.sql
```

## Scaling

### Horizontal Scaling

- Add more backend replicas
- Load balancer distributes traffic
- Celery workers scale independently

### Vertical Scaling

- Increase container resources
- Upgrade database instance
- Scale Redis cluster

### Database Read Replicas

For analytics-heavy workloads:

```python
# Configure read replica
ANALYTICS_DATABASE_URL=postgresql+asyncpg://user:pass@replica:5432/aexy
```

## Troubleshooting

### Common Issues

**API Not Responding**
```bash
# Check container logs
docker-compose logs backend

# Check health endpoint
curl https://api.aexy.io/api/health
```

**Database Connection Issues**
```bash
# Test connection
psql -h host -U aexy -d aexy

# Check connection pool
kubectl exec -it aexy-backend-xxx -- python -c "from aexy.core.database import engine; print(engine.pool.status())"
```

**Redis Connection Issues**
```bash
# Test connection
redis-cli -h host ping
```

**Celery Workers Not Processing**
```bash
# Check worker status
celery -A aexy.processing.celery_app inspect active

# Check queue
celery -A aexy.processing.celery_app inspect reserved
```
