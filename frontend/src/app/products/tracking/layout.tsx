import type { Metadata } from "next";
import { BreadcrumbJsonLd, ProductJsonLd } from "@/components/marketing/StructuredData";

export const metadata: Metadata = {
  title: "Engineering Activity Tracking Without Surveillance",
  description: "Understand engineering activity, blockers, code context, and team progress without invasive surveillance using Aexy.",
  alternates: { canonical: "/products/tracking" },
};

export default function TrackingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProductJsonLd
        name="Engineering Activity Tracking Without Surveillance"
        description="Understand engineering activity, blockers, code context, and team progress without invasive surveillance using Aexy."
        path="/products/tracking"
      />
      <BreadcrumbJsonLd
        trail={[
          { name: "Tracking", path: "/products/tracking" },
        ]}
      />
      {children}
    </>
  );
}
