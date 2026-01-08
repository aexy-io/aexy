# LLM Integration Architecture

## Overview

Aexy uses a provider-agnostic LLM abstraction layer that supports multiple AI providers, enabling flexibility between cloud and local models.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Application Layer                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │ ProfileAnalyzer │  │  TaskMatcher    │  │ PredictiveAnaly.│              │
│  │  (code analysis)│  │ (task matching) │  │ (attrition/burn)│              │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘              │
│           │                    │                    │                        │
│           └────────────────────┼────────────────────┘                        │
│                                ▼                                             │
│                    ┌───────────────────────┐                                 │
│                    │      LLM Gateway      │                                 │
│                    │   (Provider Router)   │                                 │
│                    └───────────┬───────────┘                                 │
│                                │                                             │
│           ┌────────────────────┼────────────────────┐                        │
│           ▼                    ▼                    ▼                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │ Claude Provider │  │ Ollama Provider │  │ Future Provider │              │
│  │  (Anthropic)    │  │   (Local LLM)   │  │  (OpenAI, etc.) │              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │    Analysis Cache     │
                    │   (Redis + Memory)    │
                    └───────────────────────┘
```

## Components

### LLM Gateway (`llm/gateway.py`)

Central router that manages provider selection and analysis execution.

```python
class LLMGateway:
    """Gateway for LLM-powered analysis."""

    def __init__(self, provider: str = None):
        self.provider_name = provider or settings.LLM_PROVIDER
        self.provider = self._create_provider()
        self.cache = AnalysisCache()

    async def analyze(
        self,
        analysis_type: AnalysisType,
        content: str,
        context: dict = None,
        use_cache: bool = True,
    ) -> AnalysisResult:
        """Execute analysis with caching."""
        if use_cache:
            cached = await self.cache.get(analysis_type, content)
            if cached:
                return cached

        result = await self.provider.analyze(analysis_type, content, context)

        if use_cache:
            await self.cache.set(analysis_type, content, result)

        return result
```

### Base Provider (`llm/base.py`)

Abstract interface that all providers must implement.

```python
class BaseLLMProvider(ABC):
    """Abstract base for LLM providers."""

    @abstractmethod
    async def analyze(
        self,
        analysis_type: AnalysisType,
        content: str,
        context: dict | None = None,
    ) -> AnalysisResult:
        """Perform analysis using the LLM."""
        pass

    @abstractmethod
    async def is_available(self) -> bool:
        """Check if the provider is available."""
        pass
```

### Claude Provider (`llm/claude_provider.py`)

Anthropic Claude integration for production use.

```python
class ClaudeProvider(BaseLLMProvider):
    """Claude (Anthropic) LLM provider."""

    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.model = settings.CLAUDE_MODEL or "claude-3-5-sonnet-20241022"

    async def analyze(self, analysis_type, content, context=None):
        prompt = self._build_prompt(analysis_type, content, context)

        response = await self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            messages=[
                {"role": "system", "content": self._get_system_prompt(analysis_type)},
                {"role": "user", "content": prompt}
            ]
        )

        return self._parse_response(response, analysis_type)
```

### Ollama Provider (`llm/ollama_provider.py`)

Local LLM support via Ollama for development and privacy.

```python
class OllamaProvider(BaseLLMProvider):
    """Ollama local LLM provider."""

    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL or "http://localhost:11434"
        self.model = settings.OLLAMA_MODEL or "llama3.2"

    async def analyze(self, analysis_type, content, context=None):
        prompt = self._build_prompt(analysis_type, content, context)

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                }
            )

        return self._parse_response(response.json(), analysis_type)
```

## Analysis Types

```python
class AnalysisType(str, Enum):
    """Types of LLM analysis available."""

    # Code Analysis
    CODE_QUALITY = "code_quality"
    CODE_COMPLEXITY = "code_complexity"
    SKILL_EXTRACTION = "skill_extraction"

    # Developer Analysis
    DEVELOPER_PROFILE = "developer_profile"
    SOFT_SKILLS = "soft_skills"
    GROWTH_TRAJECTORY = "growth_trajectory"

    # Task Analysis
    TASK_SIGNALS = "task_signals"
    TASK_MATCHING = "task_matching"

    # Predictive Analysis
    ATTRITION_RISK = "attrition_risk"
    BURNOUT_RISK = "burnout_risk"
    PERFORMANCE_TRAJECTORY = "performance_trajectory"
    TEAM_HEALTH = "team_health"

    # Career Analysis
    LEARNING_PATH = "learning_path"
    JOB_DESCRIPTION = "job_description"
    INTERVIEW_RUBRIC = "interview_rubric"
```

## Prompt Templates

### System Prompts

```python
# llm/prompts.py

