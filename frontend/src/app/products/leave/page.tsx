import type { Metadata } from "next";
import { Palmtree, CheckSquare, Scale, CalendarDays, Users, Settings2 } from "lucide-react";

import {
  ProductPageTemplate,
  productMetadata,
  type ProductPageData,
} from "@/components/marketing/ProductPageTemplate";

const data: ProductPageData = {
  slug: "leave",
  eyebrow: "Leave",
  title: "Time off without the spreadsheet and the chasing",
  subtitle:
    "Policies, balances, approvals and a team calendar \u2014 in the same place as the sprint board, so a booked week is visible where the planning happens.",
  proof: ["Accrual and carry-over", "Multi-step approval", "Visible on the team calendar"],
  features: [
    { icon: Settings2, title: "Policies per type", description: "Annual, sick, parental, unpaid, or whatever your handbook calls them \u2014 each with its own accrual, carry-over cap and notice period." },
    { icon: Scale, title: "Balances that reconcile", description: "Accrued, taken, booked and remaining, computed rather than typed. If the number is wrong you can see which entry made it wrong." },
    { icon: CheckSquare, title: "Approvals with a route", description: "Manager, then whoever else the policy needs. Requests do not sit in an inbox waiting for somebody to remember." },
    { icon: CalendarDays, title: "One team calendar", description: "Who is away, when, overlapping with the sprint you are about to plan. Capacity planning that ignores leave is planning fiction." },
    { icon: Users, title: "Coverage before approval", description: "The approver sees who else is off that week before deciding, which is the check that usually happens too late." },
    { icon: Palmtree, title: "Public holidays by location", description: "Holiday calendars per country, so balances and working days are right for a distributed team without manual adjustment." },
  ],
  how: {
    heading: "Set it up once a year",
    blurb: "Most of the work is describing your existing policy accurately. After that it runs.",
    steps: [
      { title: "Define the types", description: "Accrual, cap and notice per type." },
      { title: "Load current balances", description: "One import at the start." },
      { title: "Set approval routes", description: "Per type or per department." },
      { title: "Add holiday calendars", description: "By country, for balances." },
    ],
  },
  cta: { heading: "Give everyone a balance they trust", blurb: "Define one policy and see the numbers reconcile." },
};

export const metadata: Metadata = productMetadata(data);

export default function Page() {
  return <ProductPageTemplate data={data} />;
}
