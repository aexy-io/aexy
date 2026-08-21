import type { Metadata } from "next";
import { BreadcrumbJsonLd, ProductJsonLd } from "@/components/marketing/StructuredData";

export const metadata: Metadata = {
  title: "Sprint Planning Software with AI Capacity Planning",
  description: "Plan sprints with real capacity, GitHub/Jira/Linear context, tickets, epics, velocity insights, and AI-assisted assignment in Aexy.",
  alternates: { canonical: "/products/planning" },
};

export default function PlanningLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProductJsonLd
        name="Sprint Planning Software with AI Capacity Planning"
        description="Plan sprints with real capacity, GitHub/Jira/Linear context, tickets, epics, velocity insights, and AI-assisted assignment in Aexy."
        path="/products/planning"
      />
      <BreadcrumbJsonLd
        trail={[
          { name: "Planning", path: "/products/planning" },
        ]}
      />
      {children}
    </>
  );
}
