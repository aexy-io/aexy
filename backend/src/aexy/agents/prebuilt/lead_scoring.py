"""Lead Scoring Agent - Score leads based on fit and engagement."""

from typing import Any
from langchain_core.tools import BaseTool

from aexy.agents.base import BaseAgent
from aexy.agents.tools.crm_tools import (
    GetRecordTool,
    UpdateRecordTool,
    GetActivitiesTool,
)
from aexy.agents.tools.enrichment_tools import EnrichCompanyTool, EnrichPersonTool


class LeadScoringAgent(BaseAgent):
    """AI agent for scoring leads based on fit and engagement."""

    name = "lead_scoring"
    description = "Score leads 0-100 based on company fit, role match, and engagement signals"

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
        return """You are an expert lead scoring analyst. Your job is to evaluate leads and assign them a score from 0-100.

**Scoring Criteria (total 100 points):**

**Fit Score (50 points max):**
- Company Size Match (15 pts): Enterprise/Mid-market/SMB alignment with ICP
- Industry Match (15 pts): Target industry or adjacent
- Role/Title Match (10 pts): Decision maker, influencer, or end user
- Geographic Fit (5 pts): In target regions
- Technology Stack (5 pts): Uses complementary or target technologies

**Engagement Score (50 points max):**
- Email Engagement (15 pts): Opens, clicks, replies
- Website Activity (10 pts): Page views, time on site
- Content Engagement (10 pts): Downloads, webinar attendance
- Social Engagement (5 pts): LinkedIn interactions
- Recency (10 pts): How recent was last engagement

**Score Interpretation:**
- 80-100: Hot lead - prioritize for immediate outreach
- 60-79: Warm lead - nurture with targeted content
- 40-59: Developing - continue general nurturing
- 20-39: Cold - low priority, automated nurturing
- 0-19: Poor fit - consider removing from active lists

Always provide:
1. The numeric score (0-100)
2. A breakdown of fit vs engagement points
3. Key strengths and concerns
4. Recommended next action
"""

    @property
    def tools(self) -> list[BaseTool]:
        return [
            GetRecordTool(db=self.db),
            UpdateRecordTool(db=self.db),
            GetActivitiesTool(db=self.db),
            EnrichCompanyTool(),
            EnrichPersonTool(),
        ]

    @property
    def goal(self) -> str:
        return "Analyze the lead and provide a score from 0-100 with reasoning and next action recommendation"

    def build_initial_message(self, record_data: dict, context: dict) -> str:
        values = record_data.get("values", {})
        record_id = record_data.get("id", "")

        # Extract lead info
        name = values.get("first_name", "") or values.get("name", "Unknown")
        email = values.get("email", "")
        company = values.get("company", "") or values.get("company_name", "")
        title = values.get("title", "") or values.get("job_title", "")

        # ICP from context
        icp = context.get("ideal_customer_profile", {})
        target_industries = icp.get("industries", [])
        target_company_sizes = icp.get("company_sizes", [])
        target_titles = icp.get("titles", [])

        return f"""
Please score this lead:

**Lead Information:**
- Record ID: {record_id}
- Name: {name}
- Email: {email}
- Company: {company}
- Title: {title}

**Current Values:** {values}

**Ideal Customer Profile (for fit scoring):**
- Target Industries: {', '.join(target_industries) if target_industries else 'Not specified'}
- Target Company Sizes: {', '.join(target_company_sizes) if target_company_sizes else 'Not specified'}
- Target Titles: {', '.join(target_titles) if target_titles else 'Decision makers and influencers'}

**Instructions:**
1. Get the full record data
2. Get the activity history to assess engagement
3. Enrich the company and person data if needed
4. Calculate the fit score (0-50) and engagement score (0-50)
5. Update the record with the new lead_score field
6. Provide your analysis

Please be thorough but concise in your analysis.
"""
