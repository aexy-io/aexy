"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, Sparkles, Loader2, Check, ArrowRight } from "lucide-react";
import { PlanFeatures } from "@/lib/api";
import { PlanComparison } from "./PlanComparison";

interface ChangePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  currentPlan: PlanFeatures | null;
  targetPlan: PlanFeatures;
  isUpgrade: boolean;
  billingPeriod: "monthly" | "annual";
}

export function ChangePlanModal({
  isOpen,
  onClose,
  onConfirm,
  currentPlan,
  targetPlan,
  isUpgrade,
  billingPeriod,
}: ChangePlanModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change plan. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const price = billingPeriod === "annual"
    ? Math.floor(targetPlan.price_monthly_cents * 0.83 / 100)
    : targetPlan.price_monthly_cents / 100;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className={`p-6 ${isUpgrade ? "bg-gradient-to-r from-primary-500/20 to-primary-600/20" : "bg-gradient-to-r from-amber-500/20 to-orange-500/20"}`}>
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-xl ${isUpgrade ? "bg-primary-500/20" : "bg-amber-500/20"}`}>
                  {isUpgrade ? (
                    <Sparkles className={`h-6 w-6 ${isUpgrade ? "text-primary-400" : "text-amber-400"}`} />
                  ) : (
                    <AlertTriangle className="h-6 w-6 text-amber-400" />
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    {isUpgrade ? "Upgrade to" : "Downgrade to"} {targetPlan.name}
                  </h2>
                  <p className="text-slate-400 text-sm">
                    {isUpgrade
                      ? "Unlock more features for your team"
                      : "You'll lose access to some features"}
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Price info for upgrades */}
              {isUpgrade && targetPlan.price_monthly_cents > 0 && (
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                  <div className="flex items-baseline justify-between">
                    <span className="text-slate-400">New monthly rate</span>
                    <span className="text-2xl font-bold text-white">
                      ${price}
                      <span className="text-sm font-normal text-slate-400">/month</span>
                    </span>
                  </div>
                  <p className="text-slate-500 text-sm mt-2">
                    Prorated for the current billing period
                  </p>
                </div>
              )}

              {/* Downgrade warning */}
              {!isUpgrade && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                  <div className="flex gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-amber-400 font-medium">You'll lose access to premium features</p>
                      <p className="text-slate-400 text-sm mt-1">
                        Your data will be preserved, but some features will be disabled until you upgrade again.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Plan comparison */}
              <PlanComparison
                currentPlan={currentPlan}
                targetPlan={targetPlan}
                isUpgrade={isUpgrade}
              />

              {/* Error message */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-700 flex gap-3">
              <button
                onClick={onClose}
                disabled={isLoading}
                className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition font-medium disabled:opacity-50"
              >
                {isUpgrade ? "Cancel" : `Keep ${currentPlan?.name || "Current Plan"}`}
              </button>
              <button
                onClick={handleConfirm}
                disabled={isLoading}
                className={`flex-1 px-4 py-2.5 rounded-lg transition font-medium flex items-center justify-center gap-2 ${
                  isUpgrade
                    ? "bg-primary-600 hover:bg-primary-700 text-white"
                    : "bg-amber-500 hover:bg-amber-600 text-black"
                } disabled:opacity-50`}
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    {isUpgrade ? "Confirm Upgrade" : "Confirm Downgrade"}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
