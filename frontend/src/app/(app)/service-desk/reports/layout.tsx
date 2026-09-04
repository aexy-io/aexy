import type { Metadata } from "next";

// `page.tsx` here is a client component, and Next ignores a `metadata` export
// in one — so the title lives in a sibling layout. Object form, not a bare
// string: a bare `title` replaces the parent's `{ default, template }` rather
// than merging with it, deleting the inherited template for the whole subtree.
export const metadata: Metadata = { title: { default: "Reports", template: "%s · Reports | Aexy" } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
