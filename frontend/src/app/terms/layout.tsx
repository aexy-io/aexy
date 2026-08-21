import type { Metadata } from "next";

// Metadata lives in a layout because page.tsx is a client component and Next
// ignores a `metadata` export there. Without this the route inherited the root
// layout's title, description, and canonical — shipping as a duplicate of the
// homepage.
export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that govern use of Aexy's cloud product and the licensing of the open-source edition.",
  alternates: { canonical: "/terms" },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
