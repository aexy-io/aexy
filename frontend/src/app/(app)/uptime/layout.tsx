import type { Metadata } from "next";

// `page.tsx` here is a client component, and Next ignores a `metadata` export in
// one — so the title lives in a sibling layout. Without it this route inherited
// the root layout's marketing title, and the browser tab read "Aexy — AI Company
// OS for Engineering, CRM, HR & GTM" instead of naming the page.
export const metadata: Metadata = {
  // Object form, not a bare string. A plain `title` here *replaces* the
  // root layout's `{ default, template }`, which deletes the "| Aexy"
  // suffix for every route below this one — /uptime/new came out as a
  // bare "New …" with no product name at all. Defining a template here
  // restores it and adds this module's own context.
  title: { default: "Uptime", template: "%s · Uptime | Aexy" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
