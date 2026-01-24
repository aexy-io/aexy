"""Uptime check executors for HTTP, TCP, and WebSocket endpoints."""

import asyncio
import logging
import re
import ssl
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

from aexy.models.uptime import UptimeCheckType, UptimeErrorType, UptimeMonitor

logger = logging.getLogger(__name__)


@dataclass
class CheckResult:
    """Result of an uptime check."""
    is_up: bool
    status_code: int | None = None
    response_time_ms: int | None = None
    error_message: str | None = None
    error_type: str | None = None
    ssl_expiry_days: int | None = None
    ssl_issuer: str | None = None
    response_body_snippet: str | None = None
    response_headers: dict | None = None
    checked_at: datetime | None = None

    def __post_init__(self) -> None:
        if self.checked_at is None:
            self.checked_at = datetime.now(timezone.utc)


class UptimeChecker:
    """Executes uptime checks for different check types."""

    def __init__(self) -> None:
        """Initialize the uptime checker."""
        pass

    async def check(self, monitor: UptimeMonitor) -> CheckResult:
        """Execute a check based on monitor configuration.

        Args:
            monitor: The monitor configuration.

        Returns:
            CheckResult with the check outcome.
        """
        check_type = UptimeCheckType(monitor.check_type)

        if check_type == UptimeCheckType.HTTP:
            return await self._check_http(monitor)
        elif check_type == UptimeCheckType.TCP:
            return await self._check_tcp(monitor)
        elif check_type == UptimeCheckType.WEBSOCKET:
            return await self._check_websocket(monitor)
        else:
            return CheckResult(
                is_up=False,
                error_message=f"Unknown check type: {monitor.check_type}",
                error_type=UptimeErrorType.UNKNOWN.value,
            )

    async def _check_http(self, monitor: UptimeMonitor) -> CheckResult:
        """Execute an HTTP check.

        Args:
            monitor: The monitor configuration.

        Returns:
            CheckResult with HTTP check outcome.
        """
        if not monitor.url:
            return CheckResult(
                is_up=False,
                error_message="URL is required for HTTP checks",
                error_type=UptimeErrorType.INVALID_RESPONSE.value,
            )

        start_time = time.monotonic()

        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(monitor.timeout_seconds),
                verify=monitor.verify_ssl,
                follow_redirects=monitor.follow_redirects,
            ) as client:
                response = await client.request(
                    method=monitor.http_method,
                    url=monitor.url,
                    headers=monitor.request_headers or {},
                    content=monitor.request_body,
                )

                response_time_ms = int((time.monotonic() - start_time) * 1000)

                # Check SSL certificate expiry
                ssl_expiry_days = None
                ssl_issuer = None
                if monitor.url.startswith("https://"):
                    ssl_info = await self._get_ssl_info(monitor.url, monitor.timeout_seconds)
                    ssl_expiry_days = ssl_info.get("expiry_days")
                    ssl_issuer = ssl_info.get("issuer")

                # Check if status code is expected
                expected_codes = monitor.expected_status_codes or [200, 201, 204]
                is_up = response.status_code in expected_codes

                # Capture response snippet (first 500 chars)
                response_body_snippet = None
                try:
                    content = response.text[:500] if response.text else None
                    response_body_snippet = content
                except Exception:
                    pass

                # Capture response headers
                response_headers = dict(response.headers)

                error_message = None
                error_type = None
                if not is_up:
                    error_message = f"Unexpected status code: {response.status_code} (expected: {expected_codes})"
                    error_type = UptimeErrorType.UNEXPECTED_STATUS.value

                return CheckResult(
                    is_up=is_up,
                    status_code=response.status_code,
                    response_time_ms=response_time_ms,
                    error_message=error_message,
                    error_type=error_type,
                    ssl_expiry_days=ssl_expiry_days,
                    ssl_issuer=ssl_issuer,
                    response_body_snippet=response_body_snippet,
                    response_headers=response_headers,
                )

        except httpx.TimeoutException as e:
            return CheckResult(
                is_up=False,
                response_time_ms=int((time.monotonic() - start_time) * 1000),
                error_message=f"Request timed out after {monitor.timeout_seconds}s",
                error_type=UptimeErrorType.TIMEOUT.value,
            )
        except httpx.ConnectError as e:
            error_str = str(e).lower()
            if "refused" in error_str:
                error_type = UptimeErrorType.CONNECTION_REFUSED.value
            elif "reset" in error_str:
                error_type = UptimeErrorType.CONNECTION_RESET.value
            else:
                error_type = UptimeErrorType.CONNECTION_REFUSED.value

            return CheckResult(
                is_up=False,
                response_time_ms=int((time.monotonic() - start_time) * 1000),
                error_message=f"Connection error: {e}",
                error_type=error_type,
            )
        except ssl.SSLError as e:
            return CheckResult(
                is_up=False,
                response_time_ms=int((time.monotonic() - start_time) * 1000),
                error_message=f"SSL error: {e}",
                error_type=UptimeErrorType.SSL_ERROR.value,
            )
        except Exception as e:
            logger.exception(f"HTTP check failed for {monitor.url}")
            return CheckResult(
                is_up=False,
                response_time_ms=int((time.monotonic() - start_time) * 1000),
                error_message=f"Check failed: {e}",
                error_type=UptimeErrorType.UNKNOWN.value,
            )

    async def _check_tcp(self, monitor: UptimeMonitor) -> CheckResult:
        """Execute a TCP check.

        Args:
            monitor: The monitor configuration.

        Returns:
            CheckResult with TCP check outcome.
        """
        if not monitor.host or not monitor.port:
            return CheckResult(
                is_up=False,
                error_message="Host and port are required for TCP checks",
                error_type=UptimeErrorType.INVALID_RESPONSE.value,
            )

        start_time = time.monotonic()

        try:
            # Try to open a connection
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(monitor.host, monitor.port),
                timeout=monitor.timeout_seconds,
            )

            response_time_ms = int((time.monotonic() - start_time) * 1000)

            # Close the connection
            writer.close()
            await writer.wait_closed()

            return CheckResult(
                is_up=True,
                response_time_ms=response_time_ms,
            )

        except asyncio.TimeoutError:
            return CheckResult(
                is_up=False,
                response_time_ms=int((time.monotonic() - start_time) * 1000),
                error_message=f"Connection timed out after {monitor.timeout_seconds}s",
                error_type=UptimeErrorType.TIMEOUT.value,
            )
        except ConnectionRefusedError:
            return CheckResult(
                is_up=False,
                response_time_ms=int((time.monotonic() - start_time) * 1000),
                error_message=f"Connection refused to {monitor.host}:{monitor.port}",
                error_type=UptimeErrorType.CONNECTION_REFUSED.value,
            )
        except OSError as e:
            # DNS errors and other network issues
            error_str = str(e).lower()
            if "name or service not known" in error_str or "getaddrinfo" in error_str:
                error_type = UptimeErrorType.DNS_ERROR.value
            else:
                error_type = UptimeErrorType.UNKNOWN.value

            return CheckResult(
                is_up=False,
                response_time_ms=int((time.monotonic() - start_time) * 1000),
                error_message=f"Connection error: {e}",
                error_type=error_type,
            )
        except Exception as e:
            logger.exception(f"TCP check failed for {monitor.host}:{monitor.port}")
            return CheckResult(
                is_up=False,
                response_time_ms=int((time.monotonic() - start_time) * 1000),
                error_message=f"Check failed: {e}",
                error_type=UptimeErrorType.UNKNOWN.value,
            )

    async def _check_websocket(self, monitor: UptimeMonitor) -> CheckResult:
        """Execute a WebSocket check.

        Args:
            monitor: The monitor configuration.

        Returns:
            CheckResult with WebSocket check outcome.
        """
        if not monitor.url:
            return CheckResult(
                is_up=False,
                error_message="URL is required for WebSocket checks",
                error_type=UptimeErrorType.INVALID_RESPONSE.value,
            )

        start_time = time.monotonic()

        try:
            # Try importing websockets
            try:
                import websockets
            except ImportError:
                return CheckResult(
                    is_up=False,
                    error_message="websockets library not installed",
                    error_type=UptimeErrorType.UNKNOWN.value,
                )

            # Convert http(s):// to ws(s)://
            ws_url = monitor.url
            if ws_url.startswith("http://"):
                ws_url = "ws://" + ws_url[7:]
            elif ws_url.startswith("https://"):
                ws_url = "wss://" + ws_url[8:]

            # SSL context
            ssl_context = None
            if ws_url.startswith("wss://"):
                ssl_context = ssl.create_default_context()
                if not monitor.verify_ssl:
                    ssl_context.check_hostname = False
                    ssl_context.verify_mode = ssl.CERT_NONE

            async with websockets.connect(
                ws_url,
                open_timeout=monitor.timeout_seconds,
                close_timeout=5,
                ssl=ssl_context,
                additional_headers=monitor.request_headers or {},
            ) as websocket:
                response_time_ms = int((time.monotonic() - start_time) * 1000)

                # Send message if configured
                if monitor.ws_message:
                    await websocket.send(monitor.ws_message)

                    # Wait for response if expected
                    if monitor.ws_expected_response:
                        try:
                            response = await asyncio.wait_for(
                                websocket.recv(),
                                timeout=monitor.timeout_seconds,
                            )

                            # Check if response matches expected pattern
                            if not re.search(monitor.ws_expected_response, response):
                                return CheckResult(
                                    is_up=False,
                                    response_time_ms=response_time_ms,
                                    error_message=f"Response did not match expected pattern: {monitor.ws_expected_response}",
                                    error_type=UptimeErrorType.WS_UNEXPECTED_RESPONSE.value,
                                    response_body_snippet=str(response)[:500],
                                )
                        except asyncio.TimeoutError:
                            return CheckResult(
                                is_up=False,
                                response_time_ms=int((time.monotonic() - start_time) * 1000),
                                error_message="Timed out waiting for WebSocket response",
                                error_type=UptimeErrorType.TIMEOUT.value,
                            )

                # Get SSL info for wss:// URLs
                ssl_expiry_days = None
                ssl_issuer = None
                if ws_url.startswith("wss://"):
                    # Extract host for SSL check
                    https_url = "https://" + ws_url[6:]
                    ssl_info = await self._get_ssl_info(https_url, monitor.timeout_seconds)
                    ssl_expiry_days = ssl_info.get("expiry_days")
                    ssl_issuer = ssl_info.get("issuer")

                return CheckResult(
                    is_up=True,
                    response_time_ms=response_time_ms,
                    ssl_expiry_days=ssl_expiry_days,
                    ssl_issuer=ssl_issuer,
                )

        except asyncio.TimeoutError:
            return CheckResult(
                is_up=False,
                response_time_ms=int((time.monotonic() - start_time) * 1000),
                error_message=f"WebSocket connection timed out after {monitor.timeout_seconds}s",
                error_type=UptimeErrorType.TIMEOUT.value,
            )
        except Exception as e:
            error_str = str(e).lower()

            if "ssl" in error_str:
                error_type = UptimeErrorType.SSL_ERROR.value
            elif "refused" in error_str:
                error_type = UptimeErrorType.CONNECTION_REFUSED.value
            elif "handshake" in error_str:
                error_type = UptimeErrorType.WS_HANDSHAKE_FAILED.value
            else:
                error_type = UptimeErrorType.UNKNOWN.value

            logger.exception(f"WebSocket check failed for {monitor.url}")
            return CheckResult(
                is_up=False,
                response_time_ms=int((time.monotonic() - start_time) * 1000),
                error_message=f"WebSocket check failed: {e}",
                error_type=error_type,
            )

    async def _get_ssl_info(self, url: str, timeout: int) -> dict:
        """Get SSL certificate information for a URL.

        Args:
            url: The HTTPS URL to check.
            timeout: Timeout in seconds.

        Returns:
            Dict with ssl_expiry_days and issuer.
        """
        try:
            import ssl
            import socket
            from urllib.parse import urlparse
            from datetime import datetime

            parsed = urlparse(url)
            hostname = parsed.hostname
            port = parsed.port or 443

            # Create SSL context
            context = ssl.create_default_context()

            def get_cert():
                with socket.create_connection((hostname, port), timeout=timeout) as sock:
                    with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                        cert = ssock.getpeercert()
                        return cert

            # Run in thread pool to not block
            loop = asyncio.get_event_loop()
            cert = await loop.run_in_executor(None, get_cert)

            if cert:
                # Parse expiry date
                not_after = cert.get("notAfter")
                if not_after:
                    # Format: 'Dec 31 23:59:59 2024 GMT'
                    expiry_date = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z")
                    expiry_days = (expiry_date - datetime.utcnow()).days
                else:
                    expiry_days = None

                # Get issuer
                issuer = cert.get("issuer")
                issuer_str = None
                if issuer:
                    for item in issuer:
                        for key, value in item:
                            if key == "organizationName":
                                issuer_str = value
                                break

                return {
                    "expiry_days": expiry_days,
                    "issuer": issuer_str,
                }

        except Exception as e:
            logger.warning(f"Failed to get SSL info for {url}: {e}")

        return {"expiry_days": None, "issuer": None}


# Singleton instance
_checker: UptimeChecker | None = None


def get_uptime_checker() -> UptimeChecker:
    """Get the uptime checker singleton.

    Returns:
        The UptimeChecker instance.
    """
    global _checker
    if _checker is None:
        _checker = UptimeChecker()
    return _checker
