import { Metadata } from "next";

  // Object form, not a bare string. A bare `title` *replaces* the parent's
  // `{ default, template }` object rather than merging with it, which deletes
  // the inherited template for this entire subtree — every descendant then
  // renders its own bare title with no " | Aexy" at all. /gtm/analytics
  // shipped as the literal string "Analytics".
export const metadata: Metadata = {
  title: { default: "GTM Intelligence", template: "%s · GTM Intelligence | Aexy" },
};

export default function GTMLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
