import type { Metadata } from "next";

// `page.tsx` here is a client component, and Next ignores a `metadata` export in
// one — so the title lives in a sibling layout. Without it this route inherited
// the root layout's marketing title, and the browser tab read "Aexy — AI Company
// OS for Engineering, CRM, HR & GTM" instead of naming the page.
export const metadata: Metadata = {
  // Object form for the same reason the module layout uses one: a bare
  // string here would replace the parent title object and strip the
  // suffix from every route below. The template stays the module's
  // ("· Settings") rather than introducing a second level of nesting.
  title: { default: "AI & Providers", template: "%s · Settings | Aexy" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
