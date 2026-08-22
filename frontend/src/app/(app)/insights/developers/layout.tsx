import type { Metadata } from "next";

// `page.tsx` here is a client component, and Next ignores a `metadata` export in
// one — so the title lives in a sibling layout. Without it the tab read
// "Insights | Aexy", inherited from the module layout, which is true of eleven
// other pages under /insights and so names none of them.
  // Object form, not a bare string. A bare `title` *replaces* the parent's
  // `{ default, template }` object rather than merging with it, which deletes
  // the inherited template for this entire subtree — every descendant then
  // renders its own bare title with no " | Aexy" at all. /gtm/analytics
  // shipped as the literal string "Analytics".
export const metadata: Metadata = { title: { default: "Developers", template: "%s · Developers | Aexy" } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
