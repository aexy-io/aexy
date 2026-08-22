import { Metadata } from "next";

export const metadata: Metadata = {
  // Object form, not a bare string: a bare `title` replaces the root
  // layout's `{ default, template }` instead of merging with it, which
  // strips the "| Aexy" suffix from every route below this one.
  title: { default: "Dashboard", template: "%s · Dashboard | Aexy" },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
