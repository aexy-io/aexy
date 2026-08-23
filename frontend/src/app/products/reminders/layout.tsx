import type { Metadata } from "next";
import { BreadcrumbJsonLd, ProductJsonLd } from "@/components/marketing/StructuredData";

// Metadata lives in a layout because page.tsx is a client component and Next
// ignores a `metadata` export there. Without this the route inherited the root
// layout's title, description, and canonical — shipping as a duplicate of the
// homepage.
export const metadata: Metadata = {
  title: "Compliance Reminders & Recurring Tasks",
  description:
    "Track recurring compliance commitments, scheduled reviews, and periodic tasks with smart assignment, escalation workflows, and evidence tracking.",
  alternates: { canonical: "/products/reminders" },
};

export default function RemindersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProductJsonLd
        name="Compliance Reminders & Recurring Tasks"
        description="Track recurring compliance commitments, scheduled reviews, and periodic tasks with smart assignment, escalation workflows, and evidence tracking."
        path="/products/reminders"
      />
      <BreadcrumbJsonLd
        trail={[
          { name: "Reminders", path: "/products/reminders" },
        ]}
      />
      {children}
    </>
  );
}
