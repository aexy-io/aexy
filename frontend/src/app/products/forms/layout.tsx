import type { Metadata } from "next";
import { BreadcrumbJsonLd, ProductJsonLd } from "@/components/marketing/StructuredData";

// Metadata lives in a layout because page.tsx is a client component and Next
// ignores a `metadata` export there. Without this the route inherited the root
// layout's title, description, and canonical — shipping as a duplicate of the
// homepage.
export const metadata: Metadata = {
  title: "Form Builder with Conditional Logic",
  description:
    "Drag-and-drop form builder for intake forms, surveys, and bug reports. Conditional logic, integrations, and analytics with no code.",
  alternates: { canonical: "/products/forms" },
};

export default function FormsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProductJsonLd
        name="Form Builder with Conditional Logic"
        description="Drag-and-drop form builder for intake forms, surveys, and bug reports. Conditional logic, integrations, and analytics with no code."
        path="/products/forms"
      />
      <BreadcrumbJsonLd
        trail={[
          { name: "Forms", path: "/products/forms" },
        ]}
      />
      {children}
    </>
  );
}
