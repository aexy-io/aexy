import type { Metadata } from "next";
import { BreadcrumbJsonLd, ProductJsonLd } from "@/components/marketing/StructuredData";

// Metadata lives in a layout because page.tsx is a client component and Next
// ignores a `metadata` export there. Without this the route inherited the root
// layout's title, description, and canonical — shipping as a duplicate of the
// homepage.
export const metadata: Metadata = {
  title: "Uptime Monitoring That Opens Tickets",
  description:
    "Monitor endpoints, alert on downtime, and turn incidents into tickets automatically. Uptime monitoring wired into the rest of your engineering workflow.",
  alternates: { canonical: "/products/uptime" },
};

export default function UptimeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProductJsonLd
        name="Uptime Monitoring That Opens Tickets"
        description="Monitor endpoints, alert on downtime, and turn incidents into tickets automatically. Uptime monitoring wired into the rest of your engineering workflow."
        path="/products/uptime"
      />
      <BreadcrumbJsonLd
        trail={[
          { name: "Uptime", path: "/products/uptime" },
        ]}
      />
      {children}
    </>
  );
}
