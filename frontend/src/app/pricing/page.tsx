"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  X,
  Zap,
  Users,
  Building2,
  ArrowRight,
  Sparkles,
  Shield,
  Clock,
  BarChart3,
  GitBranch,
  Bot,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { billingApi } from "@/lib/api";

const plans = [
  {
    name: "Free",
    tier: "free",
    description: "Perfect for individual developers getting started",
    priceMonthly: 0,
    priceYearly: 0,
    icon: Zap,
    color: "from-slate-500 to-slate-600",
    features: [
      { name: "Up to 3 repositories", included: true },
      { name: "90 days sync history", included: true },
      { name: "Basic analytics", included: true },
      { name: "50 AI requests/day", included: true },
      { name: "Community support", included: true },
      { name: "Real-time sync", included: false },
      { name: "Advanced analytics", included: false },
      { name: "Team features", included: false },
      { name: "Data exports", included: false },
      { name: "Webhooks", included: false },
    ],
    cta: "Get Started",
    popular: false,
  },
  {
    name: "Pro",
    tier: "pro",
    description: "For professional developers and growing teams",
    priceMonthly: 29,
    priceYearly: 290,
    icon: Users,
    color: "from-primary-500 to-primary-600",
    features: [
      { name: "Up to 20 repositories", included: true },
      { name: "1 year sync history", included: true },
      { name: "Basic analytics", included: true },
      { name: "500 AI requests/day", included: true },
      { name: "Priority support", included: true },
      { name: "Real-time sync", included: true },
      { name: "Advanced analytics", included: true },
      { name: "Team features", included: false },
      { name: "Data exports", included: true },
      { name: "Webhooks", included: true },
    ],
    cta: "Start Free Trial",
    popular: true,
  },
  {
    name: "Enterprise",
    tier: "enterprise",
    description: "For large teams and organizations",
    priceMonthly: 99,
    priceYearly: 990,
    icon: Building2,
    color: "from-amber-500 to-orange-500",
    features: [
      { name: "Unlimited repositories", included: true },
      { name: "Unlimited sync history", included: true },
      { name: "Basic analytics", included: true },
      { name: "Unlimited AI requests", included: true },
      { name: "Dedicated support", included: true },
      { name: "Real-time sync", included: true },
      { name: "Advanced analytics", included: true },
      { name: "Team features", included: true },
      { name: "Data exports", included: true },
      { name: "Webhooks", included: true },
    ],
    cta: "Contact Sales",
    popular: false,
  },
];

const faqs = [
  {
    q: "Can I switch plans anytime?",
    a: "Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately, and we'll prorate your billing.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major credit cards (Visa, Mastercard, American Express) through our secure payment provider, Stripe.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes! Pro plans come with a 14-day free trial. No credit card required to start.",
  },
  {
    q: "What happens to my data if I downgrade?",
    a: "Your data is always safe. If you downgrade, you'll still have read-only access to historical data beyond your plan limits.",
  },
];

