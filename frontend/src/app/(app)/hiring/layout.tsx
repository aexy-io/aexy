import { Metadata } from "next";
import { AppAccessGuard } from "@/components/guards/AppAccessGuard";
import HiringLayoutClient from "./HiringLayoutClient";

  // Object form, not a bare string. A bare `title` *replaces* the parent's
  // `{ default, template }` object rather than merging with it, which deletes
  // the inherited template for this entire subtree — every descendant then
  // renders its own bare title with no " | Aexy" at all. /gtm/analytics
  // shipped as the literal string "Analytics".
export const metadata: Metadata = {
  title: { default: "Hiring", template: "%s · Hiring | Aexy" },
};

export default function HiringLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppAccessGuard appId="hiring">
      <HiringLayoutClient>{children}</HiringLayoutClient>
    </AppAccessGuard>
  );
}
