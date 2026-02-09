# Aexy Project - Claude Code Instructions

## Project Overview
Aexy is an Engineering OS platform with assessment capabilities, LLM integrations, and workflow automation.

## Tech Stack
- **Backend**: Python 3.13, FastAPI, SQLAlchemy (async), Temporal
- **Frontend**: Next.js 14, React, TypeScript, TailwindCSS
- **Database**: PostgreSQL (async via asyncpg)
- **Queue**: Redis (cache, rate limiting), Temporal (workflow engine)
- **LLM Providers**: Claude (Anthropic), Gemini (Google), Ollama (self-hosted)

## Local Development Setup

### Start Services
```bash
docker-compose up -d
```

Services:
- Backend: http://localhost:8000
- Frontend: http://localhost:3000
- Temporal UI: http://localhost:8233
- PostgreSQL: localhost:5432
- Redis: localhost:6379

### Environment Files
- Backend: `backend/.env`
- Frontend: `frontend/.env`

## Running Database Migrations

Use the migration runner script to apply all pending database migrations.

### List Migration Status
```bash
# Via docker (recommended)
docker exec aexy-backend python scripts/run_migrations.py --list

# Locally (requires asyncpg installed)
cd backend && python scripts/run_migrations.py --list
```

### Run All Pending Migrations
```bash
# Via docker
docker exec aexy-backend python scripts/run_migrations.py

# Dry-run first to see what will be executed
docker exec aexy-backend python scripts/run_migrations.py --dry-run
```

### Run Specific Migration
```bash
# Run a specific migration file
docker exec aexy-backend python scripts/run_migrations.py --file migrate_knowledge_graph.sql

# Force re-run (use with caution)
docker exec aexy-backend python scripts/run_migrations.py --file migrate_knowledge_graph.sql --force
```

### Custom Database URL
```bash
# Use custom database URL
docker exec aexy-backend python scripts/run_migrations.py --database-url postgresql://user:pass@host:5432/db
```

The migration runner:
- Tracks applied migrations in `schema_migrations` table
- Detects changed migrations (checksum mismatch)
- Runs migrations in alphabetical order
- Shows execution time for each migration

## Testing LLM Rate Limiting

### 1. Verify Redis Connection
```bash
docker exec aexy-redis redis-cli PING
# Should return: PONG
```

### 2. Check Rate Limit Status
```bash
curl -X GET "http://localhost:8000/api/v1/health/rate-limits" \
  -H "Authorization: Bearer <token>"
```

### 3. Monitor Rate Limit Keys in Redis
```bash
docker exec aexy-redis redis-cli KEYS "llm:ratelimit:*"
```

### 4. View Rate Limit Counts
```bash
# View minute window for gemini
docker exec aexy-redis redis-cli ZCARD "llm:ratelimit:gemini:minute"

# View day window for gemini
docker exec aexy-redis redis-cli ZCARD "llm:ratelimit:gemini:day"
```

### 5. Test Rate Limiting Manually
```python
# In Python shell
from aexy.services.llm_rate_limiter import get_llm_rate_limiter
import asyncio

async def test():
    limiter = get_llm_rate_limiter()

    # Check status
    status = await limiter.get_status("gemini")
    print(f"Remaining: {status.requests_remaining_minute}/min")

    # Make test requests
    for i in range(5):
        result = await limiter.check_rate_limit("gemini")
        if result.allowed:
            await limiter.record_request("gemini", tokens_used=100)
            print(f"Request {i+1}: allowed")
        else:
            print(f"Request {i+1}: blocked - {result.reason}")

asyncio.run(test())
```

### 6. Test Temporal Activity Retry
```bash
# Watch Temporal worker logs
docker logs -f aexy-temporal-worker

# Trigger an analysis task that will hit rate limits
# The activity should auto-retry via Temporal's built-in retry policies
```

### 7. Clear Rate Limit Data (for testing)
```bash
docker exec aexy-redis redis-cli KEYS "llm:ratelimit:*" | xargs -r docker exec -i aexy-redis redis-cli DEL
```

## Configuration

