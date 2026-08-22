import { Metadata } from "next";
import OnboardingLayoutClient from "./OnboardingLayoutClient";

  // Object form, not a bare string. A bare `title` *replaces* the parent's
  // `{ default, template }` object rather than merging with it, which deletes
  // the inherited template for this entire subtree — every descendant then
  // renders its own bare title with no " | Aexy" at all. /gtm/analytics
  // shipped as the literal string "Analytics".
export const metadata: Metadata = {
  title: { default: "Onboarding", template: "%s · Onboarding | Aexy" },
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OnboardingLayoutClient>{children}</OnboardingLayoutClient>;
}
