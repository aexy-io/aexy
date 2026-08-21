import type { Metadata } from "next";

// Metadata lives in a layout because page.tsx is a client component and Next
// ignores a `metadata` export there. Without this the route inherited the root
// layout's title, description, and canonical — shipping as a duplicate of the
// homepage.
export const metadata: Metadata = {
  title: "Our Story",
  description:
    "How Aexy started: engineers tired of stitching a CRM, a tracker, a wiki, and five integrations into something that still lost the context.",
  alternates: { canonical: "/story" },
};

export default function StoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
