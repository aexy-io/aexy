"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingHeader";
import { useAuth } from "@/hooks/useAuth";
import { billingApi } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const plans = [
  {
    name: "Free",
    tier: "free",
    tagline: "Open Source",
    description: "For individuals, small teams, and evaluation",
    price: "0",
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
    tier: "team",
    tagline: "Cloud",
    description: "For growing teams that want speed without ops overhead",
    price: "29",
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
    price: "Custom",
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

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const { user } = useAuth();
  const router = useRouter();
  const googleLoginUrl = `${API_BASE_URL}/auth/google/login`;

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
    } catch (error) {
      console.error("Failed to create checkout session:", error);
      alert("Failed to start checkout. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <LandingHeader />

      {/* Hero */}
      <section className="pt-32 pb-16 px-6 relative">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 rounded-full text-emerald-400 text-sm mb-6">
            <Github className="h-4 w-4" />
            <span>Open Source</span>
            <span className="text-white/40">·</span>
            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
            <span>Self-host free</span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight">
            Simple pricing for the{" "}
            <span className="bg-gradient-to-r from-primary-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
              Engineering OS
            </span>
          </h1>

          <p className="text-xl text-white/50 max-w-2xl mx-auto mb-4">
            Start open source. Scale with confidence.
            <br />
            Pay only when your organization needs more.
          </p>
        </div>
      </section>

      {/* Pricing Philosophy */}
      <section className="py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-8 border border-white/10 text-center">
              <div className="flex items-center justify-center gap-3 mb-4">
                <Shield className="h-6 w-6 text-emerald-400" />
                <h2 className="text-2xl font-bold text-white">Built open. Priced fair. No lock-in.</h2>
              </div>
              <p className="text-white/60 max-w-2xl mx-auto">
                Aexy is open source by default. You can self-host, audit the code, and export your data anytime.
                <br />
                We earn your business by being valuable - not by trapping you.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-16 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const Icon = plan.icon;

            return (
              <div
                key={plan.tier}
                className={`relative group ${plan.popular ? "md:-mt-4 md:mb-4" : ""}`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                    <div className="px-4 py-1 bg-gradient-to-r from-primary-500 to-primary-600 text-white text-sm font-medium rounded-full shadow-lg shadow-primary-500/25">
                      Most Popular
                    </div>
                  </div>
                )}

                <div className={`absolute inset-0 bg-gradient-to-br ${plan.color} rounded-3xl opacity-0 group-hover:opacity-20 blur-xl transition-all duration-500`} />

                <div className={`relative h-full bg-white/5 backdrop-blur-sm border ${plan.popular ? "border-primary-500/50" : "border-white/10"} rounded-3xl p-8 hover:border-white/20 transition-all ${plan.popular ? "shadow-xl shadow-primary-500/10" : ""}`}>
                  {/* Plan Header */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-3 bg-gradient-to-br ${plan.color} rounded-2xl shadow-lg`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <span className={`text-xs font-semibold tracking-wider ${plan.textColor}`}>
                        {plan.tagline.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                  <p className="text-white/50 text-sm mb-6">{plan.description}</p>

                  {/* Price */}
                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      {plan.price !== "Custom" && <span className="text-white/50 text-2xl">$</span>}
                      <span className="text-5xl font-bold text-white">{plan.price}</span>
                    </div>
                    <span className="text-white/40 text-sm">{plan.priceLabel}</span>
                  </div>

                  {/* CTA Button */}
                  <button
                    onClick={() => handleSubscribe(plan.tier)}
                    disabled={loading === plan.tier}
                    className={`w-full py-3.5 px-4 rounded-xl font-semibold transition flex items-center justify-center gap-2 ${
                      plan.popular
                        ? "bg-white text-black hover:bg-white/90"
                        : plan.tier === "enterprise"
                        ? "bg-gradient-to-r from-purple-500 to-violet-500 text-white hover:from-purple-600 hover:to-violet-600"
                        : "bg-white/10 text-white hover:bg-white/20 border border-white/10"
                    } disabled:opacity-50`}
                  >
                    {loading === plan.tier ? (
                      <div className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    ) : (
                      <>
                        {plan.cta}
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>

                  {/* Features */}
                  <div className="mt-8 space-y-3">
                    <div className="text-white/40 text-xs font-semibold tracking-wider mb-4">WHAT YOU GET</div>
                    {plan.features.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <CheckCircle2 className={`h-5 w-5 ${plan.textColor} flex-shrink-0 mt-0.5`} />
                        <span className="text-white/70 text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>

                  {/* Best For */}
                  <div className="mt-8 pt-6 border-t border-white/10">
                    <div className="text-white/40 text-xs font-semibold tracking-wider mb-3">BEST FOR</div>
                    <div className="flex flex-wrap gap-2">
                      {plan.bestFor.map((item, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-white/60 text-xs"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Comparison Strip */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Replace tool sprawl, not just one tool
            </h2>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 via-purple-500/10 to-emerald-500/10 rounded-3xl blur-xl" />
            <div className="relative bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-4 px-6 text-white/40 text-sm font-medium">You need</th>
                    <th className="text-left py-4 px-6 text-primary-400 text-sm font-medium">With Aexy</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonItems.map((item, idx) => (
                    <tr key={idx} className={idx !== comparisonItems.length - 1 ? "border-b border-white/5" : ""}>
                      <td className="py-4 px-6 text-white/60">{item.need}</td>
                      <td className="py-4 px-6">
                        <span className="inline-flex items-center gap-2 text-emerald-400 font-medium">
                          <Check className="h-4 w-4" />
                          {item.aexy}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full flex items-center justify-between p-6 text-left"
                >
                  <h3 className="text-lg font-medium text-white pr-4">{faq.q}</h3>
                  {openFaq === idx ? (
                    <ChevronUp className="h-5 w-5 text-white/40 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-white/40 flex-shrink-0" />
                  )}
                </button>
                {openFaq === idx && (
                  <div className="px-6 pb-6 -mt-2">
                    <p className="text-white/60">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary-500/30 via-purple-500/30 to-emerald-500/30 rounded-3xl blur-2xl" />
            <div className="relative bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-3xl p-12 border border-white/10 text-center overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/20 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl" />

              <div className="relative">
                <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                  Start with open source. Grow into your Engineering OS.
                </h2>
                <p className="text-white/50 text-lg mb-10 max-w-2xl mx-auto">
                  Join thousands of engineering teams building better software with Aexy.
                </p>

                <div className="flex flex-col sm:flex-row justify-center gap-4">
                  <a
                    href={googleLoginUrl}
                    className="group inline-flex items-center justify-center gap-3 bg-white text-black px-8 py-4 rounded-full text-lg font-semibold transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(255,255,255,0.3)]"
                  >
                    Get Started Free
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </a>
                  <a
                    href="https://github.com/aexy-io/aexy"
                    className="group bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-3"
                  >
                    <Github className="h-5 w-5" />
                    View on GitHub
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
