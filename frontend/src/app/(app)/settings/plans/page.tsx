"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Sparkles,
  Github,
  Users,
  Building2,
  Loader2,
  CheckCircle2,
  Mail,
  CreditCard,
  BarChart3,
  Clock,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSubscription, usePlans, useChangePlan, useCheckout } from "@/hooks/useSubscription";
import { BillingToggle } from "@/components/billing/BillingToggle";
import { ChangePlanModal } from "@/components/billing/ChangePlanModal";
import { PlanComparison } from "@/components/billing/PlanComparison";
import { PlanFeatures } from "@/lib/api";
import { STRIPE_ENABLED, buildSalesMailto } from "@/lib/billingMode";

// Plan display configuration — keyed by billing_model for new plans, with tier fallbacks
const planConfig: Record<string, {
  icon: any;
  color: string;
  borderColor: string;
  textColor: string;
  tagline: string;
  cta: string;
  features: string[];
}> = {
  free: {
    icon: Github,
    color: "from-emerald-500 to-cyan-500",
    borderColor: "border-emerald-500/30",
    textColor: "text-emerald-400",
    tagline: "Free",
    cta: "Get Started Free",
    features: [
      "All modules included",
      "10 repos, 10 team members",
      "Sprint & epic planning",
      "CRM, email marketing, docs",
      "GitHub integration",
      "Limited AI (50 req/day)",
    ],
  },
  per_seat: {
    icon: Users,
    color: "from-primary-500 to-primary-600",
    borderColor: "border-primary-500/50",
    textColor: "text-primary-400",
    tagline: "Per Seat",
    cta: "Upgrade",
    features: [
      "Everything in Free, plus:",
      "Unlimited repos & history",
      "AI-powered insights (all providers)",
      "500K tokens/mo included",
      "On-call scheduling",
      "Performance reviews",
    ],
  },
  flat_plus_usage: {
    icon: BarChart3,
    color: "from-amber-500 to-orange-500",
    borderColor: "border-amber-500/30",
    textColor: "text-amber-400",
    tagline: "Flat + Usage",
    cta: "Get Started",
    features: [
      "Flat monthly base fee",
      "Unlimited seats included",
      "Pay only for AI you use",
      "All providers, unlimited requests",
      "All modules & features",
      "Ideal for variable AI usage",
    ],
  },
  postpaid: {
    icon: Clock,
    color: "from-rose-500 to-pink-500",
    borderColor: "border-rose-500/30",
    textColor: "text-rose-400",
    tagline: "Postpaid",
    cta: "Set Up Postpaid",
    features: [
      "No upfront cost",
      "Pay at end of billing period",
      "Per-seat + AI usage billing",
      "All providers, unlimited requests",
      "All modules & features",
      "Ideal for growing teams",
    ],
  },
  enterprise: {
    icon: Building2,
    color: "from-purple-500 to-violet-500",
    borderColor: "border-purple-500/30",
    textColor: "text-purple-400",
    tagline: "Enterprise",
    cta: "Contact Sales",
    features: [
      "Everything in Pro, plus:",
      "SSO & SCIM",
      "Audit logs",
      "Custom data retention",
      "Dedicated support & SLA",
      "Priority roadmap input",
    ],
  },
};

function getPlanConfigKey(plan: PlanFeatures): string {
  // Use billing_model as key, fallback to tier
  const bm = plan.billing_model;
  if (bm && planConfig[bm]) return bm;
  if (planConfig[plan.tier]) return plan.tier;
  return "free";
}

function formatPlanPrice(plan: PlanFeatures, billingPeriod: "monthly" | "annual"): React.ReactNode {
  const bm = plan.billing_model;

  if (bm === "free" || (!plan.price_monthly_cents && !plan.per_seat_price_monthly_cents && !plan.base_fee_monthly_cents)) {
    return <span className="text-3xl font-bold text-foreground">Free</span>;
  }

  if (bm === "per_seat") {
    const price = billingPeriod === "annual"
      ? Math.floor(plan.per_seat_price_monthly_cents * 0.83 / 100)
      : plan.per_seat_price_monthly_cents / 100;
    return (
      <div className="flex items-baseline gap-1">
        <span className="text-muted-foreground text-xl">$</span>
        <span className="text-3xl font-bold text-foreground">{price}</span>
        <span className="text-muted-foreground text-sm">/user/mo</span>
      </div>
    );
  }

  if (bm === "flat_plus_usage") {
    const base = plan.base_fee_monthly_cents / 100;
    return (
      <div className="flex items-baseline gap-1">
        <span className="text-muted-foreground text-xl">$</span>
        <span className="text-3xl font-bold text-foreground">{base}</span>
        <span className="text-muted-foreground text-sm">/mo + usage</span>
      </div>
    );
  }

  if (bm === "postpaid") {
    if (plan.per_seat_price_monthly_cents > 0) {
      const price = plan.per_seat_price_monthly_cents / 100;
      return (
        <div className="flex items-baseline gap-1">
          <span className="text-muted-foreground text-xl">$</span>
          <span className="text-3xl font-bold text-foreground">{price}</span>
          <span className="text-muted-foreground text-sm">/seat + usage</span>
        </div>
      );
    }
    return <span className="text-3xl font-bold text-foreground">Pay after use</span>;
  }

  // Fallback
  const price = billingPeriod === "annual"
    ? Math.floor(plan.price_monthly_cents * 0.83 / 100)
    : plan.price_monthly_cents / 100;
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-muted-foreground text-xl">$</span>
      <span className="text-3xl font-bold text-foreground">{price}</span>
      <span className="text-muted-foreground text-sm">/month</span>
    </div>
  );
}

