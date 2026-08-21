import type { Metadata } from "next";
import { GuideArticle } from "@/components/marketing/GuideArticle";

export const metadata: Metadata = {
  title: "Self-Hosted AI Company OS: Data Sovereignty, Compliance & Architecture",
  description:
    "Why teams self-host their AI company operating system: data residency, compliance posture, local LLM inference, and cost control. Aexy's self-hosted architecture (AGPL-3.0) explained.",
  alternates: { canonical: "/guides/self-hosted-ai-company-os" },
};

export default function SelfHostedGuide() {
  return (
    <GuideArticle
      slug="self-hosted-ai-company-os"
      eyebrow="Self-hosted company OS"
      title="Self-hosted AI company OS: security, compliance, and data sovereignty"
      description="Self-hosting a company operating system means your CRM records, engineering data, documents, and AI-agent activity run on infrastructure you control — nothing leaves your network unless you choose. This guide covers when self-hosting is the right call, what Aexy's self-hosted architecture looks like, and the honest trade-offs against managed cloud."
      keyFacts={[
        "Aexy is licensed AGPL-3.0 — the complete source is public and the self-hosted deployment is free.",
        "The stack is standard and auditable: PostgreSQL, Redis, a Temporal workflow engine, S3-compatible object storage, deployed via Docker Compose.",
        "LLM calls can stay on your hardware: Aexy's model gateway supports local inference via Ollama alongside cloud providers (Anthropic Claude, Google Gemini).",
        "Every AI-agent action is recorded in an immutable audit log — the evidence trail compliance reviews ask for.",
        "Data is exportable at any time; AGPL licensing makes vendor lock-in structurally impossible.",
      ]}
      sections={[
        {
          heading: "Why do teams self-host a company OS?",
          paragraphs: [
            "Three drivers come up consistently. Data residency: regulated industries and privacy-sensitive teams need customer records and internal documents to stay in a specific jurisdiction or network boundary. Compliance posture: when auditors ask where data lives, who can access it, and what the AI did with it, 'on our infrastructure, with these audit logs' is a shorter conversation than a vendor questionnaire chain. Cost shape: per-seat SaaS pricing compounds across 4–10 tools; a self-hosted OS costs whatever your infrastructure costs.",
            "There's a fourth driver specific to AI-native platforms: model control. If agents read your CRM and docs, some teams want inference to happen on hardware they own. Aexy's LLM gateway treats local models (via Ollama) as a first-class provider, so agent workloads can run without any data leaving your network.",
          ],
        },
        {
          heading: "What does the self-hosted architecture look like?",
          paragraphs: [
            "Aexy deploys with Docker Compose and uses deliberately boring, auditable components:",
          ],
          bullets: [
            "PostgreSQL for all structured data — CRM records, tasks, workflows, people data.",
            "Redis for queues and caching; Temporal for durable background workflows (syncs, automations, agent runs).",
            "S3-compatible object storage (RustFS) for files and documents — swappable for any S3 API.",
            "A FastAPI backend and Next.js frontend, both in the public repository — you can read every line before you run it.",
            "LLM gateway with pluggable providers: Anthropic Claude, Google Gemini, or fully local via Ollama, with per-provider rate limits.",
          ],
        },
        {
          heading: "How does self-hosting support a compliance program?",
          paragraphs: [
            "To be precise: self-hosting doesn't make you compliant with anything by itself — certifications like SOC 2 attach to organizations and their processes, not to software you install. What self-hosting changes is how much of the compliance surface you control.",
            "Data processing agreements shrink when the processor is you. Access control integrates with your existing infrastructure rather than a vendor's IAM. Retention and deletion policies are enforced on your storage. And for AI specifically, Aexy's immutable agent audit log — every run, tool call, policy decision, and config change — gives reviewers the evidence trail that 'we use AI responsibly' claims need.",
          ],
        },
        {
          heading: "Self-hosted vs. cloud: the honest trade-offs",
          paragraphs: [
            "Self-hosting costs operational attention: you own upgrades, backups, monitoring, and incident response for the platform itself. Small teams without infrastructure experience often start on managed cloud and move later — the open-source license guarantees that migration path stays open, in both directions.",
            "The decision rule that serves most teams: if you have a compliance requirement, a data-residency constraint, or an ops-capable team and cost sensitivity, self-host. If you have none of those, cloud is faster and the exit door stays open.",
          ],
        },
      ]}
      faqs={[
        ["Is the self-hosted version of Aexy actually free?", "Yes. The codebase is AGPL-3.0 — self-hosting is free with no seat limits. Paid tiers exist for managed cloud hosting and enterprise controls."],
        ["Can AI features run without sending data to external LLM providers?", "Yes. The LLM gateway supports local inference through Ollama, so agent and AI workloads can run entirely on your own hardware. Cloud providers (Claude, Gemini) remain available where you choose to use them."],
        ["Does self-hosting make us SOC 2 or HIPAA compliant?", "No software purchase does — those frameworks certify your organization's processes. Self-hosting reduces your dependence on vendor attestations and gives you direct control over data residency, access, retention, and AI audit evidence, which simplifies the program."],
        ["What does it take to run Aexy self-hosted?", "A Docker-capable host running PostgreSQL, Redis, Temporal, object storage, and the app services via Docker Compose. Teams comfortable operating a standard containerized stack can run it."],
        ["Can we move from self-hosted to cloud later, or the reverse?", "Yes. Data is exportable and the platform is identical in both deployments — the AGPL license means the self-hosted path can never be taken away."],
      ]}
      relatedLinks={[
        ["Open source company OS", "/open-source-company-os"],
        ["What is an AI company OS?", "/guides/what-is-an-ai-company-operating-system"],
        ["Security", "/security"],
        ["Pricing", "/pricing"],
      ]}
    />
  );
}
