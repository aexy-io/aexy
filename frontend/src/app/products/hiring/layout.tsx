import type { Metadata } from "next";
import { BreadcrumbJsonLd, ProductJsonLd } from "@/components/marketing/StructuredData";

export const metadata: Metadata = {
  title: "Technical Hiring with AI Assessments",
  description: "Run technical hiring with skills evidence, assessments, candidate pipelines, interviews, and team context in Aexy.",
  alternates: { canonical: "/products/hiring" },
};

export default function HiringLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProductJsonLd
        name="Technical Hiring with AI Assessments"
        description="Run technical hiring with skills evidence, assessments, candidate pipelines, interviews, and team context in Aexy."
        path="/products/hiring"
      />
      <BreadcrumbJsonLd
        trail={[
          { name: "Hiring", path: "/products/hiring" },
        ]}
      />
      {children}
    </>
  );
}
