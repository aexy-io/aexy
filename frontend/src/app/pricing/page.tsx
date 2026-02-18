"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  ArrowRight,
  Shield,
  Github,
  ChevronDown,
  ChevronUp,
  Users,
  Building2,
  Star,
  CheckCircle2,
  X,
  AlertCircle,
} from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useWorkspace } from "@/hooks/useWorkspace";
import { billingApi } from "@/lib/api";
import { BillingToggle } from "@/components/billing/BillingToggle";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const plans = [
  {
    name: "Free",
    tier: "free",
    tagline: "Open Source",
    description: "For individuals, small teams, and evaluation",
    monthlyPrice: 0,
    annualPrice: 0,
    priceLabel: "forever",
    icon: Github,
    color: "from-emerald-500 to-cyan-500",
    borderColor: "border-emerald-500/30",
    textColor: "text-emerald-400",
    features: [
      "Core Engineering OS (open source)",
      "Developer profiles & skill analysis",
      "Sprint & epic planning",
      "Tickets & task tracking",
      "Docs & forms",
      "Basic CRM (contacts & relationships)",
      "GitHub integration",
      "Community support",
      "Self-hosting",
    ],
    bestFor: ["Indie devs", "Early-stage startups", "OSS-first teams"],
    cta: "Get Started Free",
    popular: false,
  },
  {
    name: "Team",
    tier: "pro",
    tagline: "Cloud",
    description: "For growing teams that want speed without ops overhead",
    monthlyPrice: 29,
    annualPrice: 24,
    priceLabel: "/ user / month",
    icon: Users,
    color: "from-primary-500 to-primary-600",
    borderColor: "border-primary-500/50",
    textColor: "text-primary-400",
    features: [
      "Everything in Free, plus:",
      "Hosted cloud version",
      "AI-powered insights & summaries",
      "On-call scheduling & rotations",
      "Performance reviews & feedback",
      "Learning paths & skill gaps",
      "Gmail & Calendar sync",
      "Advanced dashboards",
      "Email support",
    ],
    bestFor: ["Startups", "Product teams", "Engineering orgs (10-100)"],
    cta: "Start 14-Day Free Trial",
    popular: true,
  },
  {
    name: "Enterprise",
    tier: "enterprise",
    tagline: "Engineering OS at Scale",
    description: "For organizations running critical engineering operations",
    monthlyPrice: -1,
    annualPrice: -1,
    priceLabel: "pricing",
    icon: Building2,
    color: "from-purple-500 to-violet-500",
    borderColor: "border-purple-500/30",
    textColor: "text-purple-400",
    features: [
      "Everything in Team, plus:",
      "Advanced security & compliance",
      "SSO & SCIM",
      "Audit logs",
      "Custom data retention",
      "Dedicated support & SLA",
      "Private cloud / VPC deployment",
      "Priority roadmap input",
    ],
    bestFor: ["Scaleups", "Enterprises", "Regulated industries"],
    cta: "Talk to Sales",
    popular: false,
  },
];

const comparisonItems = [
  { need: "Jira + GitHub + Notion", aexy: "Built-in" },
  { need: "CRM disconnected from delivery", aexy: "Connected by default" },
  { need: "Manual performance reviews", aexy: "Auto-generated" },
  { need: "Hiring based on resumes", aexy: "Skills from real code" },
  { need: "On-call chaos", aexy: "Structured & humane" },
];

const faqs = [
  {
    q: "Is Aexy really open source?",
    a: "Yes. The core platform is fully open source. You can audit, fork, or self-host it anytime.",
  },
  {
    q: "Can we self-host on paid plans?",
    a: "Yes. Paid plans unlock features - not control over your data.",
  },
  {
    q: "Is this a CRM?",
    a: "It includes CRM - but Aexy is not a sales-only CRM. It's an operating system connecting execution, people, and relationships.",
  },
  {
    q: "What happens if we leave?",
    a: "You export everything. No lock-in. Ever.",
  },
  {
    q: "Can I switch plans anytime?",
    a: "Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately, and we'll prorate your billing.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes! Team plans come with a 14-day free trial. No credit card required to start.",
  },
];

function PricingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const { tier: currentTier } = useSubscription(currentWorkspaceId);

  const [loading, setLoading] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">(
    (searchParams.get("billing") as "monthly" | "annual") || "monthly"
  );

  const googleLoginUrl = `${API_BASE_URL}/auth/google/login`;

  // Update URL when billing period changes
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("billing", billingPeriod);
    window.history.replaceState({}, "", url.toString());
  }, [billingPeriod]);

  const handleSubscribe = async (tier: string) => {
    if (!user) {
      router.push("/?redirect=/pricing");
      return;
    }

    if (tier === "free") {
      router.push("/dashboard");
      return;
    }

    if (tier === "enterprise") {
      window.location.href = "mailto:sales@aexy.io?subject=Enterprise%20Inquiry";
      return;
    }

    setLoading(tier);
    try {
      const { checkout_url } = await billingApi.createCheckoutSession({
        plan_tier: tier,
        success_url: `${window.location.origin}/settings/billing?success=true`,
        cancel_url: `${window.location.origin}/pricing?canceled=true`,
      });
      window.location.href = checkout_url;
    } catch (err) {
      console.error("Failed to create checkout session:", err);
      setError("Failed to start checkout. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.1, 0.15, 0.1],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary-500/10 rounded-full blur-[120px]"
        />
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.1, 0.12, 0.1],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      {/* Error Modal */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setError(null)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-background border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl"
            >
              <button
                onClick={() => setError(null)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-500/20 rounded-xl">
                  <AlertCircle className="h-6 w-6 text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">Checkout Error</h3>
                  <p className="text-muted-foreground">{error}</p>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setError(null)}
                  className="px-4 py-2 bg-accent hover:bg-muted text-foreground rounded-lg transition"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero */}
      <section className="pt-32 pb-16 px-6 relative">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 rounded-full text-emerald-400 text-sm mb-6"
          >
            <Github className="h-4 w-4" />
            <span>Open Source</span>
            <span className="text-foreground/40">·</span>
            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
            <span>Self-host free</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 tracking-tight"
          >
            Simple pricing for the{" "}
            <motion.span
              animate={{
                backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
              }}
              transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
              className="bg-gradient-to-r from-primary-400 via-purple-400 to-emerald-400 bg-[length:200%_auto] bg-clip-text text-transparent"
            >
              Engineering OS
            </motion.span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-xl text-foreground/50 max-w-2xl mx-auto mb-4"
          >
            Start open source. Scale with confidence.
            <br />
            Pay only when your organization needs more.
          </motion.p>
        </div>
      </section>

      {/* Pricing Philosophy */}
      <section className="py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="relative"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-8 border border-white/10 text-center">
              <div className="flex items-center justify-center gap-3 mb-4">
                <Shield className="h-6 w-6 text-emerald-400" />
                <h2 className="text-2xl font-bold text-foreground">Built open. Priced fair. No lock-in.</h2>
              </div>
              <p className="text-foreground/60 max-w-2xl mx-auto">
                Aexy is open source by default. You can self-host, audit the code, and export your data anytime.
                <br />
                We earn your business by being valuable - not by trapping you.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Billing Toggle */}
      <section className="py-8 px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <BillingToggle billingPeriod={billingPeriod} onToggle={setBillingPeriod} />
        </motion.div>
      </section>

      {/* Pricing Cards */}
      <section className="py-8 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6">
          {plans.map((plan, index) => {
            const Icon = plan.icon;
            const isCurrentPlan = user && currentTier === plan.tier;
            const displayPrice = billingPeriod === "annual" ? plan.annualPrice : plan.monthlyPrice;
            const isCustomPrice = plan.monthlyPrice === -1;

            return (
              <motion.div
                key={plan.tier}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 + index * 0.1 }}
                className={`relative group ${plan.popular ? "md:-mt-4 md:mb-4" : ""}`}
              >
                {plan.popular && !isCurrentPlan && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", delay: 0.7 }}
                      className="px-4 py-1 bg-gradient-to-r from-primary-500 to-primary-600 text-white text-sm font-medium rounded-full shadow-lg shadow-primary-500/25"
                    >
                      Most Popular
                    </motion.div>
                  </div>
                )}

                {isCurrentPlan && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", delay: 0.7 }}
                      className="px-4 py-1 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-sm font-medium rounded-full shadow-lg shadow-emerald-500/25"
                    >
                      Current Plan
                    </motion.div>
                  </div>
                )}

                <motion.div
                  whileHover={{ scale: 1.02, y: -4 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className={`absolute inset-0 bg-gradient-to-br ${plan.color} rounded-3xl opacity-0 group-hover:opacity-20 blur-xl transition-all duration-500`}
                />

                <div
                  className={`relative h-full bg-white/5 backdrop-blur-sm border ${
                    isCurrentPlan
                      ? "border-emerald-500/50"
                      : plan.popular
                      ? "border-primary-500/50"
                      : "border-white/10"
                  } rounded-3xl p-8 hover:border-white/20 transition-all ${
                    plan.popular || isCurrentPlan ? "shadow-xl shadow-primary-500/10" : ""
                  }`}
                >
                  {/* Plan Header */}
                  <div className="flex items-center gap-3 mb-2">
                    <motion.div
                      whileHover={{ rotate: [0, -10, 10, 0] }}
                      transition={{ duration: 0.5 }}
                      className={`p-3 bg-gradient-to-br ${plan.color} rounded-2xl shadow-lg`}
                    >
                      <Icon className="h-6 w-6 text-foreground" />
                    </motion.div>
                    <div>
                      <span className={`text-xs font-semibold tracking-wider ${plan.textColor}`}>
                        {plan.tagline.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-2xl font-bold text-foreground mb-2">{plan.name}</h3>
                  <p className="text-foreground/50 text-sm mb-6">{plan.description}</p>

                  {/* Price */}
                  <div className="mb-6 h-16">
                    {isCustomPrice ? (
                      <div className="flex items-baseline gap-1">
                        <span className="text-5xl font-bold text-foreground">Custom</span>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span className="text-foreground/50 text-2xl">$</span>
                        <motion.span
                          key={displayPrice}
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          className="text-5xl font-bold text-foreground"
                        >
                          {displayPrice}
                        </motion.span>
                      </div>
                    )}
                    <span className="text-foreground/40 text-sm">{plan.priceLabel}</span>
                  </div>

                  {/* CTA Button */}
                  <button
                    onClick={() => handleSubscribe(plan.tier)}
                    disabled={loading === plan.tier || isCurrentPlan}
                    className={`w-full py-3.5 px-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                      isCurrentPlan
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default"
                        : plan.popular
                        ? "bg-white text-black hover:bg-white/90 hover:shadow-lg hover:shadow-white/10"
                        : plan.tier === "enterprise"
                        ? "bg-gradient-to-r from-purple-500 to-violet-500 text-white hover:from-purple-600 hover:to-violet-600"
                        : "bg-white/10 text-foreground hover:bg-white/20 border border-white/10"
                    } disabled:opacity-50`}
                  >
                    {loading === plan.tier ? (
                      <div className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    ) : isCurrentPlan ? (
                      "Current Plan"
                    ) : (
                      <>
                        {plan.cta}
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>

                  {/* Features */}
                  <div className="mt-8 space-y-3">
                    <div className="text-foreground/40 text-xs font-semibold tracking-wider mb-4">WHAT YOU GET</div>
                    {plan.features.map((feature, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: 0.6 + idx * 0.05 }}
                        className="flex items-start gap-3"
                      >
                        <CheckCircle2 className={`h-5 w-5 ${plan.textColor} flex-shrink-0 mt-0.5`} />
                        <span className="text-foreground/70 text-sm">{feature}</span>
                      </motion.div>
                    ))}
                  </div>

                  {/* Best For */}
                  <div className="mt-8 pt-6 border-t border-white/10">
                    <div className="text-foreground/40 text-xs font-semibold tracking-wider mb-3">BEST FOR</div>
                    <div className="flex flex-wrap gap-2">
                      {plan.bestFor.map((item, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-foreground/60 text-xs"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Comparison Strip */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Replace tool sprawl, not just one tool
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 via-purple-500/10 to-emerald-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-4 px-6 text-foreground/40 text-sm font-medium">You need</th>
                    <th className="text-left py-4 px-6 text-primary-400 text-sm font-medium">With Aexy</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonItems.map((item, idx) => (
                    <motion.tr
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.3, delay: idx * 0.1 }}
                      className={idx !== comparisonItems.length - 1 ? "border-b border-white/5" : ""}
                    >
                      <td className="py-4 px-6 text-foreground/60">{item.need}</td>
                      <td className="py-4 px-6">
                        <span className="inline-flex items-center gap-2 text-emerald-400 font-medium">
                          <Check className="h-4 w-4" />
                          {item.aexy}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Frequently Asked Questions
            </h2>
          </motion.div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
                className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full flex items-center justify-between p-6 text-left"
                >
                  <h3 className="text-lg font-medium text-foreground pr-4">{faq.q}</h3>
                  <motion.div
                    animate={{ rotate: openFaq === idx ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown className="h-5 w-5 text-foreground/40 flex-shrink-0" />
                  </motion.div>
                </button>
                <AnimatePresence>
                  {openFaq === idx && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 pb-6 -mt-2">
                        <p className="text-foreground/60">{faq.a}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="relative"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-primary-500/30 via-purple-500/30 to-emerald-500/30 rounded-3xl blur-2xl" />
            <div className="relative bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-3xl p-12 border border-white/10 text-center overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/20 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl" />

              <div className="relative">
                <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                  Start with open source. Grow into your Engineering OS.
                </h2>
                <p className="text-foreground/50 text-lg mb-10 max-w-2xl mx-auto">
                  Join thousands of engineering teams building better software with Aexy.
                </p>

                <div className="flex flex-col sm:flex-row justify-center gap-4">
                  <motion.a
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                    href={googleLoginUrl}
                    className="group inline-flex items-center justify-center gap-3 bg-white text-black px-8 py-4 rounded-full text-lg font-semibold transition-all hover:shadow-[0_0_40px_rgba(255,255,255,0.3)]"
                  >
                    Get Started Free
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </motion.a>
                  <motion.a
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                    href="https://github.com/aexy-io/aexy"
                    className="group bg-white/5 hover:bg-white/10 text-foreground px-8 py-4 rounded-full text-lg font-semibold transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-3"
                  >
                    <Github className="h-5 w-5" />
                    View on GitHub
                  </motion.a>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
        </div>
      }
    >
      <PricingContent />
    </Suspense>
  );
}
