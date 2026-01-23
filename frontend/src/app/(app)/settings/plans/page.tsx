"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Sparkles,
  Github,
  Users,
  Building2,
  Loader2,
  CheckCircle2,
  Mail,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSubscription, usePlans, useChangePlan } from "@/hooks/useSubscription";
import { BillingToggle } from "@/components/billing/BillingToggle";
import { ChangePlanModal } from "@/components/billing/ChangePlanModal";
import { PlanComparison } from "@/components/billing/PlanComparison";
import { PlanFeatures } from "@/lib/api";

// Plan display configuration
const planConfig = {
  free: {
    icon: Github,
    color: "from-emerald-500 to-cyan-500",
    borderColor: "border-emerald-500/30",
    textColor: "text-emerald-400",
    tagline: "Open Source",
    cta: "Get Started Free",
    features: [
      "Core Engineering OS",
      "Developer profiles",
      "Sprint & epic planning",
      "Basic CRM",
      "GitHub integration",
      "Community support",
    ],
  },
  pro: {
    icon: Users,
    color: "from-primary-500 to-primary-600",
    borderColor: "border-primary-500/50",
    textColor: "text-primary-400",
    tagline: "Team",
    cta: "Upgrade to Pro",
    features: [
      "Everything in Free, plus:",
      "Hosted cloud version",
      "AI-powered insights",
      "On-call scheduling",
      "Performance reviews",
      "Advanced dashboards",
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

export default function PlansPage() {
  const searchParams = useSearchParams();
  const { currentWorkspaceId } = useWorkspace();
  const { plan: currentPlan, tier: currentTier, isLoading: subscriptionLoading } = useSubscription(currentWorkspaceId);
  const { plans, isLoading: plansLoading } = usePlans();
  const changePlan = useChangePlan(currentWorkspaceId);

  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">(
    (searchParams.get("billing") as "monthly" | "annual") || "monthly"
  );
  const [selectedPlan, setSelectedPlan] = useState<PlanFeatures | null>(null);
  const [showModal, setShowModal] = useState(false);

  const isLoading = subscriptionLoading || plansLoading;

  const handleSelectPlan = (plan: PlanFeatures) => {
    if (plan.tier === currentTier) return;
    if (plan.tier === "enterprise") {
      window.location.href = "mailto:sales@aexy.io?subject=Enterprise%20Inquiry";
      return;
    }
    setSelectedPlan(plan);
    setShowModal(true);
  };

  const handleConfirmChange = async () => {
    if (!selectedPlan) return;
    await changePlan.mutateAsync(selectedPlan.tier);
  };

  const isUpgrade = (targetTier: string): boolean => {
    const tierOrder = { free: 0, pro: 1, enterprise: 2 };
    return tierOrder[targetTier as keyof typeof tierOrder] > tierOrder[currentTier as keyof typeof tierOrder];
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary-500 mx-auto mb-4" />
          <p className="text-slate-400">Loading plans...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/settings"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">Subscription Plans</h1>
                <p className="text-slate-400 text-sm">
                  Compare plans and upgrade or downgrade your subscription
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Billing Toggle */}
        <div className="mb-8">
          <BillingToggle billingPeriod={billingPeriod} onToggle={setBillingPeriod} />
        </div>

        {/* Plan Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {plans.map((plan, index) => {
            const config = planConfig[plan.tier as keyof typeof planConfig];
            const Icon = config?.icon || Github;
            const isCurrentPlan = plan.tier === currentTier;
            const displayPrice = billingPeriod === "annual"
              ? Math.floor(plan.price_monthly_cents * 0.83 / 100)
              : plan.price_monthly_cents / 100;
            const isCustomPrice = plan.price_monthly_cents === 0 && plan.tier === "enterprise";

            return (
              <motion.div
                key={plan.tier}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className={`relative ${plan.tier === "pro" ? "md:-mt-2 md:mb-2" : ""}`}
              >
                {/* Current Plan Badge */}
                {isCurrentPlan && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <div className="px-3 py-1 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-xs font-medium rounded-full shadow-lg">
                      Current Plan
                    </div>
                  </div>
                )}

                {/* Popular Badge */}
                {plan.tier === "pro" && !isCurrentPlan && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <div className="px-3 py-1 bg-gradient-to-r from-primary-500 to-primary-600 text-white text-xs font-medium rounded-full shadow-lg">
                      Most Popular
                    </div>
                  </div>
                )}

                <div
                  className={`h-full bg-slate-800 border rounded-xl p-6 transition-all ${
                    isCurrentPlan
                      ? "border-emerald-500/50 shadow-lg shadow-emerald-500/10"
                      : plan.tier === "pro"
                      ? "border-primary-500/50"
                      : "border-slate-700 hover:border-slate-600"
                  }`}
                >
                  {/* Plan Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2 bg-gradient-to-br ${config?.color || "from-slate-500 to-slate-600"} rounded-lg`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <span className={`text-xs font-semibold tracking-wider ${config?.textColor || "text-slate-400"}`}>
                        {config?.tagline?.toUpperCase() || plan.tier.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                  <p className="text-slate-400 text-sm mb-4">{plan.description}</p>

                  {/* Price */}
                  <div className="mb-6">
                    {isCustomPrice ? (
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-white">Custom</span>
                      </div>
                    ) : plan.price_monthly_cents === 0 ? (
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-white">Free</span>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span className="text-slate-400 text-xl">$</span>
                        <motion.span
                          key={displayPrice}
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-3xl font-bold text-white"
                        >
                          {displayPrice}
                        </motion.span>
                        <span className="text-slate-400 text-sm">/month</span>
                      </div>
                    )}
                  </div>

                  {/* CTA Button */}
                  <button
                    onClick={() => handleSelectPlan(plan)}
                    disabled={isCurrentPlan || changePlan.isPending}
                    className={`w-full py-2.5 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                      isCurrentPlan
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default"
                        : plan.tier === "pro"
                        ? "bg-primary-600 hover:bg-primary-700 text-white"
                        : plan.tier === "enterprise"
                        ? "bg-gradient-to-r from-purple-500 to-violet-500 text-white hover:from-purple-600 hover:to-violet-600"
                        : "bg-slate-700 hover:bg-slate-600 text-white"
                    } disabled:opacity-50`}
                  >
                    {changePlan.isPending && selectedPlan?.tier === plan.tier ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isCurrentPlan ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Current Plan
                      </>
                    ) : plan.tier === "enterprise" ? (
                      <>
                        <Mail className="h-4 w-4" />
                        Contact Sales
                      </>
                    ) : isUpgrade(plan.tier) ? (
                      `Upgrade to ${plan.name}`
                    ) : (
                      `Switch to ${plan.name}`
                    )}
                  </button>

                  {/* Features */}
                  <div className="mt-6 space-y-2">
                    {(config?.features || []).map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className={`h-4 w-4 ${config?.textColor || "text-slate-400"} flex-shrink-0 mt-0.5`} />
                        <span className="text-slate-300 text-sm">{feature}</span>
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
              currentPlan={currentPlan}
              targetPlan={selectedPlan}
              isUpgrade={isUpgrade(selectedPlan.tier)}
            />
          </motion.div>
        )}

        {/* Help Text */}
        <div className="text-center">
          <p className="text-slate-400 text-sm">
            Questions about plans?{" "}
            <a
              href="mailto:billing@aexy.io"
              className="text-primary-400 hover:text-primary-300 transition"
            >
              Contact billing@aexy.io
            </a>
          </p>
        </div>
      </main>

      {/* Change Plan Modal */}
      {selectedPlan && (
        <ChangePlanModal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false);
            setSelectedPlan(null);
          }}
          onConfirm={handleConfirmChange}
          currentPlan={currentPlan}
          targetPlan={selectedPlan}
          isUpgrade={isUpgrade(selectedPlan.tier)}
          billingPeriod={billingPeriod}
        />
      )}
    </div>
  );
}
