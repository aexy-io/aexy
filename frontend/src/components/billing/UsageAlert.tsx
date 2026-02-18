"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, X, TrendingUp, Zap, Coins } from "lucide-react";
import { useUsageWarnings, UsageWarning, TokenUsageWarning, formatCurrency, formatNumber } from "@/hooks/useBillingUsage";

// Type guard for TokenUsageWarning
function isTokenUsageWarning(warning: UsageWarning): warning is TokenUsageWarning {
  return "isOverage" in warning;
}

interface UsageAlertBannerProps {
  warning: UsageWarning;
  onDismiss?: () => void;
}

function UsageAlertBanner({ warning, onDismiss }: UsageAlertBannerProps) {
  const isTokenWarning = isTokenUsageWarning(warning);
  const isOverage = isTokenWarning && warning.isOverage;

  const severityStyles = {
    warning: {
      bg: isOverage ? "bg-amber-900/40" : "bg-amber-100 dark:bg-amber-900/30",
      border: "border-amber-700",
      text: "text-amber-600 dark:text-amber-400",
      icon: isOverage ? <Coins className="h-5 w-5 text-amber-400" /> : <AlertTriangle className="h-5 w-5 text-amber-400" />,
      progressBg: "bg-amber-100 dark:bg-amber-900/50",
      progressBar: "bg-amber-500",
    },
    critical: {
      bg: "bg-red-50 dark:bg-red-900/30",
      border: "border-red-700",
      text: "text-red-600 dark:text-red-400",
      icon: <TrendingUp className="h-5 w-5 text-red-400" />,
      progressBg: "bg-red-100 dark:bg-red-900/50",
      progressBar: "bg-red-500",
    },
    limit_reached: {
      bg: "bg-red-900/40",
      border: "border-red-600",
      text: "text-red-300",
      icon: <Zap className="h-5 w-5 text-red-300" />,
      progressBg: "bg-red-900/60",
      progressBar: "bg-red-400",
    },
  };

  const styles = severityStyles[warning.severity];
  const percentage = Math.min(warning.percentage, 100);

  return (
    <div className={`${styles.bg} ${styles.border} border rounded-lg p-4 relative`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">{styles.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <p className={`${styles.text} font-medium`}>{warning.message}</p>
            {onDismiss && warning.severity !== "limit_reached" && (
              <button
                onClick={onDismiss}
                className="flex-shrink-0 p-1 text-muted-foreground hover:text-foreground transition"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Overage details for token warnings */}
          {isTokenWarning && warning.isOverage && warning.overageCostCents > 0 && (
            <div className="mt-2 flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                Overage: <span className="text-foreground font-medium">{formatNumber(warning.overageTokens)} tokens</span>
              </span>
              <span className="text-amber-400 font-medium">
                {formatCurrency(warning.overageCostCents)} charged
              </span>
            </div>
          )}

          {/* Progress bar - only show if not in overage */}
          {!isOverage && (
            <>
              <div className={`mt-3 h-2 ${styles.progressBg} rounded-full overflow-hidden`}>
                <div
                  className={`h-full ${styles.progressBar} rounded-full transition-all duration-500`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <p className="text-muted-foreground text-sm mt-1">
                {Math.round(percentage)}% used
                {isTokenWarning && warning.freeTokensRemaining > 0 && (
                  <span> - {formatNumber(warning.freeTokensRemaining)} free tokens remaining</span>
                )}
              </p>
            </>
          )}

          {/* CTA button */}
          <Link
            href="/settings/plans"
            className={`mt-3 inline-flex items-center gap-2 px-4 py-2 ${
              warning.severity === "limit_reached"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-primary-600 hover:bg-primary-700"
            } text-foreground text-sm font-medium rounded-lg transition`}
          >
            {warning.ctaText}
          </Link>
        </div>
      </div>
    </div>
  );
}

interface UsageAlertsProps {
  className?: string;
}

export function UsageAlerts({ className = "" }: UsageAlertsProps) {
  const { warnings, isLoading } = useUsageWarnings();
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  if (isLoading || warnings.length === 0) {
    return null;
  }

  const visibleWarnings = warnings.filter(
    (w) => !dismissedAlerts.has(`${w.resourceName}-${w.severity}`)
  );

  if (visibleWarnings.length === 0) {
    return null;
  }

  const handleDismiss = (warning: UsageWarning) => {
    setDismissedAlerts((prev) => {
      const next = new Set(prev);
      next.add(`${warning.resourceName}-${warning.severity}`);
      return next;
    });
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {visibleWarnings.map((warning, index) => (
        <UsageAlertBanner
          key={`${warning.resourceName}-${warning.severity}-${index}`}
          warning={warning}
          onDismiss={() => handleDismiss(warning)}
        />
      ))}
    </div>
  );
}

// Single alert component for specific thresholds
interface SingleUsageAlertProps {
  resourceName: string;
  current: number;
  limit: number;
  onDismiss?: () => void;
  className?: string;
}

export function SingleUsageAlert({
  resourceName,
  current,
  limit,
  onDismiss,
  className = "",
}: SingleUsageAlertProps) {
  if (limit <= 0) return null;

  const percentage = (current / limit) * 100;

  if (percentage < 80) return null;

  const warning: UsageWarning = {
    severity:
      percentage >= 100
        ? "limit_reached"
        : percentage >= 90
        ? "critical"
        : "warning",
    percentage,
    resourceName,
    message:
      percentage >= 100
        ? `You've reached your ${resourceName} limit. Upgrade your plan to continue.`
        : `You've used ${Math.round(percentage)}% of your ${resourceName}.`,
    ctaText:
      percentage >= 100 ? "Upgrade Now" : percentage >= 90 ? "Upgrade Plan" : "View Plans",
  };

  return (
    <div className={className}>
      <UsageAlertBanner warning={warning} onDismiss={onDismiss} />
    </div>
  );
}

export default UsageAlerts;
