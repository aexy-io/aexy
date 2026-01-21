# Aexy Project - Claude Code Instructions

## Project Overview
Aexy is an Engineering OS platform with assessment capabilities, LLM integrations, and workflow automation.

## Tech Stack
- **Backend**: Python 3.13, FastAPI, SQLAlchemy (async), Celery
- **Frontend**: Next.js 14, React, TypeScript, TailwindCSS
- **Database**: PostgreSQL (async via asyncpg)
- **Queue**: Redis (Celery broker)
- **LLM Providers**: Claude (Anthropic), Gemini (Google), Ollama (self-hosted)

## Local Development Setup

### Start Services
```bash
docker-compose up -d
```

Services:
- Backend: http://localhost:8000
- Frontend: http://localhost:3000
- Flower (Celery monitor): http://localhost:5555
- PostgreSQL: localhost:5432
- Redis: localhost:6379

### Environment Files
- Backend: `backend/.env`
- Frontend: `frontend/.env`

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

### 6. Test Celery Task Retry
```bash
# Watch Celery logs
docker logs -f aexy-celery-worker

# Trigger an analysis task that will hit rate limits
# The task should auto-retry with the wait time from the rate limiter
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
- `backend/src/aexy/processing/rate_limited_task.py` - Celery task utilities

### Configuration
- `backend/src/aexy/core/config.py` - App settings including rate limits

### Celery Tasks
- `backend/src/aexy/processing/celery_app.py` - Celery configuration
- `backend/src/aexy/processing/tasks.py` - Analysis tasks

## Common Issues

### Rate Limit Hit (429 Error)
- Check Redis for current counts
- Wait for the reset window (1 minute for per-minute limits)
- Or clear rate limit data for testing

### Celery Task Not Retrying
- Ensure task uses `RateLimitedTask` as base class
- Check that `LLMRateLimitError` is being raised
- Verify `wait_seconds` is being passed to retry

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
