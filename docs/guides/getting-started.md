# Getting Started with Aexy

## Prerequisites

Before you begin, ensure you have the following installed:

- **Python 3.11+**: Backend runtime
- **Node.js 18+**: Frontend runtime
- **PostgreSQL 14+**: Database
- **Redis 6+**: Cache and queue broker
- **Git**: Version control

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/aexy.git
cd aexy
```

### 2. Set Up Environment Variables

Create a `.env` file in the root directory:

```bash
# Database
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/aexy

# Redis
REDIS_URL=redis://localhost:6379/0

# GitHub App (create at github.com/settings/apps)
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# LLM Provider
LLM_PROVIDER=ollama  # Use ollama for local development
OLLAMA_BASE_URL=http://localhost:11434

# Or use Claude
# LLM_PROVIDER=claude
# ANTHROPIC_API_KEY=your_api_key

# JWT
JWT_SECRET_KEY=your-secret-key-at-least-32-chars
JWT_ALGORITHM=HS256

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

### 3. Set Up the Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -e ".[dev]"

# Create database
createdb aexy

# Run migrations
alembic upgrade head

# Start the server
uvicorn aexy.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. Set Up the Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### 5. Access the Application

- **Frontend**: http://localhost:3000
- **API Docs**: http://localhost:8000/docs
- **API ReDoc**: http://localhost:8000/redoc

## Setting Up GitHub App

1. Go to https://github.com/settings/apps
2. Click "New GitHub App"
3. Fill in the details:
   - **Name**: Aexy (your-org)
   - **Homepage URL**: http://localhost:3000
   - **Callback URL**: http://localhost:8000/api/auth/github/callback
   - **Webhook URL**: http://localhost:8000/api/webhooks/github (use ngrok for local dev)
   - **Permissions**:
     - Repository: Read access
     - Organization: Read access
     - Pull requests: Read access
   - **Events**: Push, Pull request, Pull request review

4. After creation, note down:
   - App ID
   - Client ID
   - Client Secret (generate one)
   - Webhook Secret (set one)

## Setting Up LLM Provider

### Option A: Ollama (Recommended for Development)

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull llama3.2
# or
ollama pull codellama

# Ollama runs automatically on port 11434
```

### Option B: Claude (Production)

1. Get an API key from https://console.anthropic.com
2. Set in `.env`:
   ```bash
   LLM_PROVIDER=claude
   ANTHROPIC_API_KEY=your_api_key
   ```

## Running Background Workers

For full functionality, run the Celery worker:

```bash
cd backend
celery -A aexy.processing.celery_app worker --loglevel=info
```

And the scheduler:

```bash
celery -A aexy.processing.celery_app beat --loglevel=info
```

## Development Workflow

### Running Tests

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test
```

### Code Quality

```bash
# Backend linting
cd backend
ruff check src/
ruff format src/

# Frontend linting
cd frontend
npm run lint
```

### Database Migrations

```bash
cd backend

# Create a new migration
alembic revision --autogenerate -m "Description"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

## Using Docker (Alternative)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down
```

## Next Steps

1. **Connect GitHub**: Log in with GitHub OAuth to connect your repositories
2. **Import Developers**: Use the admin API to import team members
3. **Configure Teams**: Create teams and assign developers
4. **Explore Analytics**: View team skills, productivity, and insights
5. **Set Up Integrations**: Connect Slack, CLI, or VS Code extension

## Troubleshooting

### Common Issues

**Database Connection Failed**
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Create database if missing
createdb aexy
```

**Redis Connection Failed**
```bash
# Check Redis is running
redis-cli ping
```

**LLM Not Responding**
```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Or test Claude
curl -H "x-api-key: $ANTHROPIC_API_KEY" https://api.anthropic.com/v1/messages
```

**Frontend Build Errors**
```bash
# Clear cache and reinstall
rm -rf node_modules .next
npm install
npm run dev
```

## Getting Help

- **Documentation**: `/docs` folder
- **API Reference**: http://localhost:8000/docs
- **Issues**: GitHub Issues
