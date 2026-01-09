"""Pre-built AI agents for common CRM tasks."""

from aexy.agents.prebuilt.sales_outreach import SalesOutreachAgent
from aexy.agents.prebuilt.lead_scoring import LeadScoringAgent
from aexy.agents.prebuilt.email_drafter import EmailDrafterAgent
from aexy.agents.prebuilt.data_enrichment import DataEnrichmentAgent

__all__ = [
    "SalesOutreachAgent",
    "LeadScoringAgent",
    "EmailDrafterAgent",
    "DataEnrichmentAgent",
]
