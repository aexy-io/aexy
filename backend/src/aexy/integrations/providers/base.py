"""Shared dataclasses for GTM provider results."""

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class VisitorIdentificationResult:
    """Result from a visitor identification provider (e.g., Snitcher)."""
    success: bool = False
    company_name: str | None = None
    company_domain: str | None = None
    industry: str | None = None
    employee_range: str | None = None
    revenue_range: str | None = None
    company_type: str | None = None  # "Business", "ISP", "Education"
    headquarters_location: str | None = None
    confidence: float = 0.0
    raw_response: dict = field(default_factory=dict)
    error: str | None = None


@dataclass
class EmailVerificationResult:
    """Result from an email verification provider (e.g., MillionVerifier)."""
    email: str = ""
    is_valid: bool = False
    result_code: str = ""  # ok, catch_all, unknown, invalid, disposable
    quality_score: float = 0.0  # 0.0 to 1.0
    is_disposable: bool = False
    is_role_based: bool = False
    is_free_provider: bool = False
    did_you_mean: str | None = None
    raw_response: dict = field(default_factory=dict)
    error: str | None = None


@dataclass
class ContactEnrichmentResult:
    """Result from a contact enrichment provider (e.g., Apollo)."""
    success: bool = False
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    title: str | None = None
    linkedin_url: str | None = None
    company_name: str | None = None
    company_domain: str | None = None
    company_industry: str | None = None
    company_size: str | None = None
    raw_response: dict = field(default_factory=dict)
    error: str | None = None


@dataclass
class LinkedInAutomationResult:
    """Result from a LinkedIn automation action (e.g., PhantomBuster)."""
    success: bool = False
    action: str = ""  # profile_view, connection_request, message
    target_url: str | None = None
    raw_response: dict = field(default_factory=dict)
    error: str | None = None


@dataclass
class SMSSendResult:
    """Result from sending an SMS."""
    success: bool = False
    message_sid: str | None = None
    to_number: str = ""
    status: str = ""  # queued, sent, delivered, failed
    raw_response: dict = field(default_factory=dict)
    error: str | None = None
