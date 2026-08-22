import type { Metadata } from "next";
import { BarChart3, TrendingUp, Users, GitPullRequest, Gauge, CalendarClock } from "lucide-react";

import {
  ProductPageTemplate,
  productMetadata,
  type ProductPageData,
} from "@/components/marketing/ProductPageTemplate";

const data: ProductPageData = {
  slug: "analytics",
  eyebrow: "Insights & Analytics",
  title: "Engineering metrics that survive being questioned",
  subtitle:
    "Velocity, review load, PR size, code churn and delivery forecasts \u2014 computed from the repositories you already have, with the working behind every number.",
  proof: ["Derived from real git history", "Per-developer drill-downs", "Snapshot history"],
  features: [
    {
      icon: BarChart3,
      title: "Team and individual views",
      description:
        "Start at the team, open one person, see the same metric decomposed. Every roll-up is a link down to the commits and pull requests it came from.",
    },
    {
      icon: GitPullRequest,
      title: "Review load, not just output",
      description:
        "Who reviews, how fast, and how big the changes are. PR size distribution and review latency explain most of what velocity charts leave out.",
    },
    {
      icon: TrendingUp,
      title: "Forecasts with an error bar",
      description:
        "Velocity forecasting projects a sprint's landing zone from the history rather than the plan, and shows how wide the range is instead of asserting a date.",
    },
    {
      icon: Gauge,
      title: "Health scores you can argue with",
      description:
        "A composite score is only useful if you can see its parts. Each contributing signal is listed with its weight, including the ones that hurt.",
    },
    {
      icon: Users,
      title: "Attribution that handles reality",
      description:
        "Ghost contributors, unmatched emails and merged accounts are ordinary. Commits can be claimed and reattributed, and the metrics recompute.",
    },
    {
      icon: CalendarClock,
      title: "Snapshots over time",
      description:
        "Periods are snapshotted, so last quarter's numbers do not silently change when a repository is reconnected or a developer record is merged.",
    },
  ],
  how: {
    heading: "Connect a repository, get a baseline",
    blurb: "There is nothing to instrument and no agent to install. The history already exists.",
    steps: [
      { title: "Connect GitHub", description: "Pick the repositories in scope." },
      { title: "Wait for the backfill", description: "History is imported, not sampled." },
      { title: "Claim commits", description: "Resolve unmatched authors once." },
      { title: "Set the period", description: "Weekly, monthly or per sprint." },
    ],
  },
  cta: {
    heading: "Measure delivery without a spreadsheet",
    blurb: "Connect one repository and see the first period fill in.",
  },
};

export const metadata: Metadata = productMetadata(data);

export default function Page() {
  return <ProductPageTemplate data={data} />;
}
