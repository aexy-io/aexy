import { Metadata } from "next";
import { AppAccessGuard } from "@/components/guards/AppAccessGuard";

export const metadata: Metadata = {
  // Object form, not a bare string: a bare `title` replaces the root
  // layout's `{ default, template }` instead of merging with it, which
  // strips the "| Aexy" suffix from every route below this one.
  title: { default: "CRM", template: "%s · CRM | Aexy" },
};

export default function CRMLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppAccessGuard appId="crm">{children}</AppAccessGuard>;
}
