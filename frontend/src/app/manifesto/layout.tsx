import type { Metadata } from "next";

// Metadata lives in a layout because page.tsx is a client component and Next
// ignores a `metadata` export there. Without this the route inherited the root
// layout's title, description, and canonical — shipping as a duplicate of the
// homepage.
export const metadata: Metadata = {
  title: "The Engineering OS Manifesto",
  description:
    "What we believe about company software: open source by default, context that survives tool boundaries, and agents with a paper trail.",
  alternates: { canonical: "/manifesto" },
};

export default function ManifestoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
