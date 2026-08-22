import type { Metadata } from "next";
import { ShieldCheck, BellRing, GraduationCap, FileCheck2, CalendarClock, ScrollText } from "lucide-react";

import {
  ProductPageTemplate,
  productMetadata,
  type ProductPageData,
} from "@/components/marketing/ProductPageTemplate";

const data: ProductPageData = {
  slug: "compliance",
  eyebrow: "Compliance",
  title: "Evidence you can produce on the day you are asked",
  subtitle:
    "Mandatory training, certification expiry, recurring obligations and the document trail \u2014 tracked continuously instead of assembled in a panic before an audit.",
  proof: ["Recurring reminders", "Certification expiry tracking", "Immutable audit trail"],
  features: [
    { icon: BellRing, title: "Reminders that recur properly", description: "Annually, quarterly, on a rolling window from a start date, or on an anniversary per person. Escalation when they are missed, to somebody who can act." },
    { icon: GraduationCap, title: "Training with completion state", description: "Assign a course to a department and see who has finished it \u2014 derived from actual completions, not a self-reported checkbox." },
    { icon: FileCheck2, title: "Certifications and their expiry", description: "Store the certificate, record the expiry, and get told before it lapses rather than after. The document and the date live together." },
    { icon: ScrollText, title: "A document centre with provenance", description: "Policies and evidence with versions, owners and review dates. Every change is attributable, which is most of what an auditor is checking." },
    { icon: CalendarClock, title: "One calendar of obligations", description: "Everything due, across training, certifications and reminders, on one view. The failure mode in compliance is almost always a thing nobody was looking at." },
    { icon: ShieldCheck, title: "Questionnaires", description: "Send a structured compliance questionnaire, collect the answers against the record they belong to, and keep the responses as evidence." },
  ],
  how: {
    heading: "Start with what expires",
    blurb: "Certification dates are the cheapest thing to load and the most likely to catch something this quarter.",
    steps: [
      { title: "Import certifications", description: "Name, holder, expiry. That is enough." },
      { title: "Set the reminder lead time", description: "How long before expiry to warn." },
      { title: "Add mandatory training", description: "Assign by department." },
      { title: "Name the escalation", description: "Who hears about a miss." },
    ],
  },
  cta: { heading: "Find out what lapses next month", blurb: "Import your certificate dates and look at the calendar." },
};

export const metadata: Metadata = productMetadata(data);

export default function Page() {
  return <ProductPageTemplate data={data} />;
}
