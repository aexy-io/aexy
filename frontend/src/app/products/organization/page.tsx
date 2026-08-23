import type { Metadata } from "next";
import { Network, Users, KeySquare, GitFork, UserSquare2, Building } from "lucide-react";

import {
  ProductPageTemplate,
  productMetadata,
  type ProductPageData,
} from "@/components/marketing/ProductPageTemplate";

const data: ProductPageData = {
  slug: "organization",
  eyebrow: "Organization",
  title: "The org chart that decides what people can open",
  subtitle:
    "Departments, teams, positions and the reporting tree \u2014 wired to app access, so moving somebody changes their tools instead of starting a ticket.",
  proof: ["Access follows the department", "Vacant positions are real records", "Teams and departments kept separate"],
  features: [
    { icon: GitFork, title: "A real tree", description: "Departments nest. Reparent one and the subtree moves with it, and access re-resolves for everybody underneath \u2014 which is the part that is usually done by hand." },
    { icon: KeySquare, title: "Access profiles", description: "A department carries a bundle of app access. Put someone in Engineering and their sidebar is the engineering sidebar; move them to Sales and it changes the same day." },
    { icon: UserSquare2, title: "Positions, not just people", description: "A seat exists whether or not somebody is in it. That is what lets headcount reporting work before a hire and what Hiring opens a requisition against." },
    { icon: Users, title: "Teams are a different axis", description: "Departments answer where you sit; teams answer who you work with. On-call rotations follow teams, access follows departments, and conflating them is the usual mistake." },
    { icon: Building, title: "A directory that is current", description: "Because it is derived from the same records that grant access, the directory cannot drift from reality the way an exported list does." },
    { icon: Network, title: "One chart, one source", description: "The chart is the data. There is no separate diagram to update after a reorg." },
  ],
  how: {
    heading: "Model it once",
    blurb: "The payoff is at the next reorg, when access changes are a drag rather than a project.",
    steps: [
      { title: "Create the departments", description: "Nested, with owners." },
      { title: "Attach access profiles", description: "Which apps each one gets." },
      { title: "Add positions", description: "Filled and vacant." },
      { title: "Form teams", description: "Across departments, for delivery." },
    ],
  },
  cta: { heading: "Make a move change access", blurb: "Model one department and reparent it." },
};

export const metadata: Metadata = productMetadata(data);

export default function Page() {
  return <ProductPageTemplate data={data} />;
}