### LLM Rate Limits (Environment Variables)
```bash
# Claude
CLAUDE_REQUESTS_PER_MINUTE=60
CLAUDE_REQUESTS_PER_DAY=-1  # unlimited
CLAUDE_TOKENS_PER_MINUTE=100000

# Gemini
GEMINI_REQUESTS_PER_MINUTE=60
GEMINI_REQUESTS_PER_DAY=1500

# Ollama (self-hosted, no limits)
OLLAMA_REQUESTS_PER_MINUTE=-1
OLLAMA_REQUESTS_PER_DAY=-1

# Global
RATE_LIMIT_ENABLED=true
```

## Key Files

### LLM System
- `backend/src/aexy/llm/gateway.py` - Unified LLM gateway
- `backend/src/aexy/llm/base.py` - Base classes and errors
- `backend/src/aexy/llm/claude_provider.py` - Claude integration
- `backend/src/aexy/llm/gemini_provider.py` - Gemini integration

### Rate Limiting
- `backend/src/aexy/services/llm_rate_limiter.py` - Rate limiter service
- `backend/src/aexy/processing/rate_limited_task.py` - Rate limiting utilities

### Configuration
- `backend/src/aexy/core/config.py` - App settings including rate limits

### Temporal (Background Processing)
- `backend/src/aexy/temporal/dispatch.py` - Fire-and-forget dispatch (replaces Celery .delay())
- `backend/src/aexy/temporal/worker.py` - Temporal worker configuration
- `backend/src/aexy/temporal/schedules.py` - Periodic schedules (replaces Celery Beat)
- `backend/src/aexy/temporal/activities/` - Activity implementations
- `backend/src/aexy/temporal/workflows/` - Workflow definitions
- `backend/src/aexy/temporal/task_queues.py` - Task queue constants

### AI Agents
- `backend/src/aexy/models/agent.py` - CRMAgent SQLAlchemy model
- `backend/src/aexy/schemas/agent.py` - Agent Pydantic schemas
- `backend/src/aexy/api/agents.py` - Agent API endpoints
- `backend/src/aexy/services/agent_service.py` - Agent business logic
- `frontend/src/app/(app)/settings/agents/` - Agent management UI
- `frontend/src/components/agents/` - Agent UI components
- `frontend/src/hooks/useAgents.ts` - Agent React hooks

## Common Issues

### Rate Limit Hit (429 Error)
- Check Redis for current counts
- Wait for the reset window (1 minute for per-minute limits)
- Or clear rate limit data for testing

### Temporal Activity Not Retrying
- Check retry policy in `temporal/dispatch.py` ACTIVITY_CONFIG
- Ensure `LLMRateLimitError` is being raised (triggers Temporal retry)
- Check Temporal UI for workflow execution history

### Redis Connection Issues
- Ensure Redis container is running: `docker-compose ps`
- Check Redis URL in environment: `REDIS_URL=redis://localhost:6379/0`

## Generating Test Tokens for API Testing

When testing authenticated API endpoints, you need a valid JWT token. Use the test token generator script:

### Prerequisites
- At least one developer account must exist (sign in via web app first)
- Backend services must be running

### Generate a Test Token

```bash
# List available developers
cd backend && python scripts/generate_test_token.py --list

# Generate token for first developer (most common)
cd backend && python scripts/generate_test_token.py --first

# Generate token for specific developer ID
cd backend && python scripts/generate_test_token.py <developer-uuid>

# Generate token with custom expiration (default: 30 days)
cd backend && python scripts/generate_test_token.py --first --days 7
```

### Using the Token

```bash
# Set as environment variable
export AEXY_TEST_TOKEN="<generated-token>"

# Test authenticated endpoint
curl -H "Authorization: Bearer $AEXY_TEST_TOKEN" \
  http://localhost:8000/api/v1/developers/me

# Test with specific endpoint
curl -H "Authorization: Bearer $AEXY_TEST_TOKEN" \
  "http://localhost:8000/api/v1/workspaces/<workspace-id>/knowledge-graph/statistics"
```

