import type { Metadata } from "next";
import { BreadcrumbJsonLd, ProductJsonLd } from "@/components/marketing/StructuredData";

export const metadata: Metadata = {
  title: "Company Docs and Knowledge Graph",
  description: "Create connected documentation, files, knowledge graph context, and agent-readable company memory inside the Aexy company OS.",
  alternates: { canonical: "/products/docs" },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProductJsonLd
        name="Company Docs and Knowledge Graph"
        description="Create connected documentation, files, knowledge graph context, and agent-readable company memory inside the Aexy company OS."
        path="/products/docs"
      />
      <BreadcrumbJsonLd
        trail={[
          { name: "Docs", path: "/products/docs" },
        ]}
      />
      {children}
    </>
  );
}
