const LLMS_TXT = `# Aexy

> Aexy is an open-source (AGPL-3.0), AI-native company operating system. It replaces separate CRM, engineering/project-tracking, workflow, HR, and docs tools with one workspace where teams and governed AI agents share the same context. Self-hostable for free, with a commercial cloud option.

Key facts: agent-native CRM with schema-flexible custom objects and AI-computed fields; sprint/task management with commit and PR auto-linking; uptime and observability alerts that auto-create and auto-resolve tickets; website visitor identification with lead scoring and routing; email sending-domain warming; AI agents governed by policy gates, approvals, and immutable audit logs; docs with a knowledge graph; an MCP server so ChatGPT, Claude, Cursor and Codex can operate the workspace directly; self-host or cloud deployment.

## Products

- [Agent-native CRM](https://aexy.io/products/crm): CRM for humans and AI agents — custom objects, email/calendar sync, sequences, GTM signals
- [AI Agents](https://aexy.io/products/ai-agents): governed agents with tool access, policy gates, and audit history
- [MCP Server](https://aexy.io/products/mcp): use Aexy from ChatGPT, Claude, Cursor or Codex over the Model Context Protocol — ChatGPT connects remotely over OAuth with per-workspace scoping
- [GTM Intelligence](https://aexy.io/products/gtm-intelligence): visitor identification, ICP scoring, routing, sequences
- [Sprint Planning](https://aexy.io/products/planning): AI-assisted capacity planning from historical contribution data
- [Pricing](https://aexy.io/pricing): self-host free; cloud and enterprise tiers

## Guides

- [What is an AI company operating system?](https://aexy.io/guides/what-is-an-ai-company-operating-system): category definition, core modules, deployment models
- [AI agents for business workflows](https://aexy.io/guides/ai-agents-for-business-workflows): what governed agents can automate without custom code
- [Self-hosted AI company OS](https://aexy.io/guides/self-hosted-ai-company-os): data sovereignty, compliance posture, architecture
- [Best AI company operating systems 2026](https://aexy.io/guides/best-ai-company-operating-systems-2026): neutral buyer's guide across the category

## Comparisons

- [Aexy vs Jira](https://aexy.io/compare/jira)
- [Aexy vs Linear](https://aexy.io/compare/linear)
- [Aexy vs HubSpot](https://aexy.io/compare/hubspot)
- [Aexy vs Attio](https://aexy.io/compare/attio)
- [Aexy vs Salesforce](https://aexy.io/compare/salesforce)
- [Aexy vs Notion](https://aexy.io/compare/notion)

## Solutions

- [For revenue teams](https://aexy.io/for/revenue-teams)
- [For engineering managers](https://aexy.io/for/engineering-managers)
- [For founders](https://aexy.io/for/founders)

## Optional

- [Documentation](https://aexy.io/handbook)
- [About / team](https://aexy.io/about)
- [Changelog](https://aexy.io/changelog)
- [Source code](https://github.com/aexy-io/aexy)
`;

export function GET() {
  return new Response(LLMS_TXT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
