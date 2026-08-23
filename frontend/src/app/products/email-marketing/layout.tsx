import type { Metadata } from "next";
import { BreadcrumbJsonLd, ProductJsonLd } from "@/components/marketing/StructuredData";

export const metadata: Metadata = {
  title: "Email Marketing Connected to CRM and GTM Intelligence",
  description: "Use Aexy for email marketing campaigns, sequences, CRM context, GTM signals, and agent-assisted follow-up workflows.",
  alternates: { canonical: "/products/email-marketing" },
};

export default function EmailMarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProductJsonLd
        name="Email Marketing Connected to CRM and GTM Intelligence"
        description="Use Aexy for email marketing campaigns, sequences, CRM context, GTM signals, and agent-assisted follow-up workflows."
        path="/products/email-marketing"
      />
      <BreadcrumbJsonLd
        trail={[
          { name: "Email marketing", path: "/products/email-marketing" },
        ]}
      />
      {children}
    </>
  );
}
