"""Email validation utilities for subscriber ingestion.

Provides syntax validation, common typo detection, MX record verification,
and disposable email domain detection to reduce bounce rates.
"""

import re
import logging
from dataclasses import dataclass, field

import dns.resolver

logger = logging.getLogger(__name__)

# RFC 5322 simplified pattern — covers 99.9% of real-world addresses
_EMAIL_REGEX = re.compile(
    r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$"
)

# Common domain typos → correct domain
DOMAIN_TYPOS: dict[str, str] = {
    "gmial.com": "gmail.com",
    "gmal.com": "gmail.com",
    "gmaill.com": "gmail.com",
    "gamil.com": "gmail.com",
    "gnail.com": "gmail.com",
    "gmail.co": "gmail.com",
    "gmail.con": "gmail.com",
    "gmai.com": "gmail.com",
    "gmali.com": "gmail.com",
    "outloo.com": "outlook.com",
    "outlok.com": "outlook.com",
    "outllook.com": "outlook.com",
    "outlook.co": "outlook.com",
    "outlook.con": "outlook.com",
    "hotmal.com": "hotmail.com",
    "hotmial.com": "hotmail.com",
    "hotmail.co": "hotmail.com",
    "hotmail.con": "hotmail.com",
    "yaho.com": "yahoo.com",
    "yahooo.com": "yahoo.com",
    "yahoo.co": "yahoo.com",
    "yahoo.con": "yahoo.com",
    "yhaoo.com": "yahoo.com",
    "icloud.co": "icloud.com",
    "icloud.con": "icloud.com",
    "icoud.com": "icloud.com",
    "protonmail.co": "protonmail.com",
    "protonmal.com": "protonmail.com",
}

# Known disposable email domains
DISPOSABLE_DOMAINS: set[str] = {
    "mailinator.com",
    "guerrillamail.com",
    "guerrillamail.net",
    "tempmail.com",
    "throwaway.email",
    "temp-mail.org",
    "fakeinbox.com",
    "sharklasers.com",
    "guerrillamailblock.com",
    "grr.la",
    "dispostable.com",
    "yopmail.com",
    "trashmail.com",
    "trashmail.me",
    "trashmail.net",
    "maildrop.cc",
    "mailnesia.com",
    "tempail.com",
    "tempr.email",
    "10minutemail.com",
    "minutemail.com",
    "mohmal.com",
    "burnermail.io",
    "mailcatch.com",
    "getairmail.com",
    "meltmail.com",
    "harakirimail.com",
    "33mail.com",
}


@dataclass
class EmailValidationResult:
    """Result of email validation."""

    is_valid: bool
    email: str
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    suggested_email: str | None = None


def validate_email_syntax(email: str) -> tuple[bool, str | None]:
    """Validate email syntax per RFC 5322 (simplified).

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not email or not isinstance(email, str):
        return False, "Email address is required"

    email = email.strip().lower()

    if len(email) > 254:
        return False, "Email address too long (max 254 characters)"

    if "@" not in email:
        return False, "Missing @ symbol"

    local, _, domain = email.rpartition("@")

    if not local:
        return False, "Missing local part before @"

    if len(local) > 64:
        return False, "Local part too long (max 64 characters)"

    if not domain:
        return False, "Missing domain after @"

    if "." not in domain:
        return False, "Domain must contain at least one dot"

    if not _EMAIL_REGEX.match(email):
        return False, "Invalid email format"

    return True, None


def check_typo(email: str) -> str | None:
    """Check for common domain typos and return suggested correction.

    Returns:
        Suggested corrected email, or None if no typo detected.
    """
    _, _, domain = email.strip().lower().rpartition("@")
    correct_domain = DOMAIN_TYPOS.get(domain)
    if correct_domain:
        local = email.strip().lower().split("@")[0]
        return f"{local}@{correct_domain}"
    return None


def is_disposable_domain(email: str) -> bool:
    """Check if the email uses a known disposable/temporary domain."""
    _, _, domain = email.strip().lower().rpartition("@")
    return domain in DISPOSABLE_DOMAINS


def check_mx_record(domain: str, timeout: float = 5.0) -> bool:
    """Verify domain has MX records (accepts email).

    Args:
        domain: The domain to check.
        timeout: DNS lookup timeout in seconds.

    Returns:
        True if MX records exist.
    """
    try:
        resolver = dns.resolver.Resolver()
        resolver.timeout = timeout
        resolver.lifetime = timeout
        answers = resolver.resolve(domain, "MX")
        return len(answers) > 0
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.NoNameservers):
        return False
    except dns.resolver.Timeout:
        logger.debug(f"MX lookup timed out for {domain}")
        # Don't block on timeout — assume valid
        return True
    except Exception as e:
        logger.warning(f"MX lookup error for {domain}: {e}")
        return True  # Don't block on unexpected errors


def validate_email(email: str, check_mx: bool = True) -> EmailValidationResult:
    """Full email validation: syntax, typos, disposable check, MX verification.

    Args:
        email: The email address to validate.
        check_mx: Whether to perform DNS MX record lookup.

    Returns:
        EmailValidationResult with validation details.
    """
    email = email.strip().lower()
    errors: list[str] = []
    warnings: list[str] = []
    suggested_email: str | None = None

    # 1. Syntax check
    is_valid, syntax_error = validate_email_syntax(email)
    if not is_valid:
        return EmailValidationResult(
            is_valid=False,
            email=email,
            errors=[syntax_error or "Invalid email syntax"],
        )

    # 2. Typo detection
    suggestion = check_typo(email)
    if suggestion:
        suggested_email = suggestion
        warnings.append(f"Possible typo — did you mean {suggestion}?")

    # 3. Disposable domain check
    if is_disposable_domain(email):
        errors.append("Disposable/temporary email addresses are not allowed")

    # 4. MX record check
    if check_mx and not errors:
        domain = email.split("@")[1]
        if not check_mx_record(domain):
            errors.append(f"Domain '{domain}' does not accept email (no MX records)")

    return EmailValidationResult(
        is_valid=len(errors) == 0,
        email=email,
        errors=errors,
        warnings=warnings,
        suggested_email=suggested_email,
    )
