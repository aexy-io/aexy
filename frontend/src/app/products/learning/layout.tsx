import type { Metadata } from "next";
import { BreadcrumbJsonLd, ProductJsonLd } from "@/components/marketing/StructuredData";

// Metadata lives in a layout because page.tsx is a client component and Next
// ignores a `metadata` export there. Without this the route inherited the root
// layout's title, description, and canonical — shipping as a duplicate of the
// homepage.
export const metadata: Metadata = {
  title: "Skill Gap Analysis & Learning Paths",
  description:
    "AI skill-gap analysis and personalized learning paths built on real contribution data, so L&D targets the gaps your team actually has.",
  alternates: { canonical: "/products/learning" },
};

export default function LearningLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProductJsonLd
        name="Skill Gap Analysis & Learning Paths"
        description="AI skill-gap analysis and personalized learning paths built on real contribution data, so L&D targets the gaps your team actually has."
        path="/products/learning"
      />
      <BreadcrumbJsonLd
        trail={[
          { name: "Learning", path: "/products/learning" },
        ]}
      />
      {children}
    </>
  );
}
