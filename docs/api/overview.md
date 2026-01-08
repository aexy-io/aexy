# API Overview

## Base URL

```
Production: https://api.aexy.io/api
Development: http://localhost:8000/api
```

## Authentication

### GitHub OAuth

Aexy uses GitHub OAuth 2.0 for user authentication.

```
GET /auth/github/login
    → Redirects to GitHub OAuth
    → Returns to callback with authorization code
    → Exchanges for JWT token
```

### JWT Tokens

All API requests require a JWT token in the Authorization header:

```http
Authorization: Bearer <jwt_token>
```

Token structure:
```json
{
  "sub": "developer_id",
  "exp": 1735689600,
  "iat": 1735603200,
  "github_id": 12345678,
  "github_username": "username"
}
```

### API Keys (CLI/Integrations)

For non-interactive clients, use API keys:

```http
X-API-Key: <api_key>
```

## Response Format

### Success Response

```json
{
  "data": { ... },
  "meta": {
    "request_id": "uuid",
    "timestamp": "2024-12-29T00:00:00Z"
  }
}
```

### Error Response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  },
  "meta": {
    "request_id": "uuid",
    "timestamp": "2024-12-29T00:00:00Z"
  }
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 422 | Validation Error |
| 429 | Rate Limited |
| 500 | Server Error |

## Rate Limiting

| Endpoint Type | Limit |
|---------------|-------|
| Standard | 100 req/min |
| Analytics | 30 req/min |
| LLM-powered | 10 req/min |

Rate limit headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1735689600
```

## Pagination

List endpoints support cursor-based pagination:

```http
GET /developers?limit=20&cursor=<cursor_token>
```

Response includes pagination info:
```json
{
  "data": [...],
  "pagination": {
    "limit": 20,
    "has_more": true,
    "next_cursor": "eyJpZCI6ImFiYzEyMyJ9"
  }
}
```

## Filtering & Sorting

### Filtering

```http
GET /developers?skills=python,typescript&seniority=senior
```

### Sorting

```http
GET /developers?sort=-created_at,name
```

Prefix with `-` for descending order.

## API Endpoints

### Health & Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/ready` | Readiness check |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/github/login` | Start OAuth flow |
| GET | `/auth/github/callback` | OAuth callback |
| GET | `/auth/me` | Current user info |
| POST | `/auth/logout` | Logout |

### Developers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/developers` | List developers |
| GET | `/developers/{id}` | Get developer |
| GET | `/developers/github/{username}` | Get by username |
| GET | `/developers/{id}/profile` | Full profile with analysis |
| GET | `/developers/{id}/skills` | Skill breakdown |
| GET | `/developers/{id}/activity` | Activity history |

### Teams

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/teams` | List teams |
| POST | `/teams` | Create team |
| GET | `/teams/{id}` | Get team |
| PUT | `/teams/{id}` | Update team |
| DELETE | `/teams/{id}` | Delete team |
| GET | `/teams/{id}/skills` | Team skill analysis |
| GET | `/teams/{id}/gaps` | Team skill gaps |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/analytics/heatmap/skills` | Skill heatmap |
| GET | `/analytics/heatmap/activity/{id}` | Activity heatmap |
| POST | `/analytics/productivity` | Productivity trends |
| POST | `/analytics/workload` | Workload distribution |
| POST | `/analytics/collaboration` | Collaboration network |

### Predictions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/predictions/attrition/{id}` | Attrition risk |
| GET | `/predictions/burnout/{id}` | Burnout risk |
| GET | `/predictions/trajectory/{id}` | Performance trajectory |
| POST | `/predictions/team-health` | Team health analysis |
| POST | `/predictions/skill-gaps` | Future skill gaps |

### Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/reports` | List reports |
| POST | `/reports` | Create report |
| GET | `/reports/{id}` | Get report |
| PUT | `/reports/{id}` | Update report |
| DELETE | `/reports/{id}` | Delete report |
| POST | `/reports/{id}/clone` | Clone report |
| GET | `/reports/{id}/data` | Get report data |
| GET | `/reports/templates/list` | List templates |
| POST | `/reports/{id}/schedules` | Schedule report |

### Exports

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/exports` | Create export job |
| GET | `/exports/{id}` | Get export status |
| GET | `/exports/{id}/download` | Download export |
| GET | `/exports/formats` | Available formats |

### Career

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/career/roles` | List career roles |
| GET | `/career/roles/{id}` | Get role details |
| GET | `/career/{id}/comparison` | Compare to role |

### Learning

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/learning/{id}/path` | Get learning path |
| POST | `/learning/{id}/path` | Create learning path |
| PUT | `/learning/{id}/path` | Update path |
| GET | `/learning/{id}/milestones` | Get milestones |
| POST | `/learning/{id}/progress` | Update progress |

### Hiring

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/hiring/gaps` | Analyze team gaps |
| POST | `/hiring/jd` | Generate job description |
| POST | `/hiring/rubric` | Generate interview rubric |
| POST | `/hiring/match` | Match task to developers |

### Slack

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/slack/install` | Start OAuth install |
| GET | `/slack/callback` | OAuth callback |
| POST | `/slack/commands` | Slash commands |
| POST | `/slack/events` | Event webhook |
| POST | `/slack/interactions` | Interactive components |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/webhooks/github` | GitHub webhook |

## WebSocket Endpoints

```
WS /ws/updates
    → Real-time notifications
    → Export completion events
    → Analysis results
```

## OpenAPI Specification

Full OpenAPI 3.0 specification available at:
- `/openapi.json` - JSON format
- `/docs` - Swagger UI
- `/redoc` - ReDoc UI
