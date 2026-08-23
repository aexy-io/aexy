import type { Metadata } from "next";
import { BreadcrumbJsonLd, ProductJsonLd } from "@/components/marketing/StructuredData";

export const metadata: Metadata = {
  title: "Performance Reviews Connected to Real Work",
  description: "Run performance reviews, feedback, goals, growth plans, and people workflows connected to engineering and company context in Aexy.",
  alternates: { canonical: "/products/reviews" },
};

export default function ReviewsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProductJsonLd
        name="Performance Reviews Connected to Real Work"
        description="Run performance reviews, feedback, goals, growth plans, and people workflows connected to engineering and company context in Aexy."
        path="/products/reviews"
      />
      <BreadcrumbJsonLd
        trail={[
          { name: "Reviews", path: "/products/reviews" },
        ]}
      />
      {children}
    </>
  );
}
