import type { Metadata } from "next";

// Metadata lives in a layout because page.tsx is a client component and Next
// ignores a `metadata` export there. Without this the route inherited the root
// layout's title, description, and canonical — shipping as a duplicate of the
// homepage.
export const metadata: Metadata = {
  // `absolute` because the title already carries the brand; the root
  // layout's "%s | Aexy" template would otherwise render it twice.
  title: { absolute: "Security at Aexy" },
  description:
    "How Aexy handles data, authentication, and access control — and what self-hosting means for your security posture.",
  alternates: { canonical: "/security" },
};

export default function SecurityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
