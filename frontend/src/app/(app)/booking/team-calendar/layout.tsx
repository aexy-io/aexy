import type { Metadata } from "next";

// `page.tsx` here is a client component, and Next ignores a `metadata` export in
// one — so the title lives in a sibling layout. Without it this route inherited
// the root layout's marketing title, and the browser tab read "Aexy — AI Company
// OS for Engineering, CRM, HR & GTM" instead of naming the page.
export const metadata: Metadata = { title: "Team Calendar" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