SYSTEM_PROMPTS = {
    AnalysisType.SKILL_EXTRACTION: """
You are an expert software engineer analyzing code to identify technical skills.
Focus on:
- Programming languages used
- Frameworks and libraries
- Design patterns applied
- Domain expertise demonstrated
Output JSON with structured skill data.
""",

    AnalysisType.ATTRITION_RISK: """
You are an expert organizational psychologist analyzing developer engagement patterns.
Identify potential attrition risk indicators based on:
- Activity level changes
- Collaboration patterns
- Work hour distributions
- Code quality trends
Output structured risk assessment with factors and recommendations.
""",
}
```

### User Prompts

```python
def build_skill_extraction_prompt(code_sample: str, file_path: str) -> str:
    return f"""
Analyze the following code and extract technical skills demonstrated.

File: {file_path}
```
{code_sample}
```

Extract:
1. Primary programming language
2. Frameworks/libraries used
3. Design patterns applied
4. Complexity level (1-10)
5. Code quality indicators

Output JSON:
{{
    "language": "string",
    "frameworks": ["string"],
    "patterns": ["string"],
    "complexity": number,
    "quality_indicators": ["string"]
}}
"""
```

## Caching Strategy

### Cache Configuration

```python
class AnalysisCacheConfig:
    """Cache configuration for different analysis types."""

    TTL_MAPPING = {
        AnalysisType.CODE_QUALITY: 86400,      # 24 hours
        AnalysisType.SKILL_EXTRACTION: 604800,  # 7 days
        AnalysisType.ATTRITION_RISK: 3600,      # 1 hour
        AnalysisType.TEAM_HEALTH: 3600,         # 1 hour
    }

    @classmethod
    def get_ttl(cls, analysis_type: AnalysisType) -> int:
        return cls.TTL_MAPPING.get(analysis_type, 3600)
```

### Cache Implementation

```python
class AnalysisCache:
    """Multi-layer cache for LLM analysis results."""

    def __init__(self):
        self.redis = Redis.from_url(settings.REDIS_URL)
        self.memory = TTLCache(maxsize=1000, ttl=300)

    async def get(self, analysis_type: AnalysisType, content: str) -> dict | None:
        key = self._build_key(analysis_type, content)

        # Check memory cache first
        if key in self.memory:
            return self.memory[key]

        # Check Redis
        cached = await self.redis.get(key)
        if cached:
            result = json.loads(cached)
            self.memory[key] = result  # Populate memory cache
            return result

        return None

    async def set(self, analysis_type: AnalysisType, content: str, result: dict):
        key = self._build_key(analysis_type, content)
        ttl = AnalysisCacheConfig.get_ttl(analysis_type)

        # Set in both caches
        self.memory[key] = result
        await self.redis.setex(key, ttl, json.dumps(result))
```

## Rate Limiting

### Provider Limits

| Provider | Requests/min | Tokens/min |
|----------|--------------|------------|
| Claude | 50 | 100,000 |
| Ollama | Unlimited | N/A |

### Rate Limiter

```python
class LLMRateLimiter:
    """Rate limiter for LLM API calls."""

    def __init__(self, requests_per_minute: int = 50):
        self.limiter = AsyncLimiter(requests_per_minute, 60)

    async def acquire(self):
        async with self.limiter:
            return True
```

## Error Handling

### Retry Strategy

```python
class LLMRetryConfig:
    MAX_RETRIES = 3
    BACKOFF_FACTOR = 2
    RETRYABLE_ERRORS = [
        "rate_limit_exceeded",
        "overloaded",
        "timeout",
    ]

async def retry_with_backoff(func, *args, **kwargs):
    for attempt in range(LLMRetryConfig.MAX_RETRIES):
        try:
            return await func(*args, **kwargs)
        except LLMError as e:
            if e.code not in LLMRetryConfig.RETRYABLE_ERRORS:
                raise
            if attempt == LLMRetryConfig.MAX_RETRIES - 1:
                raise
            await asyncio.sleep(LLMRetryConfig.BACKOFF_FACTOR ** attempt)
```

### Fallback Strategy

```python
class LLMGateway:
    async def analyze_with_fallback(self, analysis_type, content, context=None):
        """Try primary provider, fall back to secondary."""
        providers = [self.primary_provider, self.fallback_provider]

        for provider in providers:
            try:
                if await provider.is_available():
                    return await provider.analyze(analysis_type, content, context)
            except LLMError:
                continue

        raise LLMUnavailableError("All LLM providers unavailable")
```

## Usage Examples

### Code Analysis

```python
gateway = LLMGateway()

result = await gateway.analyze(
    AnalysisType.SKILL_EXTRACTION,
    content=code_sample,
    context={"file_path": "auth/oauth.py"}
)

print(result.skills)  # ["Python", "OAuth", "JWT"]
print(result.complexity)  # 7
```

### Predictive Analysis

```python
result = await gateway.analyze(
    AnalysisType.ATTRITION_RISK,
    content=json.dumps(activity_data),
    context={
        "developer_id": "uuid",
        "baseline_metrics": baseline_data,
    }
)

print(result.risk_score)  # 0.45
print(result.factors)  # [{"factor": "declining_activity", "weight": 0.3}]
print(result.recommendations)  # ["Schedule 1:1 meeting"]
```

## Configuration

### Environment Variables

```bash
# LLM Provider Selection
LLM_PROVIDER=claude  # or ollama

# Claude Configuration
ANTHROPIC_API_KEY=sk-ant-xxx
CLAUDE_MODEL=claude-3-5-sonnet-20241022

# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Cache Configuration
LLM_CACHE_TTL=3600
LLM_CACHE_ENABLED=true
```

### Runtime Configuration

```python
# Switch provider at runtime
gateway = LLMGateway(provider="ollama")

# Disable caching for specific call
result = await gateway.analyze(
    AnalysisType.ATTRITION_RISK,
    content=data,
    use_cache=False
)
```

## Monitoring

### Metrics Collected

- Request count per provider
- Response latency (p50, p95, p99)
- Token usage
- Cache hit rate
- Error rate by type

### Logging

```python
logger.info(
    "LLM analysis completed",
    extra={
        "provider": "claude",
        "analysis_type": "skill_extraction",
        "latency_ms": 450,
        "tokens_used": 1250,
        "cache_hit": False,
    }
)
```