### Quick One-Liner (for scripts)
```bash
# Generate and export token in one command
export AEXY_TEST_TOKEN=$(cd backend && python scripts/generate_test_token.py --first 2>/dev/null | grep -A1 "Token:" | tail -1)
```

### Token Details
- Algorithm: HS256
- Default expiration: 30 days
- Secret key: Uses `SECRET_KEY` from backend/.env (default: `dev-secret-key-change-in-production`)

## Browser Testing with Playwright MCP

For testing the frontend UI with authentication using Playwright MCP tools.

### 1. Generate a Test Token

```bash
# Generate token via Docker (recommended - has all dependencies)
docker exec aexy-backend python scripts/generate_test_token.py --first
```

This will output a JWT token that you can use for authentication.

### 2. Set Token in Browser via Playwright

The frontend stores the auth token in localStorage under the key `token`. Use the `browser_evaluate` tool to set it:

```javascript
// Set token in localStorage
localStorage.setItem('token', '<your-jwt-token>');
```

### 3. Complete Testing Workflow

1. **Navigate to localhost:3000** using `browser_navigate`
2. **Set the token** using `browser_evaluate`:
   ```javascript
   () => {
     localStorage.setItem('token', '<token>');
     return 'Token set';
   }
   ```
3. **Navigate to authenticated page** (e.g., `/settings/agents`)
4. **Use `browser_snapshot`** to get page structure for interaction
5. **Use `browser_take_screenshot`** for visual verification

### Example Session

```
# 1. Navigate to app
browser_navigate: http://localhost:3000

# 2. Set auth token
browser_evaluate: () => { localStorage.setItem('token', 'eyJhbGci...'); return 'done'; }

# 3. Navigate to protected page
browser_navigate: http://localhost:3000/settings/agents

# 4. Wait for page load
browser_wait_for: { time: 2 }

# 5. Take screenshot to verify
browser_take_screenshot: { type: 'png' }

# 6. Get snapshot for interactions
browser_snapshot
```

### Notes
- The token key is `token` (not `auth_token`)
- Tokens expire after 30 days by default
- Some features require a workspace to be selected
- Use `browser_console_messages` with level `error` to debug issues

## AI Agents API

AI Agents are intelligent automation assistants that handle tasks like email responses, CRM updates, and workflow automation.

### List Agents
```bash
curl -H "Authorization: Bearer $AEXY_TEST_TOKEN" \
  "http://localhost:8000/api/v1/workspaces/<workspace-id>/agents"
```

### Create Agent
```bash
curl -X POST -H "Authorization: Bearer $AEXY_TEST_TOKEN" \
  -H "Content-Type: application/json" \
  "http://localhost:8000/api/v1/workspaces/<workspace-id>/agents" \
  -d '{
    "name": "Support Bot",
    "agent_type": "support",
    "description": "Handles customer inquiries",
    "mention_handle": "support",
    "llm_provider": "claude",
    "temperature": 0.7,
    "tools": ["reply", "escalate", "search_contacts"],
    "confidence_threshold": 0.7,
    "require_approval_below": 0.5
  }'
```

### Check Handle Availability
```bash
curl -H "Authorization: Bearer $AEXY_TEST_TOKEN" \
  "http://localhost:8000/api/v1/workspaces/<workspace-id>/agents/check-handle?handle=support"
```

### Get Agent Metrics
```bash
curl -H "Authorization: Bearer $AEXY_TEST_TOKEN" \
  "http://localhost:8000/api/v1/workspaces/<workspace-id>/agents/<agent-id>/metrics"
```

### Agent Configuration Fields
- `name` - Display name
- `agent_type` - support, sales, scheduling, custom
- `mention_handle` - @handle trigger (must be unique per workspace)
- `llm_provider` - claude or gemini
- `temperature` - 0.0 to 1.0
- `tools` - Array of tool names (reply, escalate, search_contacts, etc.)
- `confidence_threshold` - Minimum confidence for auto-response (default: 0.7)
- `require_approval_below` - Require human approval below this (default: 0.5)
- `working_hours` - JSON config for active hours
- `system_prompt` - Agent persona and instructions
