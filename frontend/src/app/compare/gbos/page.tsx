import type { Metadata } from "next";
import { ComparisonPage } from "@/components/marketing/ComparisonPage";

export const metadata: Metadata = {
  title: "Aexy vs GBOS",
  description: "Compare Aexy and GBOS for teams evaluating AI-native business operating systems, SaaS stack replacement, CRM, GTM, docs, workflows, and agents.",
};

export default function GbosComparisonPage() {
  return (
    <ComparisonPage
      competitor="GBOS"
      eyebrow="Aexy vs GBOS"
      title="A GBOS alternative for technical teams that need concrete operating modules."
      description="GBOS-style platforms emphasize replacing a broad SaaS stack with an AI-native business operating system. Aexy takes a more concrete product-led path: engineering execution, CRM, GTM, docs, workflows, people systems, and agents connected in one open company OS."
      aexyBestFor={[
        "Technical and product-led teams that need real engineering, CRM, GTM, and docs modules.",
        "Companies that want open-source/self-hostable control over the operating layer.",
        "Teams that want to consolidate workflows gradually instead of rebuilding the whole business system at once.",
      ]}
      competitorBestFor={[
        "Teams evaluating a broad AI business operating system category pitch.",
        "Organizations focused on replacing many SaaS tools with one generated or highly configurable platform.",
        "Buyers who prefer a broad business-system story over a technical-team wedge.",
      ]}
      rows={[
        ["Primary focus", "Open AI company OS for technical teams with concrete modules.", "Broad AI business operating system / SaaS-stack replacement positioning."],
        ["Adoption path", "Start with CRM, GTM, planning, docs, or agents, then expand.", "Often framed around replacing the broader stack."],
        ["Proof surface", "Existing modules across engineering, GTM, CRM, docs, workflows, people, and agents.", "Category-level business OS story."],
        ["Control", "Open-source/self-hostable path.", "Depends on the vendor deployment model."],
      ]}
      migration={[
        "Choose the first workflow where tool sprawl is costing time or context.",
        "Adopt Aexy modules around that workflow without forcing a full-stack migration.",
        "Expand into adjacent CRM, GTM, docs, planning, and agent workflows as the operating graph matures.",
      ]}
      faqs={[
        ["Is Aexy trying to replace the whole SaaS stack?", "Aexy can reduce tool sprawl, but the practical adoption path is workflow by workflow, with concrete modules and integrations."],
        ["How is Aexy different from a broad AI business OS?", "Aexy starts from real operating modules for technical teams and connects them into a company OS."],
        ["Who should compare Aexy and GBOS-style tools?", "Teams evaluating AI business operating systems, SaaS consolidation, and company-wide workflow automation should compare both approaches."],
      ]}
    />
  );
}