export default function PlansPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { currentWorkspaceId, isOwner } = useWorkspace();
  const { plan: currentPlan, tier: currentTier, hasSubscription, isLoading: subscriptionLoading, refetch } = useSubscription(currentWorkspaceId);
  const { plans, isLoading: plansLoading } = usePlans();
  const changePlan = useChangePlan(currentWorkspaceId);
  const checkout = useCheckout();

  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">(
    (searchParams.get("billing") as "monthly" | "annual") || "monthly"
  );
  const [selectedPlan, setSelectedPlan] = useState<PlanFeatures | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<{ type: "success" | "cancelled"; text: string } | null>(null);

  // Handle checkout redirect feedback
  useEffect(() => {
    const checkoutStatus = searchParams.get("checkout");
    if (checkoutStatus === "success") {
      setCheckoutMessage({ type: "success", text: "Your subscription has been activated! It may take a moment to update." });
      refetch();
      router.replace("/settings/plans", { scroll: false });
    } else if (checkoutStatus === "cancelled") {
      setCheckoutMessage({ type: "cancelled", text: "Checkout was cancelled. You can try again anytime." });
      router.replace("/settings/plans", { scroll: false });
    }
  }, [searchParams, refetch, router]);

  const isLoading = subscriptionLoading || plansLoading;

  const handleSelectPlan = (plan: PlanFeatures) => {
    // Check if this is the same plan+billing_model combo
    const currentBillingModel = currentPlan?.billing_model || "free";
    if (plan.billing_model === currentBillingModel && plan.tier === currentTier) return;

    // Enterprise always goes to sales. While Stripe is disabled, all paid tiers do.
    const isPaid = plan.tier !== "free" && plan.billing_model !== "free";
    if (plan.tier === "enterprise" || (!STRIPE_ENABLED && isPaid)) {
      window.location.href = buildSalesMailto({
        planTier: plan.tier,
        billingPeriod,
        workspaceId: currentWorkspaceId,
        intent: hasSubscription ? "upgrade" : "subscribe",
      });
      return;
    }

    setSelectedPlan(plan);
    setShowModal(true);
  };

  const handleConfirmChange = async () => {
    if (!selectedPlan) return;

    if (!STRIPE_ENABLED) {
      // Stripe disabled — fall back to sales mailto for any paid plan change.
      window.location.href = buildSalesMailto({
        planTier: selectedPlan.tier,
        billingPeriod,
        workspaceId: currentWorkspaceId,
        intent: hasSubscription ? "upgrade" : "subscribe",
      });
      return;
    }

    if (!hasSubscription) {
      // Free users need to go through Stripe Checkout to create a subscription
      const result = await checkout.mutateAsync({
        planTier: selectedPlan.tier,
        workspaceId: currentWorkspaceId || undefined,
        billingModel: selectedPlan.billing_model,
      });
      if (result.checkout_url) {
        window.location.href = result.checkout_url;
      }
    } else {
      // Users with an existing subscription can change plans directly
      await changePlan.mutateAsync(selectedPlan.tier);
    }
  };

  const isCurrentPlanMatch = (plan: PlanFeatures): boolean => {
    const currentBillingModel = currentPlan?.billing_model || "free";
    return plan.billing_model === currentBillingModel && plan.tier === currentTier;
  };

  const isUpgrade = (targetTier: string): boolean => {
    const tierOrder: Record<string, number> = { free: 0, pro: 1, flat_plus_usage: 1, postpaid: 1, enterprise: 2, custom: 2 };
    return (tierOrder[targetTier] ?? 1) > (tierOrder[currentTier] ?? 0);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div>
          <div className="h-6 w-44 bg-accent rounded mb-2" />
          <div className="h-4 w-72 bg-accent rounded" />
        </div>
        <div className="flex justify-center">
          <div className="h-10 w-56 bg-accent rounded-full" />
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-accent rounded-lg" />
                <div className="h-3 w-16 bg-accent rounded" />
              </div>
              <div className="h-6 w-24 bg-accent rounded" />
              <div className="h-4 w-full bg-accent rounded" />
              <div className="h-8 w-20 bg-accent rounded" />
              <div className="h-10 w-full bg-accent rounded-lg" />
              <div className="space-y-2 pt-4">
                {[1, 2, 3, 4, 5, 6].map((j) => (
                  <div key={j} className="flex items-center gap-2">
                    <div className="h-4 w-4 bg-accent rounded-full" />
                    <div className="h-3 w-36 bg-accent rounded" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Subscription Plans</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Compare plans and upgrade or downgrade your subscription
        </p>
      </div>

      {/* Checkout feedback banner */}
      {checkoutMessage && (
        <div
          className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm ${
            checkoutMessage.type === "success"
              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
              : "bg-amber-500/10 border border-amber-500/30 text-amber-400"
          }`}
        >
          <span>{checkoutMessage.text}</span>
          <button
            onClick={() => setCheckoutMessage(null)}
            className="ml-4 text-current opacity-70 hover:opacity-100"
          >
            &times;
          </button>
        </div>
      )}

      <div>
        {/* Billing Toggle */}
        <div className="mb-8">
          <BillingToggle billingPeriod={billingPeriod} onToggle={setBillingPeriod} />
        </div>

        {/* Plan Cards */}
        <div className={`grid gap-6 mb-8 ${plans.length <= 3 ? "md:grid-cols-3" : plans.length <= 4 ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"}`}>
          {plans.map((plan, index) => {
            const configKey = getPlanConfigKey(plan);
            const config = planConfig[configKey];
            const Icon = config?.icon || Github;
            const isCurrent = isCurrentPlanMatch(plan);

            return (
              <motion.div
                key={`${plan.billing_model}-${plan.tier}-${plan.id}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="relative"
              >
                {/* Current Plan Badge */}
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <div className="px-3 py-1 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-xs font-medium rounded-full shadow-lg">
                      Current Plan
                    </div>
                  </div>
                )}

                <div
                  className={`h-full bg-card border rounded-xl p-6 transition-all ${
                    isCurrent
                      ? "border-emerald-500/50 shadow-lg shadow-emerald-500/10"
                      : `${config?.borderColor || "border-border"} hover:border-border`
                  }`}
                >
                  {/* Plan Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2 bg-gradient-to-br ${config?.color || "from-slate-500 to-slate-600"} rounded-lg`}>
                      <Icon className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <span className={`text-xs font-semibold tracking-wider ${config?.textColor || "text-muted-foreground"}`}>
                        {config?.tagline?.toUpperCase() || plan.billing_model?.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-foreground mb-2">{plan.name}</h3>
                  <p className="text-muted-foreground text-sm mb-4">{plan.description}</p>

                  {/* Price */}
                  <div className="mb-6">
                    {formatPlanPrice(plan, billingPeriod)}
                  </div>

                  {/* CTA Button */}
                  {!isCurrent && currentWorkspaceId && !isOwner ? (
                    <div className="w-full py-2.5 px-4 rounded-lg text-sm text-center text-slate-500 bg-slate-800 border border-slate-700">
                      Only the workspace owner can change plans
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSelectPlan(plan)}
                      disabled={isCurrent || changePlan.isPending || checkout.isPending}
                      className={`w-full py-2.5 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                        isCurrent
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default"
                          : `bg-gradient-to-r ${config?.color || "from-slate-600 to-slate-700"} text-white hover:opacity-90`
                      } disabled:opacity-50`}
                    >
                      {(changePlan.isPending || checkout.isPending) && selectedPlan?.id === plan.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isCurrent ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Current Plan
                        </>
                      ) : plan.tier === "enterprise" && plan.billing_model === "per_seat" ? (
                        <>
                          <Mail className="h-4 w-4" />
                          Contact Sales
                        </>
                      ) : (
                        config?.cta || `Switch to ${plan.name}`
                      )}
                    </button>
                  )}

                  {/* Features */}
                  <div className="mt-6 space-y-2">
                    {(config?.features || []).map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className={`h-4 w-4 ${config?.textColor || "text-muted-foreground"} flex-shrink-0 mt-0.5`} />
                        <span className="text-foreground text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Plan Comparison (when selecting a different plan) */}
        {selectedPlan && selectedPlan.tier !== currentTier && !showModal && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <PlanComparison
              currentPlan={currentPlan ?? null}
              targetPlan={selectedPlan}
              isUpgrade={isUpgrade(selectedPlan.tier)}
            />
          </motion.div>
        )}

        {/* Help Text */}
        <div className="text-center">
          <p className="text-muted-foreground text-sm">
            Questions about plans?{" "}
            <a
              href="mailto:billing@aexy.io"
              className="text-primary-400 hover:text-primary-300 transition"
            >
              Contact billing@aexy.io
            </a>
          </p>
        </div>
      </div>

      {/* Change Plan Modal */}
      {selectedPlan && (
        <ChangePlanModal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false);
            setSelectedPlan(null);
          }}
          onConfirm={handleConfirmChange}
          currentPlan={currentPlan ?? null}
          targetPlan={selectedPlan}
          isUpgrade={isUpgrade(selectedPlan.tier)}
          billingPeriod={billingPeriod}
        />
      )}
    </div>
  );
}
