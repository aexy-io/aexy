# System Architecture

## Overview

Aexy is a multi-tier application designed for scalability, maintainability, and extensibility. The architecture follows a microservices-inspired approach while maintaining simplicity for initial deployment.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Next.js    │  │   VS Code    │  │     CLI      │  │    Slack     │    │
│  │   Frontend   │  │  Extension   │  │    Tool      │  │     Bot      │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
└─────────┼─────────────────┼─────────────────┼─────────────────┼────────────┘
          │                 │                 │                 │
          ▼                 ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API Gateway                                     │
│                         FastAPI Application                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         REST API Endpoints                           │   │
│  │  /auth  /developers  /teams  /analytics  /predictions  /slack       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
          ▼                           ▼                           ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────────┐
│   Service Layer     │  │   Processing Layer   │  │     LLM Gateway         │
│  ┌───────────────┐  │  │  ┌───────────────┐  │  │  ┌─────────────────┐    │
│  │ ProfileAnalyzer│  │  │  │ Celery Queue  │  │  │  │ Claude Provider │    │
│  │ TeamService    │  │  │  │ Background    │  │  │  │ Ollama Provider │    │
│  │ TaskMatcher    │  │  │  │ Tasks         │  │  │  └─────────────────┘    │
│  │ Analytics      │  │  │  └───────────────┘  │  └─────────────────────────┘
│  │ Predictions    │  │  │  ┌───────────────┐  │
│  └───────────────┘  │  │  │ Scheduler     │  │
└─────────┬───────────┘  │  │ (APScheduler) │  │
          │              │  └───────────────┘  │
          │              └─────────┬───────────┘
          │                        │
          ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Data Layer                                      │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │    PostgreSQL       │  │       Redis         │  │    File Storage     │ │
│  │  - Developers       │  │  - Analysis Cache   │  │  - Export Files     │ │
│  │  - Activities       │  │  - Session Store    │  │  - Reports          │ │
│  │  - Teams            │  │  - Rate Limiting    │  │                     │ │
│  │  - Reports          │  │                     │  │                     │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          External Integrations                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   GitHub     │  │    Jira      │  │    Linear    │  │    Slack     │    │
│  │   API        │  │    API       │  │    API       │  │    API       │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Client Layer

#### Next.js Frontend
- **Purpose**: Primary web interface for managers and developers
- **Technology**: Next.js 14, React, TypeScript, TailwindCSS
- **Features**: Dashboard, analytics, reports, learning paths

#### VS Code Extension
- **Purpose**: In-IDE developer insights
- **Technology**: TypeScript, VS Code Extension API
- **Features**: Profile view, task matching, team insights

#### CLI Tool
- **Purpose**: Command-line interface for power users
- **Technology**: Python, Click, Rich
- **Features**: Profile queries, team analytics, exports

#### Slack Bot
- **Purpose**: Team collaboration and notifications
- **Technology**: Slack API, OAuth 2.0
- **Features**: Slash commands, notifications, alerts

### 2. API Gateway

#### FastAPI Application
- **Purpose**: Central API for all clients
- **Technology**: FastAPI, Pydantic, SQLAlchemy
- **Authentication**: JWT tokens, OAuth 2.0 (GitHub)
- **Rate Limiting**: Redis-based

### 3. Service Layer

| Service | Responsibility |
|---------|----------------|
| `ProfileAnalyzer` | Skill detection, proficiency scoring |
| `TeamService` | Team analytics, bus factor, velocity |
| `TaskMatcher` | Task-to-developer matching |
| `AnalyticsDashboard` | Heatmaps, productivity metrics |
| `PredictiveAnalytics` | Attrition, burnout, trajectory |
| `CareerProgression` | Learning paths, gap analysis |
| `HiringIntelligence` | JD generation, rubrics |

### 4. Processing Layer

#### Celery Queue
- **Purpose**: Background job processing
- **Broker**: Redis
- **Tasks**: Profile sync, batch analysis, exports

#### Scheduler
- **Purpose**: Periodic tasks
- **Technology**: APScheduler
- **Jobs**: Nightly profile rebuild, cache cleanup

### 5. LLM Gateway

- **Abstraction**: Provider-agnostic interface
- **Providers**: Claude (Anthropic), Ollama (local)
- **Caching**: Redis-based with TTL
- **Prompts**: Structured templates for each analysis type

### 6. Data Layer

#### PostgreSQL
- Primary data store
- SQLAlchemy ORM with async support
- Alembic migrations

#### Redis
- Analysis cache
- Session storage
- Rate limiting
- Celery broker

#### File Storage
- Export files (PDF, CSV, XLSX)
- Local filesystem or S3-compatible

## Data Flow

### GitHub Webhook Flow

```
GitHub Event → Webhook Endpoint → Event Validation →
    ↓
Ingestion Service → Parse Event → Store Raw Data →
    ↓
Queue Profile Sync → ProfileAnalyzer → Update Developer Profile
```

### Task Matching Flow

```
Task Description → Extract Signals (LLM) →
    ↓
Load Candidate Developers → Calculate Match Scores →
    ↓
Rank by Score → Apply Filters → Return Matches
```

### Analytics Query Flow

```
Client Request → API Endpoint → Service Layer →
    ↓
Check Cache → Cache Miss? → Database Query →
    ↓
LLM Analysis (if needed) → Cache Result → Return Response
```

## Scalability Considerations

### Horizontal Scaling
- Stateless API servers behind load balancer
- Multiple Celery workers for background processing
- Redis cluster for caching

### Database Scaling
- Read replicas for analytics queries
- Connection pooling
- Query optimization with indexes

### LLM Rate Limiting
- Request queuing
- Provider fallback (Claude → Ollama)
- Caching aggressive for expensive operations

## Security Architecture

### Authentication
- GitHub OAuth 2.0 for user authentication
- JWT tokens for API access
- API keys for CLI/integrations

### Authorization
- Role-based access control (RBAC)
- Team-level data isolation
- Developer privacy controls

### Data Protection
- TLS 1.3 for transit encryption
- AES-256 for secrets at rest
- PII anonymization for cross-team comparisons

## Monitoring & Observability

### Logging
- Structured JSON logs
- Request tracing
- Error tracking

### Metrics
- API latency
- LLM usage statistics
- Cache hit rates
- Queue depths

### Alerting
- Service health checks
- Error rate thresholds
- Resource utilization
