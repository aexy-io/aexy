import type { Metadata } from "next";
import { Workflow, Zap, GitBranch, ShieldCheck, Repeat, Boxes } from "lucide-react";

import {
  ProductPageTemplate,
  productMetadata,
  type ProductPageData,
} from "@/components/marketing/ProductPageTemplate";

const data: ProductPageData = {
  slug: "automations",
  eyebrow: "Automations",
  title: "Workflows that reach across the whole company",
  subtitle:
    "Trigger on anything that happens in Aexy \u2014 a deal stage, a failing monitor, a new hire, an inbound email \u2014 and act anywhere else, including on your AI agents.",
  proof: ["Visual builder", "Durable execution", "Agent policies"],
  features: [
    {
      icon: Zap,
      title: "Triggers from every module",
      description:
        "A CRM stage change, a sprint transition, an uptime incident, a form submission, a compliance date. Automations are not bolted onto one app \u2014 they see the same events the rest of the product does.",
    },
    {
      icon: Workflow,
      title: "A builder you can read back",
      description:
        "Branch, wait, filter and fan out on a canvas that stays legible at twenty nodes. What you draw is what runs; there is no second representation to keep in step.",
    },
    {
      icon: Repeat,
      title: "Durable by default",
      description:
        "Runs execute on Temporal, so a workflow survives a deploy, a restart, and a third-party API having a bad afternoon. Retries and backoff are policy, not something each action reinvents.",
    },
    {
      icon: Boxes,
      title: "Actions, not just notifications",
      description:
        "Create records, send email, call a webhook, move a ticket, update a table, ask an LLM. An automation that can only tell somebody is a reminder, not an automation.",
    },
    {
      icon: ShieldCheck,
      title: "Policies for agents",
      description:
        "Give an AI agent a workflow to follow and a boundary it cannot cross. Approval steps sit in the same graph as the automated ones, so the handover to a human is part of the design.",
    },
    {
      icon: GitBranch,
      title: "Templates to start from",
      description:
        "Ready-made workflows for the routes most teams build first \u2014 lead routing, escalation, onboarding, renewal reminders. Fork one and edit it rather than starting at an empty canvas.",
    },
  ],
  how: {
    heading: "Build one in an afternoon",
    blurb: "The hard part of automation is usually the plumbing between systems. Here there is none, because it is one system.",
    steps: [
      { title: "Pick a trigger", description: "Any event, from any module you have enabled." },
      { title: "Add conditions", description: "Filter on the record that fired it." },
      { title: "Chain the actions", description: "Including a hand-off to an agent." },
      { title: "Watch the run log", description: "Every execution, every retry, kept." },
    ],
  },
  cta: {
    heading: "Automate the part nobody wants to own",
    blurb: "Start from a template and change one condition.",
  },
};

export const metadata: Metadata = productMetadata(data);

export default function Page() {
  return <ProductPageTemplate data={data} />;
}
