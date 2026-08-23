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
  Users,
  Building2,
  Star,
  X,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useWorkspace } from "@/hooks/useWorkspace";
import { billingApi } from "@/lib/api";
import { STRIPE_ENABLED, buildSalesMailto } from "@/lib/billingMode";
import { BillingToggle } from "@/components/billing/BillingToggle";
import { LedgerPage } from "@/components/landing/LedgerPage";


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
      "Core AI company OS (open source)",
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
    tagline: "Company OS at Scale",
    description: "For organizations running the company OS at scale",
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

const pricingJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.a,
    },
  })),
};

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


  // Update URL when billing period changes
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("billing", billingPeriod);
    window.history.replaceState({}, "", url.toString());
  }, [billingPeriod]);

  const handleSubscribe = async (tier: string) => {
    if (tier === "free") {
      if (!user) {
        router.push("/?redirect=/dashboard");
        return;
      }
      router.push("/dashboard");
      return;
    }

    // Enterprise always goes to sales, regardless of Stripe mode.
    // Other paid tiers go to sales while Stripe is disabled.
    if (tier === "enterprise" || !STRIPE_ENABLED) {
      window.location.href = buildSalesMailto({
        planTier: tier,
        billingPeriod,
        workspaceId: currentWorkspaceId,
        intent: "subscribe",
      });
      return;
    }

    if (!user) {
      router.push("/?redirect=/pricing");
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
    <LedgerPage className="overflow-hidden">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }} />

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
              className="absolute inset-0 bg-ledger-ink/40"
              onClick={() => setError(null)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-ledger-card border border-ledger-ink/12 rounded-[2px] p-6 max-w-md w-full"
            >
              <button
                onClick={() => setError(null)}
                className="absolute top-4 right-4 text-ledger-ink/55 hover:text-ledger-ink transition"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex items-start gap-4">
                <AlertCircle className="h-6 w-6 flex-shrink-0 text-ledger-red" />
                <div>
                  <h3 className="font-display text-lg font-semibold mb-2">Checkout Error</h3>
                  <p className="text-ledger-ink/65">{error}</p>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setError(null)}
                  className="px-4 py-2 rounded-[2px] border border-ledger-ink/25 text-ledger-ink hover:border-ledger-ink/50 transition"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero */}
      <section className="pt-32 pb-12 px-6 relative">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green mb-6"
          >
            <Github className="h-4 w-4" />
            <span>Open Source</span>
            <span className="text-ledger-ink/25">·</span>
            <Star className="h-4 w-4" />
            <span>Self-host free</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="font-display text-4xl md:text-5xl lg:text-6xl font-semibold mb-6 tracking-tight leading-[1.04]"
          >
            Pricing for an open{" "}
