import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sprint Planning Software with AI Capacity Planning",
  description: "Plan sprints with real capacity, GitHub/Jira/Linear context, tickets, epics, velocity insights, and AI-assisted assignment in Aexy.",
};

export default function PlanningLayout({ children }: { children: React.ReactNode }) {
  return children;
}
