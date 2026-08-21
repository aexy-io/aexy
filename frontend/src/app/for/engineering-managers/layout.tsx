import type { Metadata } from "next";

// Metadata lives in a layout because page.tsx is a client component and Next
// ignores a `metadata` export there. Without this the route inherited the root
// layout's title, description, and canonical — shipping as a duplicate of the
// homepage.
export const metadata: Metadata = {
  // `absolute` because the title already carries the brand; the root
  // layout's "%s | Aexy" template would otherwise render it twice.
  title: { absolute: "Aexy for Engineering Managers" },
  description:
    "Real-time visibility into what your team is working on, data-driven sprint planning, and performance reviews grounded in actual contributions.",
  alternates: { canonical: "/for/engineering-managers" },
};

export default function ForEngineeringManagersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
