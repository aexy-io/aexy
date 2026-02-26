"""Generic providers for GTM slots that use simple API key authentication.

These cover the newer provider slots (intent_data, seo_tracking, ad_platform,
analytics, data_warehouse) where the integration is API-key based.
"""

import logging
from typing import Any

from aexy.integrations.registry import BaseProvider, ProviderRegistry

logger = logging.getLogger(__name__)


class GenericAPIKeyProvider(BaseProvider):
    """Base for providers that only need an api_key credential."""

    REQUIRED_CREDENTIALS = ["api_key"]

    async def test_connection(self) -> dict[str, Any]:
        api_key = self.credentials.get("api_key", "")
        if not api_key:
            return {"success": False, "message": "API key is required"}
        return {"success": True, "message": "API key configured successfully"}


# ---------------------------------------------------------------------------
# Intent Data providers
# ---------------------------------------------------------------------------

class BomboraProvider(GenericAPIKeyProvider):
    SLOT = "intent_data"
    NAME = "bombora"
    DISPLAY_NAME = "Bombora"
    MONTHLY_COST_CENTS = 0


class G2IntentProvider(GenericAPIKeyProvider):
    SLOT = "intent_data"
    NAME = "g2"
    DISPLAY_NAME = "G2"
    MONTHLY_COST_CENTS = 0


# ---------------------------------------------------------------------------
# SEO Tracking providers
# ---------------------------------------------------------------------------

class AhrefsProvider(GenericAPIKeyProvider):
    SLOT = "seo_tracking"
    NAME = "ahrefs"
    DISPLAY_NAME = "Ahrefs"
    MONTHLY_COST_CENTS = 0


class SemrushProvider(GenericAPIKeyProvider):
    SLOT = "seo_tracking"
    NAME = "semrush"
    DISPLAY_NAME = "Semrush"
    MONTHLY_COST_CENTS = 0


# ---------------------------------------------------------------------------
# Ad Platform providers
# ---------------------------------------------------------------------------

class GoogleAdsProvider(GenericAPIKeyProvider):
    SLOT = "ad_platform"
    NAME = "google_ads"
    DISPLAY_NAME = "Google Ads"
    MONTHLY_COST_CENTS = 0


class LinkedInAdsProvider(GenericAPIKeyProvider):
    SLOT = "ad_platform"
    NAME = "linkedin_ads"
    DISPLAY_NAME = "LinkedIn Ads"
    MONTHLY_COST_CENTS = 0


class MetaAdsProvider(GenericAPIKeyProvider):
    SLOT = "ad_platform"
    NAME = "meta_ads"
    DISPLAY_NAME = "Meta Ads"
    MONTHLY_COST_CENTS = 0


# ---------------------------------------------------------------------------
# Analytics providers
# ---------------------------------------------------------------------------

class MixpanelProvider(GenericAPIKeyProvider):
    SLOT = "analytics"
    NAME = "mixpanel"
    DISPLAY_NAME = "Mixpanel"
    MONTHLY_COST_CENTS = 0


class AmplitudeProvider(GenericAPIKeyProvider):
    SLOT = "analytics"
    NAME = "amplitude"
    DISPLAY_NAME = "Amplitude"
    MONTHLY_COST_CENTS = 0


class PosthogProvider(GenericAPIKeyProvider):
    SLOT = "analytics"
    NAME = "posthog"
    DISPLAY_NAME = "PostHog"
    MONTHLY_COST_CENTS = 0


# ---------------------------------------------------------------------------
# Data Warehouse providers
# ---------------------------------------------------------------------------

class BigQueryProvider(GenericAPIKeyProvider):
    SLOT = "data_warehouse"
    NAME = "bigquery"
    DISPLAY_NAME = "BigQuery"
    MONTHLY_COST_CENTS = 0


class SnowflakeProvider(GenericAPIKeyProvider):
    SLOT = "data_warehouse"
    NAME = "snowflake"
    DISPLAY_NAME = "Snowflake"
    MONTHLY_COST_CENTS = 0


class RedshiftProvider(GenericAPIKeyProvider):
    SLOT = "data_warehouse"
    NAME = "redshift"
    DISPLAY_NAME = "Redshift"
    MONTHLY_COST_CENTS = 0


# ---------------------------------------------------------------------------
# Register all providers
# ---------------------------------------------------------------------------

ProviderRegistry.register("intent_data", "bombora", BomboraProvider)
ProviderRegistry.register("intent_data", "g2", G2IntentProvider)

ProviderRegistry.register("seo_tracking", "ahrefs", AhrefsProvider)
ProviderRegistry.register("seo_tracking", "semrush", SemrushProvider)

ProviderRegistry.register("ad_platform", "google_ads", GoogleAdsProvider)
ProviderRegistry.register("ad_platform", "linkedin_ads", LinkedInAdsProvider)
ProviderRegistry.register("ad_platform", "meta_ads", MetaAdsProvider)

ProviderRegistry.register("analytics", "mixpanel", MixpanelProvider)
ProviderRegistry.register("analytics", "amplitude", AmplitudeProvider)
ProviderRegistry.register("analytics", "posthog", PosthogProvider)

ProviderRegistry.register("data_warehouse", "bigquery", BigQueryProvider)
ProviderRegistry.register("data_warehouse", "snowflake", SnowflakeProvider)
ProviderRegistry.register("data_warehouse", "redshift", RedshiftProvider)
