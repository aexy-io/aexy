import type { Metadata } from "next";
import { Inbox, Split, Clock, Building2, Bot, BarChart3 } from "lucide-react";

import {
  ProductPageTemplate,
  productMetadata,
  type ProductPageData,
} from "@/components/marketing/ProductPageTemplate";

const data: ProductPageData = {
  slug: "service-desk",
  eyebrow: "Service Desk",
  title: "Support that knows who you are waiting on",
  subtitle:
    "An email-first help desk where every ticket records which party owes the next action — you, the customer, or a vendor — and how long each of them took.",
  proof: ["Shared mailbox intake", "Working-hours SLA clock", "AI triage with a confidence floor"],
  features: [
    {
      icon: Inbox,
      title: "Mail in, ticket out",
      description:
        "Point a shared address at Aexy over a webhook or Gmail sync. Replies thread onto the existing ticket, duplicates are dropped, and the sender's domain routes the ticket to the right account or vendor automatically.",
    },
    {
      icon: Clock,
      title: "A clock that keeps business hours",
      description:
        "A two-business-day target means eighteen working hours, not forty-eight wall-clock ones. Nothing accrues overnight, at weekends or on holidays, and the day boundary resolves in your workspace's own timezone.",
    },
    {
      icon: Split,
      title: "Pending-with, not assignee",
      description:
        "One email often means two requests and three parties. Split a ticket in one click, and every handoff is written to a timestamped ledger — so \u201cwe were waiting on the vendor for nine days\u201d is a fact, not an argument.",
    },
    {
      icon: Building2,
      title: "Accounts, vendors, products",
      description:
        "Master data with the email domains attached. That is what makes routing work without rules: a message from a known customer domain lands on their account with their history already beside it.",
    },
    {
      icon: Bot,
      title: "Triage that admits doubt",
      description:
        "An LLM proposes the request type and product on arrival. Below your confidence threshold it flags the ticket for triage instead of quietly mis-filing it, and the accuracy report tells you whether to raise or lower the bar.",
    },
    {
      icon: BarChart3,
      title: "Reporting on the handoffs",
      description:
        "Because every pending-with interval is stored, you can answer where time actually goes — your queue, the customer's, or a supplier's — rather than only how long tickets stayed open.",
    },
  ],
  how: {
    heading: "From an address to an answer",
    blurb:
      "Most desks are configured for weeks before the first ticket. This one starts working when the mailbox connects, and the taxonomy fills in as you correct it.",
    steps: [
      { title: "Connect a mailbox", description: "Webhook or Gmail sync, one shared address." },
      { title: "Add your domains", description: "Attach customer and vendor domains to accounts." },
      { title: "Set working hours", description: "The clock and every breach figure depend on it." },
      { title: "Work the triage queue", description: "Corrections train the classifier." },
    ],
  },
  specs: {
    heading: "Under the hood",
    items: [
      { label: "Intake channels", value: "Provider webhook, Gmail sync, manual, web form" },
      { label: "Duplicate handling", value: "Idempotent by provider message id" },
      { label: "Handoff record", value: "Every pending-with interval, with duration and author" },
      { label: "Clock", value: "Working hours, workspace timezone, holiday calendar" },
      { label: "Customer view", value: "Tokenised public ticket page, no login" },
      { label: "Escalation", value: "Scheduled digests and convert-to-task into Sprints" },
    ],
  },
  cta: {
    heading: "Stop guessing whose turn it is",
    blurb: "Connect a mailbox and watch the first ticket route itself.",
  },
};

export const metadata: Metadata = productMetadata(data);

export default function Page() {
  return <ProductPageTemplate data={data} />;
}
