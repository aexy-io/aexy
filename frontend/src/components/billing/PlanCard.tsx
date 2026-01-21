"use client";

import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Loader2, LucideIcon } from "lucide-react";

export interface PlanData {
  name: string;
  tier: string;
  tagline: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  priceLabel: string;
  icon: LucideIcon;
  color: string;
  borderColor: string;
  textColor: string;
  features: string[];
  bestFor: string[];
  cta: string;
  popular: boolean;
}

interface PlanCardProps {
  plan: PlanData;
  billingPeriod: "monthly" | "annual";
  isCurrentPlan?: boolean;
  isLoading?: boolean;
  onSelect: (tier: string) => void;
  animationDelay?: number;
}

export function PlanCard({
  plan,
  billingPeriod,
  isCurrentPlan = false,
  isLoading = false,
  onSelect,
  animationDelay = 0,
}: PlanCardProps) {
  const Icon = plan.icon;
  const displayPrice = billingPeriod === "annual" ? plan.annualPrice : plan.monthlyPrice;
  const isCustomPrice = plan.monthlyPrice === -1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: animationDelay }}
      className={`relative group ${plan.popular ? "md:-mt-4 md:mb-4" : ""}`}
    >
      {plan.popular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: animationDelay + 0.2 }}
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
            transition={{ type: "spring", delay: animationDelay + 0.2 }}
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
            <Icon className="h-6 w-6 text-white" />
          </motion.div>
          <div>
            <span className={`text-xs font-semibold tracking-wider ${plan.textColor}`}>
              {plan.tagline.toUpperCase()}
            </span>
          </div>
        </div>

        <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
        <p className="text-white/50 text-sm mb-6">{plan.description}</p>

        {/* Price */}
        <div className="mb-6 h-16">
          {isCustomPrice ? (
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-bold text-white">Custom</span>
            </div>
          ) : (
            <div className="flex items-baseline gap-1">
              <span className="text-white/50 text-2xl">$</span>
              <motion.span
                key={displayPrice}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className="text-5xl font-bold text-white"
              >
                {displayPrice}
              </motion.span>
            </div>
          )}
          <span className="text-white/40 text-sm">{plan.priceLabel}</span>
        </div>

        {/* CTA Button */}
        <button
          onClick={() => onSelect(plan.tier)}
          disabled={isLoading || isCurrentPlan}
          className={`w-full py-3.5 px-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
            isCurrentPlan
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default"
              : plan.popular
              ? "bg-white text-black hover:bg-white/90 hover:shadow-lg hover:shadow-white/10"
              : plan.tier === "enterprise"
              ? "bg-gradient-to-r from-purple-500 to-violet-500 text-white hover:from-purple-600 hover:to-violet-600"
              : "bg-white/10 text-white hover:bg-white/20 border border-white/10"
          } disabled:opacity-50`}
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
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
          <div className="text-white/40 text-xs font-semibold tracking-wider mb-4">
            WHAT YOU GET
          </div>
          {plan.features.map((feature, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: animationDelay + idx * 0.05 }}
              className="flex items-start gap-3"
            >
              <CheckCircle2 className={`h-5 w-5 ${plan.textColor} flex-shrink-0 mt-0.5`} />
              <span className="text-white/70 text-sm">{feature}</span>
            </motion.div>
          ))}
        </div>

        {/* Best For */}
        <div className="mt-8 pt-6 border-t border-white/10">
          <div className="text-white/40 text-xs font-semibold tracking-wider mb-3">
            BEST FOR
          </div>
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
    </motion.div>
  );
}
