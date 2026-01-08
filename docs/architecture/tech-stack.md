# Technology Stack

## Overview

Aexy uses a modern, production-ready technology stack optimized for developer experience and scalability.

## Backend

### Core Framework

| Technology | Version | Purpose |
|------------|---------|---------|
| Python | 3.11+ | Primary language |
| FastAPI | 0.100+ | Web framework |
| Pydantic | 2.0+ | Data validation |
| SQLAlchemy | 2.0+ | ORM (async) |
| Alembic | 1.12+ | Database migrations |

### Database & Storage

| Technology | Purpose |
|------------|---------|
| PostgreSQL | Primary database |
| Redis | Cache, sessions, queue broker |
| Local/S3 | File storage for exports |

### Background Processing

| Technology | Purpose |
|------------|---------|
| Celery | Task queue |
| APScheduler | Scheduled jobs |
| Redis | Celery broker |

### AI/ML

| Technology | Purpose |
|------------|---------|
| Anthropic Claude | Primary LLM provider |
| Ollama | Local/OSS LLM provider |
| Custom prompts | Analysis templates |

### Authentication

| Technology | Purpose |
|------------|---------|
| GitHub OAuth | User authentication |
| JWT | API tokens |
| python-jose | Token encoding/decoding |

### External Integrations

| Integration | API Type | Purpose |
|-------------|----------|---------|
| GitHub | REST/Webhooks | Source code data |
| Jira | REST | Task management |
| Linear | GraphQL | Task management |
| Slack | REST/Events | Team collaboration |

## Frontend

### Core Framework

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 14+ | React framework |
| React | 18+ | UI library |
| TypeScript | 5.0+ | Type safety |

### Styling

| Technology | Purpose |
|------------|---------|
| TailwindCSS | Utility-first CSS |
| clsx | Conditional classes |
| Lucide Icons | Icon library |

### Data Visualization

| Technology | Purpose |
|------------|---------|
| Recharts | Charts and graphs |
| Custom SVG | Network visualizations |

### State Management

| Technology | Purpose |
|------------|---------|
| React hooks | Local state |
| Context API | Global state |
| SWR/fetch | Data fetching |

## CLI Tool

### Core

| Technology | Purpose |
|------------|---------|
| Python 3.11+ | Language |
| Click | CLI framework |
| Rich | Terminal formatting |
| httpx | HTTP client |
| keyring | Credential storage |

## VS Code Extension

### Core

| Technology | Purpose |
|------------|---------|
| TypeScript | Language |
| VS Code API | Extension framework |
| axios | HTTP client |

## Development Tools

### Code Quality

| Tool | Purpose |
|------|---------|
| Ruff | Python linting/formatting |
| ESLint | TypeScript linting |
| Prettier | Code formatting |
| Black | Python formatting |

### Testing

| Tool | Purpose |
|------|---------|
| pytest | Python testing |
| pytest-asyncio | Async test support |
| Vitest | Frontend testing |
| pytest-cov | Coverage reporting |

### Documentation

| Tool | Purpose |
|------|---------|
| Markdown | Documentation format |
| OpenAPI | API documentation |

## Infrastructure

### Deployment

| Option | Purpose |
|--------|---------|
| Docker | Containerization |
| Docker Compose | Local development |
| Kubernetes | Production orchestration |

### Monitoring

| Tool | Purpose |
|------|---------|
| Prometheus | Metrics collection |
| Grafana | Dashboards |
| Sentry | Error tracking |

### CI/CD

| Tool | Purpose |
|------|---------|
| GitHub Actions | CI/CD pipelines |
| pytest | Automated testing |
| Docker Hub | Image registry |

## Version Compatibility Matrix

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Python | 3.11 | 3.12 |
| Node.js | 18 | 20 LTS |
| PostgreSQL | 14 | 16 |
| Redis | 6 | 7 |

## Environment Configuration

### Required Environment Variables

```bash
# Database
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/aexy

# Redis
REDIS_URL=redis://localhost:6379/0

# GitHub App
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GITHUB_WEBHOOK_SECRET=xxx

# LLM
LLM_PROVIDER=claude  # or ollama
ANTHROPIC_API_KEY=xxx  # if using claude
OLLAMA_BASE_URL=http://localhost:11434  # if using ollama

# JWT
JWT_SECRET_KEY=xxx
JWT_ALGORITHM=HS256

# Slack (optional)
SLACK_CLIENT_ID=xxx
SLACK_CLIENT_SECRET=xxx
SLACK_SIGNING_SECRET=xxx
```

## Package Dependencies

### Backend (pyproject.toml)

```toml
[project]
dependencies = [
    "fastapi>=0.100.0",
    "uvicorn[standard]>=0.23.0",
    "sqlalchemy[asyncio]>=2.0.0",
    "asyncpg>=0.28.0",
    "alembic>=1.12.0",
    "pydantic>=2.0.0",
    "pydantic-settings>=2.0.0",
    "python-jose[cryptography]>=3.3.0",
    "httpx>=0.25.0",
    "celery[redis]>=5.3.0",
    "redis>=4.6.0",
    "anthropic>=0.5.0",
    "aiohttp>=3.8.0",
    "apscheduler>=3.10.0",
    "reportlab>=4.0.0",
    "openpyxl>=3.1.0",
    "slack-sdk>=3.23.0",
]
```

### Frontend (package.json)

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "recharts": "^2.10.0",
    "lucide-react": "^0.300.0",
    "clsx": "^2.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "tailwindcss": "^3.4.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0"
  }
}
```
