import type { Metadata } from "next";
import { BreadcrumbJsonLd, ProductJsonLd } from "@/components/marketing/StructuredData";

export const metadata: Metadata = {
  title: "Issue Tracking Connected to Code, CRM, and Docs",
  description: "Aexy ticketing connects issues, code, CRM records, docs, planning, workflows, and AI agents for technical teams.",
  alternates: { canonical: "/products/tickets" },
};

export default function TicketsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProductJsonLd
        name="Issue Tracking Connected to Code, CRM, and Docs"
        description="Aexy ticketing connects issues, code, CRM records, docs, planning, workflows, and AI agents for technical teams."
        path="/products/tickets"
      />
      <BreadcrumbJsonLd
        trail={[
          { name: "Tickets", path: "/products/tickets" },
        ]}
      />
      {children}
    </>
  );
}
