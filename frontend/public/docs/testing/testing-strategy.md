# Testing Strategy

## Overview

Aexy follows a comprehensive testing approach using Test-Driven Development (TDD) principles, focusing on reliability, maintainability, and developer experience.

## Testing Pyramid

```
                    ┌─────────────┐
                    │    E2E      │  5%
                    │   Tests     │
                    ├─────────────┤
                    │ Integration │  15%
                    │    Tests    │
            ┌───────┴─────────────┴───────┐
            │       Unit Tests            │  80%
            └─────────────────────────────┘
```

## Test Categories

### 1. Unit Tests

**Purpose:** Test individual functions, methods, and classes in isolation.

**Characteristics:**
- Fast execution (< 100ms each)
- No external dependencies
- Mocked database/API calls
- High code coverage target (80%+)

**Location:** `backend/tests/unit/`

**Example:**
```python
# tests/unit/test_profile_analyzer.py
import pytest
from aexy.services.profile_analyzer import ProfileAnalyzer

def test_detect_language_from_extension():
    analyzer = ProfileAnalyzer()
    assert analyzer.detect_language_from_extension("main.py") == "Python"
    assert analyzer.detect_language_from_extension("app.tsx") == "TypeScript"
    assert analyzer.detect_language_from_extension("unknown.xyz") is None
```

### 2. Integration Tests

**Purpose:** Test interactions between components and external services.

**Characteristics:**
- Uses test database
- Real database queries
- Mocked external APIs (GitHub, LLM)
- Tests API contracts

**Location:** `backend/tests/integration/`

**Example:**
```python
# tests/integration/test_api_developers.py
import pytest
from httpx import AsyncClient
from aexy.main import app

@pytest.mark.asyncio
async def test_list_developers(test_client: AsyncClient, test_developer):
    response = await test_client.get("/api/developers")
    assert response.status_code == 200
    assert len(response.json()) >= 1
```

### 3. End-to-End Tests

**Purpose:** Test complete user flows from frontend to database.

**Characteristics:**
- Browser automation (Playwright)
- Real or staging environment
- Tests critical user journeys
- Slower execution

**Location:** `frontend/tests/e2e/`

**Example:**
```typescript
// tests/e2e/login.spec.ts
import { test, expect } from '@playwright/test';

test('user can login with GitHub', async ({ page }) => {
  await page.goto('/');
  await page.click('text=Sign in with GitHub');
  // ... OAuth flow
  await expect(page.locator('h1')).toHaveText('Dashboard');
});
```

## Test Fixtures

### Database Fixtures

```python
# conftest.py
import pytest
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

@pytest.fixture
async def test_db():
    """Create a test database session."""
    engine = create_async_engine("postgresql+asyncpg://test:test@localhost/aexy_test")
    async with AsyncSession(engine) as session:
        yield session
        await session.rollback()

@pytest.fixture
async def test_developer(test_db):
    """Create a test developer."""
    developer = Developer(
        github_id=12345,
        github_username="testuser",
        name="Test User",
        skills=["Python", "TypeScript"]
    )
    test_db.add(developer)
    await test_db.commit()
    return developer
```

### API Client Fixtures

```python
@pytest.fixture
async def test_client():
    """Create a test HTTP client."""
    from aexy.main import app
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client
```

### LLM Mock Fixtures

```python
@pytest.fixture
def mock_llm_gateway(mocker):
    """Mock the LLM gateway for tests."""
    mock = mocker.patch("aexy.llm.gateway.LLMGateway")
    mock.return_value.analyze.return_value = {
        "skills": ["Python"],
        "proficiency": 80,
        "reasoning": "Test analysis"
    }
    return mock
```

## Mocking Strategies

### External APIs

```python
# Mock GitHub API
@pytest.fixture
def mock_github_api(respx_mock):
    respx_mock.get("https://api.github.com/users/testuser").respond(
        json={"login": "testuser", "id": 12345}
    )
```

### Database

```python
# Use in-memory SQLite for fast tests
@pytest.fixture
def in_memory_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    yield engine
```

### LLM Providers

```python
# Mock Claude responses
@pytest.fixture
def mock_claude(mocker):
    return mocker.patch(
        "anthropic.Anthropic.messages.create",
        return_value=MockMessage(content="Test response")
    )
```

## Test Data

### Factory Pattern

