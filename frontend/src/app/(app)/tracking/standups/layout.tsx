import type { Metadata } from "next";

// `page.tsx` here is a client component, and Next ignores a `metadata` export
// in one — so the title lives in a sibling layout. Without it this route
// inherited 'Tracking' from its module layout, which 8 routes share, so the
// browser tab named the module and not the page.
  // Object form, not a bare string. A bare `title` *replaces* the parent's
  // `{ default, template }` object rather than merging with it, which deletes
  // the inherited template for this entire subtree — every descendant then
  // renders its own bare title with no " | Aexy" at all. /gtm/analytics
  // shipped as the literal string "Analytics".
export const metadata: Metadata = { title: { default: "Standups", template: "%s · Standups | Aexy" } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
