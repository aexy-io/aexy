import { Metadata } from "next";
import { AppAccessGuard } from "@/components/guards/AppAccessGuard";

  // Object form, not a bare string. A bare `title` *replaces* the parent's
  // `{ default, template }` object rather than merging with it, which deletes
  // the inherited template for this entire subtree — every descendant then
  // renders its own bare title with no " | Aexy" at all. /gtm/analytics
  // shipped as the literal string "Analytics".
export const metadata: Metadata = {
  title: { default: "Tracking", template: "%s · Tracking | Aexy" },
  description: "Track your daily progress, time, and blockers",
};

export default function TrackingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppAccessGuard appId="tracking">{children}</AppAccessGuard>;
}