export default function PricingPage() {
  const [isYearly, setIsYearly] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const { user, isLoading: authLoading } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const router = useRouter();

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
      window.location.href = "mailto:sales@devograph.io?subject=Enterprise%20Inquiry";
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
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
              <GitBranch className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">Devograph</span>
          </Link>
          <div className="flex items-center gap-4">
            {user ? (
              <Link
                href="/dashboard"
                className="px-4 py-2 text-slate-300 hover:text-white transition"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/"
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-900/30 rounded-full text-primary-400 text-sm mb-6">
            <Sparkles className="h-4 w-4" />
            Simple, transparent pricing
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Choose the plan that's right for you
          </h1>
          <p className="text-xl text-slate-400 mb-8">
            Start free and scale as you grow. All plans include core features
            to help you understand and improve your development workflow.
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4 mb-12">
            <span className={`text-sm ${!isYearly ? "text-white" : "text-slate-400"}`}>
              Monthly
            </span>
            <button
              onClick={() => setIsYearly(!isYearly)}
              className={`relative w-14 h-7 rounded-full transition-colors ${
                isYearly ? "bg-primary-600" : "bg-slate-700"
              }`}
            >
              <span
                className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                  isYearly ? "left-8" : "left-1"
                }`}
              />
            </button>
            <span className={`text-sm ${isYearly ? "text-white" : "text-slate-400"}`}>
              Yearly
              <span className="ml-2 text-xs text-green-400 font-medium">Save 17%</span>
            </span>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20 px-4">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
          {plans.map((plan) => {
            const Icon = plan.icon;
            const price = isYearly ? plan.priceYearly : plan.priceMonthly;
            const period = isYearly ? "/year" : "/month";

            return (
              <div
                key={plan.tier}
                className={`relative bg-slate-900 rounded-2xl border ${
                  plan.popular ? "border-primary-500" : "border-slate-800"
                } overflow-hidden`}
              >
                {plan.popular && (
                  <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-primary-500 to-primary-600 text-white text-center text-sm font-medium py-1.5">
                    Most Popular
                  </div>
                )}

                <div className={`p-8 ${plan.popular ? "pt-12" : ""}`}>
                  {/* Plan Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2 rounded-lg bg-gradient-to-br ${plan.color}`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-white">{plan.name}</h3>
                  </div>

                  <p className="text-slate-400 text-sm mb-6">{plan.description}</p>

                  {/* Price */}
                  <div className="mb-6">
                    <span className="text-4xl font-bold text-white">
                      ${price === 0 ? "0" : price}
                    </span>
                    {price > 0 && (
                      <span className="text-slate-400 ml-1">{period}</span>
                    )}
                  </div>

                  {/* CTA Button */}
                  <button
                    onClick={() => handleSubscribe(plan.tier)}
                    disabled={loading === plan.tier}
                    className={`w-full py-3 px-4 rounded-lg font-medium transition flex items-center justify-center gap-2 ${
                      plan.popular
                        ? "bg-primary-600 hover:bg-primary-700 text-white"
                        : plan.tier === "enterprise"
                        ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                        : "bg-slate-800 hover:bg-slate-700 text-white"
                    } disabled:opacity-50`}
                  >
                    {loading === plan.tier ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        {plan.cta}
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>

                  {/* Features */}
                  <div className="mt-8 space-y-3">
                    {plan.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        {feature.included ? (
                          <Check className="h-5 w-5 text-green-400 flex-shrink-0" />
                        ) : (
                          <X className="h-5 w-5 text-slate-600 flex-shrink-0" />
                        )}
                        <span
                          className={
                            feature.included ? "text-slate-300" : "text-slate-500"
                          }
                        >
                          {feature.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Features Highlight */}
      <section className="py-20 px-4 border-t border-slate-800">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
            Everything you need to level up
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 bg-primary-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="h-6 w-6 text-primary-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Deep Analytics
              </h3>
              <p className="text-slate-400">
                Understand your coding patterns, productivity trends, and areas for
                improvement with AI-powered insights.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-primary-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Bot className="h-6 w-6 text-primary-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                AI-Powered Insights
              </h3>
              <p className="text-slate-400">
                Get personalized recommendations to improve code quality, reduce
                technical debt, and boost team productivity.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-primary-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Shield className="h-6 w-6 text-primary-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Enterprise Security
              </h3>
              <p className="text-slate-400">
                Your code stays on GitHub. We only analyze metadata to provide
                insights while keeping your code secure.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 border-t border-slate-800">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            {faqs.map((faq, idx) => (
              <div key={idx} className="bg-slate-900 rounded-xl p-6 border border-slate-800">
                <h3 className="text-lg font-medium text-white mb-2">{faq.q}</h3>
                <p className="text-slate-400">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 border-t border-slate-800">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to supercharge your development?
          </h2>
          <p className="text-xl text-slate-400 mb-8">
            Join thousands of developers who use Devograph to understand and improve
            their workflow.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/"
              className="px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition flex items-center gap-2"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="mailto:sales@devograph.io"
              className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition"
            >
              Contact Sales
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-br from-primary-500 to-primary-600 rounded flex items-center justify-center">
              <GitBranch className="h-4 w-4 text-white" />
            </div>
            <span className="text-slate-400">Devograph</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <Link href="/privacy" className="hover:text-white transition">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-white transition">
              Terms
            </Link>
            <Link href="mailto:support@devograph.io" className="hover:text-white transition">
              Support
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
