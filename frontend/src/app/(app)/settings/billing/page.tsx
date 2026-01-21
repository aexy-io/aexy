"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  Crown,
  ExternalLink,
  Loader2,
  RefreshCw,
  Settings,
  Sparkles,
  Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSubscription } from "@/hooks/useSubscription";
import { billingApi } from "@/lib/api";

// New billing components
import { UsageAlerts } from "@/components/billing/UsageAlert";
import { UsageStatsCards } from "@/components/billing/UsageStatsCards";
import { UsageTrendChart } from "@/components/billing/UsageTrendChart";
import { InvoiceList } from "@/components/billing/InvoiceList";

function BillingContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { currentWorkspaceId, currentWorkspace } = useWorkspace();
  const { subscriptionStatus, plan, tier, isLoading, refetch } = useSubscription(currentWorkspaceId);

  const [portalLoading, setPortalLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Check for success param from Stripe redirect
  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setShowSuccess(true);
      refetch();
      // Clear the URL param
      window.history.replaceState({}, "", "/settings/billing");
      // Hide after 5 seconds
      setTimeout(() => setShowSuccess(false), 5000);
    }
  }, [searchParams, refetch]);

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const { portal_url } = await billingApi.createPortalSession({
        return_url: `${window.location.origin}/settings/billing`,
      });
      window.location.href = portal_url;
    } catch (error) {
      console.error("Failed to open billing portal:", error);
      alert("Failed to open billing portal. Please try again.");
    } finally {
      setPortalLoading(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case "pro":
        return "from-primary-500 to-primary-600";
      case "enterprise":
        return "from-amber-500 to-orange-500";
      default:
        return "from-slate-500 to-slate-600";
    }
  };

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case "pro":
        return Sparkles;
      case "enterprise":
        return Crown;
      default:
        return Zap;
    }
  };

  const TierIcon = getTierIcon(tier);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary-500 mx-auto mb-4" />
          <p className="text-slate-400">Loading billing information...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/settings"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-700 rounded-lg">
                <CreditCard className="h-5 w-5 text-slate-300" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">Billing & Usage</h1>
                <p className="text-slate-400 text-sm">
                  Manage your subscription, track usage, and view invoices
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Success Message */}
        {showSuccess && (
          <div className="p-4 bg-green-900/30 border border-green-700 rounded-lg flex items-center gap-3">
            <Check className="h-5 w-5 text-green-400" />
            <p className="text-green-400">
              Subscription activated successfully! Thank you for upgrading.
            </p>
          </div>
        )}

        {/* Usage Alerts */}
        <UsageAlerts />

        {/* Current Plan Card */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className={`p-6 bg-gradient-to-r ${getTierColor(tier)}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <TierIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    {plan?.name || "Free"} Plan
                  </h2>
                  <p className="text-white/80 text-sm">
                    {currentWorkspace?.name || "Personal"}
                  </p>
                </div>
              </div>
              {tier !== "free" && (
                <div className="text-right">
                  <p className="text-2xl font-bold text-white">
                    ${(plan?.price_monthly_cents || 0) / 100}
                    <span className="text-sm font-normal text-white/80">/month</span>
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="p-6">
            {subscriptionStatus?.subscription ? (
              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <p className="text-slate-400 text-sm mb-1">Status</p>
                  <p className="text-white font-medium capitalize flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-400 rounded-full" />
                    {subscriptionStatus.subscription.status}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm mb-1">Current Period</p>
                  <p className="text-white font-medium">
                    {formatDate(subscriptionStatus.subscription.current_period_start)} -{" "}
                    {formatDate(subscriptionStatus.subscription.current_period_end)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm mb-1">Next Billing</p>
                  <p className="text-white font-medium">
                    {formatDate(subscriptionStatus.subscription.current_period_end)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <p className="text-slate-400">
                      You're on the free plan. Upgrade to unlock more features.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Link
                      href="/settings/plans"
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition font-medium"
                    >
                      <Sparkles className="h-4 w-4" />
                      Upgrade to Pro
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>

                {/* Quick upgrade card */}
                <div className="mt-6 p-4 bg-gradient-to-r from-primary-500/10 to-primary-600/10 border border-primary-500/30 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary-500/20 rounded-lg">
                        <Sparkles className="h-5 w-5 text-primary-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium">Upgrade to Pro for $29/mo</p>
                        <p className="text-slate-400 text-sm">Get AI insights, advanced analytics, and more</p>
                      </div>
                    </div>
                    <Link
                      href="/settings/plans"
                      className="text-primary-400 hover:text-primary-300 text-sm font-medium transition"
                    >
                      Compare plans
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Usage Stats Cards */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Current Usage</h3>
          <UsageStatsCards />
        </div>

        {/* Usage Trend Chart */}
        <UsageTrendChart months={6} />

        {/* Two Column Layout: Plan Features and Invoice History */}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Plan Features */}
          {plan && (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Plan Features</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Check className={`h-5 w-5 ${plan.max_repos === -1 ? "text-green-400" : "text-primary-400"}`} />
                  <span className="text-slate-300">
                    {plan.max_repos === -1 ? "Unlimited" : plan.max_repos} repositories
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className={`h-5 w-5 ${plan.sync_history_days === -1 ? "text-green-400" : "text-primary-400"}`} />
                  <span className="text-slate-300">
                    {plan.sync_history_days === -1 ? "Unlimited" : `${plan.sync_history_days} days`} sync history
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className={`h-5 w-5 ${plan.llm_requests_per_day === -1 ? "text-green-400" : "text-primary-400"}`} />
                  <span className="text-slate-300">
                    {plan.llm_requests_per_day === -1 ? "Unlimited" : plan.llm_requests_per_day} AI requests/day
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {plan.enable_real_time_sync ? (
                    <Check className="h-5 w-5 text-green-400" />
                  ) : (
                    <span className="h-5 w-5 text-slate-600">-</span>
                  )}
                  <span className={plan.enable_real_time_sync ? "text-slate-300" : "text-slate-500"}>
                    Real-time sync
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {plan.enable_advanced_analytics ? (
                    <Check className="h-5 w-5 text-green-400" />
                  ) : (
                    <span className="h-5 w-5 text-slate-600">-</span>
                  )}
                  <span className={plan.enable_advanced_analytics ? "text-slate-300" : "text-slate-500"}>
                    Advanced analytics
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {plan.enable_team_features ? (
                    <Check className="h-5 w-5 text-green-400" />
                  ) : (
                    <span className="h-5 w-5 text-slate-600">-</span>
                  )}
                  <span className={plan.enable_team_features ? "text-slate-300" : "text-slate-500"}>
                    Team features
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {plan.enable_exports ? (
                    <Check className="h-5 w-5 text-green-400" />
                  ) : (
                    <span className="h-5 w-5 text-slate-600">-</span>
                  )}
                  <span className={plan.enable_exports ? "text-slate-300" : "text-slate-500"}>
                    Data exports
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {plan.enable_webhooks ? (
                    <Check className="h-5 w-5 text-green-400" />
                  ) : (
                    <span className="h-5 w-5 text-slate-600">-</span>
                  )}
                  <span className={plan.enable_webhooks ? "text-slate-300" : "text-slate-500"}>
                    Webhooks
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Invoice List (compact version) */}
          <InvoiceList limit={5} />
        </div>

        {/* Payment Method */}
        {subscriptionStatus?.customer && (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Payment Method</h3>
            {subscriptionStatus.customer.stripe_customer_id ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-700 rounded-lg">
                    <CreditCard className="h-5 w-5 text-slate-300" />
                  </div>
                  <div>
                    <p className="text-white">Managed via Stripe</p>
                    <p className="text-slate-400 text-sm">
                      Click "Manage Billing" to update your payment method
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-slate-400">No payment method on file</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-4">
          {tier !== "free" && (
            <>
              <button
                onClick={handleManageBilling}
                disabled={portalLoading}
                className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-lg transition disabled:opacity-50"
              >
                {portalLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Settings className="h-4 w-4" />
                )}
                Manage Billing
                <ExternalLink className="h-4 w-4" />
              </button>

              <Link
                href="/settings/plans"
                className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-lg transition"
              >
                <RefreshCw className="h-4 w-4" />
                Change Plan
              </Link>
            </>
          )}

          {tier === "free" && (
            <Link
              href="/settings/plans"
              className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition"
            >
              <Sparkles className="h-4 w-4" />
              Upgrade Plan
            </Link>
          )}
        </div>

        {/* Help Text */}
        <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
          <p className="text-slate-400 text-sm">
            Need help with billing?{" "}
            <a
              href="mailto:billing@aexy.io"
              className="text-primary-400 hover:text-primary-300 transition"
            >
              Contact our billing support
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}

function BillingLoadingFallback() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500 mx-auto mb-4" />
        <p className="text-slate-400">Loading billing information...</p>
      </div>
    </div>
  );
}

export default function BillingSettingsPage() {
  return (
    <Suspense fallback={<BillingLoadingFallback />}>
      <BillingContent />
    </Suspense>
  );
}
