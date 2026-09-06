"""Data Enrichment Agent - Fill missing CRM fields from external sources."""

from typing import Any

from aexy.agents.base import BaseAgent


class DataEnrichmentAgent(BaseAgent):
    """AI agent for enriching CRM records with external data."""

    name = "data_enrichment"
    description = "Fill missing CRM fields by researching external data sources"

    # Catalogue tools, attached per run as the person or principal the agent
    # acts for (see `agents.tools.mcp_tools.attach_to_agent`).
    catalog_tool_names = [
        "get_record_by_id",
        "update_record_by_id",
        "list_activities",
    ]

    def __init__(
        self,
        workspace_id: str,
        db: Any = None,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.workspace_id = workspace_id
        self.db = db

    @property
    def system_prompt(self) -> str:
        return """You are a data enrichment specialist. Your job is to fill in missing or incomplete CRM record fields from what the CRM already holds: the record itself, its activities, and related records.

**Process:**
1. Get the current record data to see what's missing
2. Read the record's activities and related records for the missing facts
3. Update the record with new data, being careful not to overwrite existing values

**Data Quality Guidelines:**
- Only add data you're confident about
- Prefer facts stated in activities (emails, notes, meetings) over inference
- For person records: focus on email, title, LinkedIn, phone
- For company records: focus on industry, size, website, location
- Clearly indicate data source if uncertain

**Fields to Prioritize:**
For People:
- Email address
- Job title / Role
- LinkedIn profile
- Phone number
- Company association

For Companies:
- Industry
- Employee count / Company size
- Website
- Headquarters location
- LinkedIn company page
- Technologies used

**Important:**
- Never fabricate data - if you can't find it, say so
- Don't overwrite existing data unless explicitly asked
- Log what you updated for transparency
"""

    @property
    def goal(self) -> str:
        return "Research and fill in missing fields on the CRM record"

    def build_initial_message(self, record_data: dict, context: dict) -> str:
        values = record_data.get("values", {})
        record_id = record_data.get("id", "")
        object_type = context.get("object_type", "person")

        # Identify what we have vs what's missing
        fields_to_enrich = context.get("fields_to_enrich", [])

        # Common fields to check
        if object_type == "person":
            common_fields = ["email", "phone", "title", "linkedin", "company"]
        else:  # company
            common_fields = ["website", "industry", "employee_count", "location", "linkedin"]

        existing = []
        missing = []
        for field in common_fields:
            if values.get(field):
                existing.append(f"{field}: {values[field]}")
            else:
                missing.append(field)

        return f"""
Please enrich this {object_type} record:

**Record ID:** {record_id}

**Current Data:**
{chr(10).join(f'- {e}' for e in existing) if existing else 'Minimal data available'}

**Missing Fields:**
{chr(10).join(f'- {m}' for m in missing) if missing else 'No obvious gaps'}

**Specific Fields to Enrich:**
{chr(10).join(f'- {f}' for f in fields_to_enrich) if fields_to_enrich else 'Enrich whatever you can find'}

**Full Current Values:** {values}

**Instructions:**
1. Get the full record first
2. Use enrichment tools based on what data we have (email, name, company domain)
3. Research additional information if enrichment tools don't return enough
4. Update the record with new data
5. Report what you found and updated
"""
