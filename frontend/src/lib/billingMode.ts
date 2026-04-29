// Stripe checkout / customer portal is gated behind NEXT_PUBLIC_STRIPE_ENABLED.
// While Stripe is being set up we run in "offline" mode: paid-tier CTAs open a
// mailto to sales@aexy.io instead of hitting the billing API. Flip this flag to
// "true" once Stripe is wired up to restore the in-product checkout flow.
export const STRIPE_ENABLED = process.env.NEXT_PUBLIC_STRIPE_ENABLED === "true";

export const SALES_EMAIL = "sales@aexy.io";

export function buildSalesMailto(opts: {
  planTier: string;
  billingPeriod?: "monthly" | "annual";
  workspaceId?: string | null;
  intent?: "subscribe" | "upgrade" | "manage";
}) {
  const { planTier, billingPeriod, workspaceId, intent = "subscribe" } = opts;
  const planLabel = planTier.charAt(0).toUpperCase() + planTier.slice(1);
  const action =
    intent === "manage"
      ? `manage billing for our ${planLabel} plan`
      : intent === "upgrade"
      ? `upgrade to the ${planLabel} plan`
      : `get started with the ${planLabel} plan`;

  const subject = `${planLabel} plan inquiry`;
  const lines = [
    "Hi Aexy team,",
    "",
    `I'd like to ${action}${billingPeriod ? ` (${billingPeriod} billing)` : ""}.`,
    workspaceId ? `Workspace: ${workspaceId}` : "",
    "",
    "Thanks!",
  ].filter((line) => line !== "");

  return `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}