```python
# tests/factories.py
import factory
from aexy.models import Developer

class DeveloperFactory(factory.Factory):
    class Meta:
        model = Developer

    github_id = factory.Sequence(lambda n: n)
    github_username = factory.Faker('user_name')
    name = factory.Faker('name')
    skills = factory.List(['Python', 'TypeScript'])
```

### Seed Data

```python
# tests/seed_data.py
SAMPLE_COMMITS = [
    {
        "sha": "abc123",
        "message": "Add authentication",
        "files": [{"path": "auth.py", "additions": 100}]
    }
]

SAMPLE_DEVELOPERS = [
    {
        "github_username": "senior_dev",
        "skills": ["Python", "Go", "Kubernetes"],
        "seniority_level": "senior"
    }
]
```

## Coverage Requirements

| Component | Minimum | Target |
|-----------|---------|--------|
| Services | 80% | 90% |
| Models | 70% | 85% |
| API Endpoints | 75% | 85% |
| Utilities | 90% | 95% |
| **Overall** | **80%** | **85%** |

### Coverage Report

```bash
# Generate coverage report
pytest --cov=aexy --cov-report=html --cov-report=term-missing

# View HTML report
open htmlcov/index.html
```

## Testing Best Practices

### 1. Arrange-Act-Assert Pattern

```python
def test_calculate_proficiency_score():
    # Arrange
    analyzer = ProfileAnalyzer()
    commits = [Commit(additions=100)]

    # Act
    score = analyzer.calculate_proficiency_score(commits)

    # Assert
    assert 0 <= score <= 100
    assert score > 0
```

### 2. Test Naming Convention

```python
def test_<method>_<scenario>_<expected_behavior>():
    pass

# Examples:
def test_create_developer_with_valid_data_returns_developer():
    pass

def test_create_developer_with_duplicate_github_id_raises_error():
    pass
```

### 3. One Assertion Focus

```python
# Good: Single focus
def test_developer_seniority_is_senior():
    dev = DeveloperFactory(seniority_score=80)
    assert dev.seniority_level == "senior"

# Avoid: Multiple unrelated assertions
def test_developer_everything():
    dev = DeveloperFactory()
    assert dev.name is not None
    assert dev.skills == []
    assert dev.created_at < now()
```

### 4. Test Independence

```python
# Each test should be independent
@pytest.fixture
def fresh_developer():
    """Create a new developer for each test."""
    return DeveloperFactory()

def test_update_skills(fresh_developer):
    fresh_developer.skills = ["Python"]
    assert "Python" in fresh_developer.skills

def test_default_skills(fresh_developer):
    # Not affected by previous test
    assert fresh_developer.skills == []
```

## Continuous Integration

### Pre-commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: pytest
        name: pytest
        entry: pytest tests/unit -x
        language: system
        pass_filenames: false
```

### GitHub Actions

```yaml
# .github/workflows/test.yml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: aexy_test
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install -e ".[dev]"

      - name: Run tests
        run: pytest --cov=aexy --cov-fail-under=80

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Performance Testing

### Load Testing with Locust

```python
# locustfile.py
from locust import HttpUser, task, between

class AexyUser(HttpUser):
    wait_time = between(1, 5)

    @task
    def list_developers(self):
        self.client.get("/api/developers")

    @task(3)
    def get_developer_profile(self):
        self.client.get("/api/developers/1/profile")
```

### Benchmark Tests

```python
import pytest

@pytest.mark.benchmark
def test_profile_analysis_performance(benchmark, sample_commits):
    analyzer = ProfileAnalyzer()
    result = benchmark(analyzer.analyze_commits, sample_commits)
    assert result is not None
```

## Debugging Tests

### Verbose Output

```bash
pytest -v -s tests/unit/test_profile_analyzer.py
```

### Drop into Debugger

```bash
pytest --pdb tests/unit/test_failing.py
```

### Show Locals on Failure

```bash
pytest -l tests/
```

## Test Documentation

Each test file should include:

```python
"""
Tests for ProfileAnalyzer service.

These tests verify:
- Language detection from file extensions
- Framework detection from imports/patterns
- Proficiency scoring algorithms
- Seniority calculation

Fixtures required:
- sample_commits: List of mock commit objects
- mock_llm_gateway: Mocked LLM for analysis
"""
```
