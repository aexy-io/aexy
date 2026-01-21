"use client";

import { motion } from "framer-motion";
import { Check, X, ArrowRight, Minus } from "lucide-react";
import { PlanFeatures } from "@/lib/api";

interface PlanComparisonProps {
  currentPlan: PlanFeatures | null;
  targetPlan: PlanFeatures;
  isUpgrade: boolean;
}

interface ComparisonItem {
  label: string;
  currentValue: string | number | boolean;
  newValue: string | number | boolean;
  type: "number" | "boolean" | "string";
  isUnlimited?: (value: number) => boolean;
}

export function PlanComparison({ currentPlan, targetPlan, isUpgrade }: PlanComparisonProps) {
  const formatValue = (value: number | string | boolean, type: string, isUnlimited?: (v: number) => boolean): string => {
    if (type === "boolean") {
      return value ? "Included" : "Not included";
    }
    if (type === "number" && typeof value === "number") {
      if (isUnlimited?.(value)) return "Unlimited";
      return value.toString();
    }
    return String(value);
  };

  const isUnlimitedNumber = (value: number) => value === -1;

  const comparisons: ComparisonItem[] = [
    {
      label: "Repositories",
      currentValue: currentPlan?.max_repos ?? 3,
      newValue: targetPlan.max_repos,
      type: "number",
      isUnlimited: isUnlimitedNumber,
    },
    {
      label: "AI Requests per Day",
      currentValue: currentPlan?.llm_requests_per_day ?? 10,
      newValue: targetPlan.llm_requests_per_day,
      type: "number",
      isUnlimited: isUnlimitedNumber,
    },
    {
      label: "Sync History",
      currentValue: currentPlan?.sync_history_days ?? 30,
      newValue: targetPlan.sync_history_days,
      type: "number",
      isUnlimited: isUnlimitedNumber,
    },
    {
      label: "Real-time Sync",
      currentValue: currentPlan?.enable_real_time_sync ?? false,
      newValue: targetPlan.enable_real_time_sync,
      type: "boolean",
    },
    {
      label: "Advanced Analytics",
      currentValue: currentPlan?.enable_advanced_analytics ?? false,
      newValue: targetPlan.enable_advanced_analytics,
      type: "boolean",
    },
    {
      label: "Data Exports",
      currentValue: currentPlan?.enable_exports ?? false,
      newValue: targetPlan.enable_exports,
      type: "boolean",
    },
    {
      label: "Team Features",
      currentValue: currentPlan?.enable_team_features ?? false,
      newValue: targetPlan.enable_team_features,
      type: "boolean",
    },
    {
      label: "Webhooks",
      currentValue: currentPlan?.enable_webhooks ?? false,
      newValue: targetPlan.enable_webhooks,
      type: "boolean",
    },
  ];

  // Filter to show meaningful changes
  const changes = comparisons.filter(item => {
    const current = item.currentValue;
    const newVal = item.newValue;
    return current !== newVal;
  });

  const gains = changes.filter(item => {
    if (item.type === "boolean") {
      return item.newValue === true && item.currentValue === false;
    }
    if (item.type === "number") {
      const current = item.currentValue as number;
      const newVal = item.newValue as number;
      if (item.isUnlimited?.(newVal) && !item.isUnlimited?.(current)) return true;
      return newVal > current;
    }
    return false;
  });

  const losses = changes.filter(item => {
    if (item.type === "boolean") {
      return item.newValue === false && item.currentValue === true;
    }
    if (item.type === "number") {
      const current = item.currentValue as number;
      const newVal = item.newValue as number;
      if (item.isUnlimited?.(current) && !item.isUnlimited?.(newVal)) return true;
      return newVal < current && !item.isUnlimited?.(newVal);
    }
    return false;
  });

  if (changes.length === 0) {
    return (
      <div className="text-center text-slate-400 py-4">
        No changes between plans
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
      <h3 className="text-lg font-semibold text-white mb-4">
        {isUpgrade ? "What you'll gain with " : "Changes when switching to "}
        <span className={isUpgrade ? "text-primary-400" : "text-amber-400"}>
          {targetPlan.name}
        </span>
      </h3>

      <div className="space-y-3">
        {/* Gains */}
        {gains.map((item, idx) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="flex items-center gap-3"
          >
            <div className="p-1 bg-emerald-500/20 rounded-full">
              <Check className="h-4 w-4 text-emerald-400" />
            </div>
            <span className="text-slate-300 flex-1">{item.label}</span>
            {item.type === "number" && (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-slate-500">
                  {formatValue(item.currentValue, item.type, item.isUnlimited)}
                </span>
                <ArrowRight className="h-3 w-3 text-slate-500" />
                <span className="text-emerald-400 font-medium">
                  {formatValue(item.newValue, item.type, item.isUnlimited)}
                </span>
              </span>
            )}
            {item.type === "boolean" && (
              <span className="text-emerald-400 text-sm font-medium">
                + New
              </span>
            )}
          </motion.div>
        ))}

        {/* Separator if both gains and losses */}
        {gains.length > 0 && losses.length > 0 && (
          <div className="border-t border-slate-700 my-4" />
        )}

        {/* Losses */}
        {losses.map((item, idx) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: (gains.length + idx) * 0.05 }}
            className="flex items-center gap-3"
          >
            <div className="p-1 bg-red-500/20 rounded-full">
              <X className="h-4 w-4 text-red-400" />
            </div>
            <span className="text-slate-300 flex-1">{item.label}</span>
            {item.type === "number" && (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-slate-500">
                  {formatValue(item.currentValue, item.type, item.isUnlimited)}
                </span>
                <ArrowRight className="h-3 w-3 text-slate-500" />
                <span className="text-red-400 font-medium">
                  {formatValue(item.newValue, item.type, item.isUnlimited)}
                </span>
              </span>
            )}
            {item.type === "boolean" && (
              <span className="text-red-400 text-sm font-medium">
                Lost
              </span>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
