import type { Metadata } from "next";
import { Phone, CalendarRange, Repeat2, ArrowLeftRight, CalendarCheck, Users } from "lucide-react";

import {
  ProductPageTemplate,
  productMetadata,
  type ProductPageData,
} from "@/components/marketing/ProductPageTemplate";

const data: ProductPageData = {
  slug: "oncall",
  eyebrow: "On-Call",
  title: "Rotations next to the incidents they answer",
  subtitle:
    "Per-team schedules, swaps, overrides and calendar sync \u2014 in the same product as the monitors that page them and the tickets they create.",
  proof: ["Per-team rotations", "Swap requests", "Google Calendar sync"],
  features: [
    { icon: CalendarRange, title: "Schedules, not rules", description: "A rotation is a list of real shifts with real people on them. Generate a run in bulk, then edit the one week that is different \u2014 without fighting a recurrence expression." },
    { icon: Phone, title: "Who is on, right now", description: "One answer per team, plus who is next \u2014 so the display says \u201cnobody until Monday 09:00\u201d instead of just \u201cnobody\u201d." },
    { icon: ArrowLeftRight, title: "Swaps with a handshake", description: "Ask a colleague to take a shift; it changes when they accept. Admin overrides exist too, and are recorded as overrides rather than disguised as agreement." },
    { icon: Users, title: "Scoped to teams", description: "Four teams means four independent rotations. The overview reads across all of them so nobody has to check each one." },
    { icon: CalendarCheck, title: "In the calendar people actually use", description: "Push the rotation to Google Calendar so a shift appears where somebody will see it before it starts." },
    { icon: Repeat2, title: "Wired to Uptime", description: "A failing monitor opens an incident, and the incident knows who is carrying the pager. The connection is not a webhook you maintain." },
  ],
  how: {
    heading: "Cover one team first",
    blurb: "On-call is off until you turn it on, so nothing pages anybody while you set it up.",
    steps: [
      { title: "Enable it for a team", description: "Off by default, deliberately." },
      { title: "Generate a rotation", description: "Bulk-create the shifts." },
      { title: "Sync the calendar", description: "So people see it coming." },
      { title: "Connect Uptime", description: "Incidents find the holder." },
    ],
  },
  cta: { heading: "Know who has the pager", blurb: "Turn it on for one team and generate a month." },
};

export const metadata: Metadata = productMetadata(data);

export default function Page() {
  return <ProductPageTemplate data={data} />;
}
