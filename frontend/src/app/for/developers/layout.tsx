import type { Metadata } from "next";

// Metadata lives in a layout because page.tsx is a client component and Next
// ignores a `metadata` export there. Without this the route inherited the root
// layout's title, description, and canonical — shipping as a duplicate of the
// homepage.
export const metadata: Metadata = {
  // `absolute` because the title already carries the brand; the root
  // layout's "%s | Aexy" template would otherwise render it twice.
  title: { absolute: "Aexy for Developers — Open Source & Keyboard-First" },
  description:
    "Engineering tools that don't treat you as a resource to monitor. Open source, self-hostable, keyboard-first, and honest about what it measures.",
  alternates: { canonical: "/for/developers" },
};

export default function ForDevelopersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
