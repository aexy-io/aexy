# Aexy Backend

GitHub-Based Developer Profiling & Analytics Platform - Backend API

## Quick Start

```bash
# Install dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Start development server
uvicorn aexy.main:app --reload
```

## Architecture

The backend is built with FastAPI and uses:
- SQLAlchemy for ORM
- PostgreSQL for data storage
- Redis for caching
- Celery for background tasks
- Anthropic/Ollama for LLM-powered analytics
