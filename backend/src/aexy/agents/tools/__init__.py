"""Tools available for AI agents."""

from aexy.agents.tools.crm_tools import (
    SearchContactsTool,
    GetRecordTool,
    UpdateRecordTool,
    CreateRecordTool,
    GetActivitiesTool,
)
from aexy.agents.tools.email_tools import (
    SendEmailTool,
    CreateDraftTool,
    GetEmailHistoryTool,
)
from aexy.agents.tools.enrichment_tools import (
    EnrichCompanyTool,
    EnrichPersonTool,
    WebSearchTool,
)
from aexy.agents.tools.communication_tools import (
    SendSlackTool,
    SendSMSTool,
)

__all__ = [
    # CRM
    "SearchContactsTool",
    "GetRecordTool",
    "UpdateRecordTool",
    "CreateRecordTool",
    "GetActivitiesTool",
    # Email
    "SendEmailTool",
    "CreateDraftTool",
    "GetEmailHistoryTool",
    # Enrichment
    "EnrichCompanyTool",
    "EnrichPersonTool",
    "WebSearchTool",
    # Communication
    "SendSlackTool",
    "SendSMSTool",
]
