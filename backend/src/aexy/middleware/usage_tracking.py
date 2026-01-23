"""Usage tracking middleware for API call metering."""

import logging
import time
from typing import Callable

import redis.asyncio as redis
from fastapi import Request, Response
from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


# Paths to skip tracking (no auth required or internal)
SKIP_PATHS = [
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/api/v1/health",
    "/api/v1/auth",
    "/api/v1/public",
]


class UsageTrackingMiddleware(BaseHTTPMiddleware):
    """Middleware to track API calls per developer for billing."""

    def __init__(
        self,
        app,
        redis_url: str,
        secret_key: str,
        algorithm: str = "HS256",
    ):
        super().__init__(app)
        self.redis_url = redis_url
        self.secret_key = secret_key
        self.algorithm = algorithm
        self._redis: redis.Redis | None = None

    async def get_redis(self) -> redis.Redis:
        """Get or create Redis connection."""
        if self._redis is None:
            self._redis = redis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
        return self._redis

    def should_skip(self, path: str) -> bool:
        """Check if this path should be skipped from tracking."""
        for skip_path in SKIP_PATHS:
            if path.startswith(skip_path):
                return True
        return False

    def extract_developer_id(self, request: Request) -> str | None:
        """Extract developer ID from JWT token in Authorization header."""
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return None

        token = auth_header[7:]  # Remove "Bearer " prefix

        try:
            payload = jwt.decode(
                token,
                self.secret_key,
                algorithms=[self.algorithm],
            )
            return payload.get("sub")
        except JWTError:
            return None

    async def record_api_call(
        self,
        developer_id: str,
        endpoint: str,
        method: str,
        status_code: int,
    ) -> None:
        """Record an API call to Redis for metering."""
        try:
            redis_client = await self.get_redis()
            now = time.time()

            # Keys for different time windows
            minute_key = f"api:usage:{developer_id}:minute"
            day_key = f"api:usage:{developer_id}:day"

            # Pipeline for efficiency
            pipe = redis_client.pipeline()

            # Add to minute window (60 second expiry)
            pipe.zadd(minute_key, {f"{now}:{endpoint}:{method}": now})
            pipe.zremrangebyscore(minute_key, 0, now - 60)
            pipe.expire(minute_key, 120)

            # Add to day window (24 hour expiry)
            day_start = now - (now % 86400)  # Start of current day
            pipe.zadd(day_key, {f"{now}:{endpoint}:{method}": now})
            pipe.zremrangebyscore(day_key, 0, day_start)
            pipe.expire(day_key, 172800)  # 48 hours

            # Track endpoint-specific usage for analytics
            endpoint_key = f"api:usage:{developer_id}:endpoints:{endpoint.replace('/', '_')}"
            pipe.incr(endpoint_key)
            pipe.expire(endpoint_key, 86400)  # 24 hour expiry

            await pipe.execute()

            logger.debug(
                f"Recorded API call: developer={developer_id}, "
                f"endpoint={endpoint}, method={method}, status={status_code}"
            )

        except Exception as e:
            # Don't fail the request if tracking fails
            logger.warning(f"Failed to record API usage: {e}")

    async def get_api_usage(
        self,
        developer_id: str,
    ) -> dict[str, int]:
        """Get current API usage for a developer."""
        try:
            redis_client = await self.get_redis()
            now = time.time()

            minute_key = f"api:usage:{developer_id}:minute"
            day_key = f"api:usage:{developer_id}:day"

            # Get counts
            pipe = redis_client.pipeline()
            pipe.zcount(minute_key, now - 60, now)
            pipe.zcount(day_key, now - 86400, now)
            results = await pipe.execute()

            return {
                "requests_last_minute": results[0] or 0,
                "requests_last_day": results[1] or 0,
            }

        except Exception as e:
            logger.warning(f"Failed to get API usage: {e}")
            return {"requests_last_minute": 0, "requests_last_day": 0}

    async def dispatch(
        self,
        request: Request,
        call_next: Callable,
    ) -> Response:
        """Process request and track API usage."""
        # Skip tracking for certain paths
        if self.should_skip(request.url.path):
            return await call_next(request)

        # Extract developer ID
        developer_id = self.extract_developer_id(request)

        # Process the request
        response = await call_next(request)

        # Record usage if we have a developer ID
        if developer_id:
            # Don't block response on tracking
            await self.record_api_call(
                developer_id=developer_id,
                endpoint=request.url.path,
                method=request.method,
                status_code=response.status_code,
            )

        return response
