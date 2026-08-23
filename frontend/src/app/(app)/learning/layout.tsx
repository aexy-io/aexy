import { Metadata } from "next";
import { AppAccessGuard } from "@/components/guards/AppAccessGuard";

  // Object form, not a bare string. A bare `title` *replaces* the parent's
  // `{ default, template }` object rather than merging with it, which deletes
  // the inherited template for this entire subtree — every descendant then
  // renders its own bare title with no " | Aexy" at all. /gtm/analytics
  // shipped as the literal string "Analytics".
export const metadata: Metadata = {
  title: { default: "Learning", template: "%s · Learning | Aexy" },
};

export default function LearningLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppAccessGuard appId="learning">{children}</AppAccessGuard>;
}
