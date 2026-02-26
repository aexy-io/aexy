"""URL validation utilities to prevent SSRF attacks.

Validates that user-supplied URLs do not target internal/private networks,
cloud metadata endpoints, or non-HTTP schemes.
"""

import ipaddress
import logging
import socket
import urllib.parse

logger = logging.getLogger(__name__)

# Private and reserved IP ranges that should never be fetched
_BLOCKED_NETWORKS = [
    # IPv4 private ranges (RFC 1918)
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    # Loopback
    ipaddress.ip_network("127.0.0.0/8"),
    # Link-local
    ipaddress.ip_network("169.254.0.0/16"),
    # Carrier-grade NAT
    ipaddress.ip_network("100.64.0.0/10"),
    # IPv6 private/reserved
    ipaddress.ip_network("::1/128"),       # loopback
    ipaddress.ip_network("fc00::/7"),      # unique local
    ipaddress.ip_network("fe80::/10"),     # link-local
]

# Cloud metadata endpoints (by hostname)
_BLOCKED_HOSTNAMES = {
    "metadata.google.internal",
    "metadata.google.internal.",
}

# Cloud metadata IPs
_BLOCKED_IPS = {
    "169.254.169.254",  # AWS/GCP/Azure metadata
    "169.254.170.2",    # AWS ECS task metadata
    "fd00:ec2::254",    # AWS IPv6 metadata
}


class SSRFError(ValueError):
    """Raised when a URL targets a blocked network or host."""
    pass


def validate_url_for_fetch(url: str) -> str:
    """Validate that a URL is safe to fetch (no SSRF).

    Checks:
    1. Scheme must be http or https
    2. Hostname must not resolve to a private/reserved IP
    3. Hostname must not be a known cloud metadata endpoint
    4. Port must be standard (80, 443) or in the 1024-65535 range

    Args:
        url: The URL to validate.

    Returns:
        The validated URL (unchanged).

    Raises:
        SSRFError: If the URL targets a blocked resource.
    """
    parsed = urllib.parse.urlparse(url)

    # 1. Scheme check
    if parsed.scheme not in ("http", "https"):
        raise SSRFError(f"Blocked URL scheme: {parsed.scheme!r}. Only http/https allowed.")

    hostname = parsed.hostname
    if not hostname:
        raise SSRFError("URL has no hostname.")

    # 2. Blocked hostname check
    if hostname.lower() in _BLOCKED_HOSTNAMES:
        raise SSRFError(f"Blocked hostname: {hostname}")

    # 3. Blocked literal IP check
    if hostname in _BLOCKED_IPS:
        raise SSRFError(f"Blocked IP address: {hostname}")

    # 4. Port check — block low ports except 80/443
    port = parsed.port
    if port is not None and port not in (80, 443) and port < 1024:
        raise SSRFError(f"Blocked port: {port}")

    # 5. DNS resolution check — resolve the hostname and verify the IP
    try:
        addr_info = socket.getaddrinfo(hostname, port or 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        # DNS resolution failed — let the caller handle this as a connection error
        return url

    for family, _type, _proto, _canonname, sockaddr in addr_info:
        ip_str = sockaddr[0]

        # Check against blocked literal IPs
        if ip_str in _BLOCKED_IPS:
            raise SSRFError(f"Hostname {hostname} resolves to blocked IP: {ip_str}")

        # Check against blocked networks
        try:
            ip = ipaddress.ip_address(ip_str)
            for network in _BLOCKED_NETWORKS:
                if ip in network:
                    raise SSRFError(
                        f"Hostname {hostname} resolves to private/reserved IP: {ip_str}"
                    )
        except ValueError:
            continue

    return url