<span className="text-ledger-green">AI company OS</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg leading-8 text-ledger-ink/65 max-w-2xl mx-auto mb-4"
          >
            Start self-hosted. Move to cloud when speed matters. Use enterprise controls when your company OS becomes critical infrastructure.
          </motion.p>
        </div>
      </section>

      {/* Pricing Philosophy */}
      <section className="py-8 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="grid gap-4 md:grid-cols-3"
          >
            <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6">
              <Github className="h-5 w-5 text-ledger-green" />
              <h2 className="mt-5 font-display text-xl font-semibold">Self-host free</h2>
              <p className="mt-3 text-sm leading-6 text-ledger-ink/65">
                Evaluate the core company OS, audit the code, and keep control of your operating data.
              </p>
            </div>
            <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6">
              <Users className="h-5 w-5 text-ledger-green" />
              <h2 className="mt-5 font-display text-xl font-semibold">Cloud for speed</h2>
              <p className="mt-3 text-sm leading-6 text-ledger-ink/65">
                Let Aexy handle hosting, updates, integrations, and team workflows while you scale.
              </p>
            </div>
            <div className="rounded-[2px] border border-ledger-ink/12 bg-ledger-card p-6">
              <Shield className="h-5 w-5 text-ledger-green" />
              <h2 className="mt-5 font-display text-xl font-semibold">Enterprise control</h2>
              <p className="mt-3 text-sm leading-6 text-ledger-ink/65">
                Add SSO, audit logs, retention controls, and private deployment options for critical work.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Billing Toggle */}
      <section className="py-6 px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <BillingToggle billingPeriod={billingPeriod} onToggle={setBillingPeriod} />
        </motion.div>
      </section>

      {/* Pricing Cards */}
      <section className="py-10 px-6">
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
                      className="px-4 py-1 bg-ledger-green text-ledger-paper font-brand-mono text-xs font-medium uppercase tracking-[0.14em] rounded-[2px]"
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
                      className="px-4 py-1 bg-ledger-green text-ledger-paper font-brand-mono text-xs font-medium uppercase tracking-[0.14em] rounded-[2px]"
                    >
                      Current Plan
                    </motion.div>
                  </div>
                )}

                <div
                  className={`relative h-full bg-ledger-card border ${
                    isCurrentPlan
                      ? "border-ledger-green/50"
                      : plan.popular
                      ? "border-ledger-ink/25"
                      : "border-ledger-ink/12"
                  } rounded-[2px] p-8 transition ${
                    plan.popular || isCurrentPlan
                      ? "shadow-[inset_0_2px_0_0_#0B6B3A]"
                      : "hover:shadow-[inset_0_2px_0_0_#0B6B3A]"
                  }`}
                >
                  {/* Plan Header */}
                  <div className="flex items-center gap-3 mb-2">
                    <Icon className="h-5 w-5 text-ledger-green" />
                    <div>
                      <span className="font-brand-mono text-xs font-medium uppercase tracking-[0.18em] text-ledger-green">
                        {plan.tagline.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <h3 className="font-display text-2xl font-semibold mb-2">{plan.name}</h3>
                  <p className="text-ledger-ink/55 text-sm mb-6">{plan.description}</p>

                  {/* Price */}
                  <div className="mb-6 h-16">
                    {isCustomPrice ? (
                      <div className="flex items-baseline gap-1">
                        <span className="font-display text-5xl font-semibold">Custom</span>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span className="text-ledger-ink/50 text-2xl">$</span>
                        <motion.span
                          key={displayPrice}
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          className="font-display text-5xl font-semibold"
                        >
                          {displayPrice}
                        </motion.span>
                      </div>
                    )}
                    <span className="text-ledger-ink/50 text-sm">{plan.priceLabel}</span>
                  </div>

                  {/* CTA Button */}
                  <button
                    onClick={() => handleSubscribe(plan.tier)}
                    disabled={loading === plan.tier || isCurrentPlan}
                    className={`w-full py-3.5 px-4 rounded-[2px] font-semibold transition-all flex items-center justify-center gap-2 ${
                      isCurrentPlan
                        ? "border border-ledger-green/40 bg-ledger-green/10 text-ledger-green cursor-default"
                        : plan.popular
                        ? "bg-ledger-green text-ledger-paper hover:bg-[#095A31]"
                        : plan.tier === "enterprise"
                        ? "border border-ledger-ink/25 text-ledger-ink hover:border-ledger-ink/50"
                        : "border border-ledger-ink/25 text-ledger-ink hover:border-ledger-ink/50"
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
                    <div className="font-brand-mono text-ledger-ink/50 text-xs font-medium uppercase tracking-[0.14em] mb-4">WHAT YOU GET</div>
                    {plan.features.map((feature, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: 0.6 + idx * 0.05 }}
                        className="flex items-start gap-3"
                      >
                        <span className="font-brand-mono text-ledger-green flex-shrink-0">+</span>
                        <span className="text-ledger-ink/70 text-sm">{feature}</span>
                      </motion.div>
                    ))}
                  </div>

                  {/* Best For */}
                  <div className="mt-8 pt-6 border-t border-ledger-ink/12">
                    <div className="font-brand-mono text-ledger-ink/50 text-xs font-medium uppercase tracking-[0.14em] mb-3">BEST FOR</div>
                    <div className="flex flex-wrap gap-2">
                      {plan.bestFor.map((item, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-ledger-paper border border-ledger-ink/12 rounded-[2px] text-ledger-ink/60 text-xs"
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
            <h2 className="font-display text-3xl md:text-4xl font-semibold mb-4">
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
            <div className="relative bg-ledger-card rounded-[2px] border border-ledger-ink/12 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ledger-ink/12">
                    <th className="text-left py-4 px-6 font-brand-mono text-ledger-ink/50 text-xs font-medium uppercase tracking-[0.14em]">You need</th>
                    <th className="text-left py-4 px-6 font-brand-mono text-ledger-green text-xs font-medium uppercase tracking-[0.14em]">With Aexy</th>
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
                      className={idx !== comparisonItems.length - 1 ? "border-b border-ledger-ink/12" : ""}
                    >
                      <td className="py-4 px-6 text-ledger-ink/65">{item.need}</td>
                      <td className="py-4 px-6">
                        <span className="inline-flex items-center gap-2 text-ledger-green font-medium">
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
            <h2 className="font-display text-3xl md:text-4xl font-semibold mb-4">
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
                className="bg-ledger-card rounded-[2px] border border-ledger-ink/12 overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full flex items-center justify-between p-6 text-left"
                >
                  <h3 className="font-display text-lg font-medium pr-4">{faq.q}</h3>
                  <motion.div
                    animate={{ rotate: openFaq === idx ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown className="h-5 w-5 text-ledger-ink/50 flex-shrink-0" />
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
                        <p className="text-ledger-ink/65">{faq.a}</p>
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
            <div className="relative bg-ledger-card rounded-[2px] p-12 border border-ledger-ink/12 text-center overflow-hidden">
              <div className="relative">
                <h2 className="font-display text-3xl md:text-4xl font-semibold mb-4">
                  Start with open source. Grow into your company OS.
                </h2>
                <p className="text-ledger-ink/65 text-lg mb-10 max-w-2xl mx-auto">
                  Bring engineering, GTM, people, knowledge, and AI agents into one operating system.
                </p>

                <div className="flex flex-col sm:flex-row justify-center gap-4">
                  <motion.a
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                    href="/login"
                    className="group inline-flex items-center justify-center gap-3 bg-ledger-green text-ledger-paper px-8 py-4 rounded-[2px] text-lg font-semibold transition-all hover:bg-[#095A31]"
                  >
                    Get Started Free
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </motion.a>
                  <motion.a
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                    href="https://github.com/aexy-io/aexy"
                    className="group px-8 py-4 rounded-[2px] text-lg font-semibold transition-all border border-ledger-ink/25 text-ledger-ink hover:border-ledger-ink/50 flex items-center justify-center gap-3"
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

    </LedgerPage>
  );
}

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-ledger-paper flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-ledger-green/30 border-t-ledger-green rounded-full animate-spin" />
        </div>
      }
    >
      <PricingContent />
    </Suspense>
  );
}
