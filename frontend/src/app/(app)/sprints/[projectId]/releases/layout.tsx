import type { Metadata } from "next";

// `page.tsx` here is a client component, and Next ignores a `metadata` export
// in one — so the title lives in a sibling layout. Without it this route
// inherited 'Project' from its module layout, which 13 routes share, so the
// browser tab named the module and not the page.
export const metadata: Metadata = { title: "Releases" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
