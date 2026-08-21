import type { Metadata } from "next";

// Metadata lives in a layout because page.tsx is a client component and Next
// ignores a `metadata` export there. Without this the route inherited the root
// layout's title, description, and canonical — shipping as a duplicate of the
// homepage.
export const metadata: Metadata = {
  // `absolute` because the title already carries the brand; the root
  // layout's "%s | Aexy" template would otherwise render it twice.
  title: { absolute: "Aexy for People Ops — HR Engineering Teams Trust" },
  description:
    "Hiring, reviews, and L&D for technical teams, based on real contribution data engineers respect. Open source and self-hostable.",
  alternates: { canonical: "/for/people-ops" },
};

export default function ForPeopleOpsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
