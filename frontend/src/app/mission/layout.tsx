import type { Metadata } from "next";

// Metadata lives in a layout because page.tsx is a client component and Next
// ignores a `metadata` export there. Without this the route inherited the root
// layout's title, description, and canonical — shipping as a duplicate of the
// homepage.
export const metadata: Metadata = {
  title: "Our Mission",
  description:
    "Why we're building an open, self-hostable company operating system instead of another closed SaaS silo.",
  alternates: { canonical: "/mission" },
};

export default function MissionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
