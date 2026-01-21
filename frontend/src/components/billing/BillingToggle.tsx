"use client";

import { motion } from "framer-motion";

interface BillingToggleProps {
  billingPeriod: "monthly" | "annual";
  onToggle: (period: "monthly" | "annual") => void;
}

export function BillingToggle({ billingPeriod, onToggle }: BillingToggleProps) {
  return (
    <div className="flex items-center justify-center gap-3">
      <button
        onClick={() => onToggle("monthly")}
        className={`relative px-5 py-2 rounded-full text-sm font-medium transition-colors ${
          billingPeriod === "monthly"
            ? "text-white"
            : "text-white/50 hover:text-white/70"
        }`}
      >
        {billingPeriod === "monthly" && (
          <motion.div
            layoutId="billing-toggle"
            className="absolute inset-0 bg-white/10 border border-white/20 rounded-full"
            transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
          />
        )}
        <span className="relative z-10">Monthly</span>
      </button>

      <button
        onClick={() => onToggle("annual")}
        className={`relative px-5 py-2 rounded-full text-sm font-medium transition-colors ${
          billingPeriod === "annual"
            ? "text-white"
            : "text-white/50 hover:text-white/70"
        }`}
      >
        {billingPeriod === "annual" && (
          <motion.div
            layoutId="billing-toggle"
            className="absolute inset-0 bg-white/10 border border-white/20 rounded-full"
            transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
          />
        )}
        <span className="relative z-10 flex items-center gap-2">
          Annual
          <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-full border border-emerald-500/30">
            Save 17%
          </span>
        </span>
      </button>
    </div>
  );
}
