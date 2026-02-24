"use client";

import Link from "next/link";
import { Crown, ArrowRight, X } from "lucide-react";
import { useState } from "react";
import { useSubscription } from "@/hooks/useSubscription";

interface UpgradeBannerProps {
  /** What triggered the banner (used for messaging) */
  trigger:
    | "repo_limit"
    | "ai_limit"
    | "automation_limit"
    | "member_limit"
    | "module_limit"
    | "export_limit"
    | "generic";
  /** Current usage count */
  current?: number;
  /** Plan limit */
  limit?: number;
  /** Override the default message */
  message?: string;
  /** Whether the banner can be dismissed */
  dismissible?: boolean;
  /** Compact single-line variant */
  compact?: boolean;
}

const TRIGGER_MESSAGES: Record<string, { title: string; description: string; cta: string }> = {
  repo_limit: {
    title: "Repository limit reached",
    description: "Upgrade to connect unlimited repositories and unlock full codebase analysis.",
    cta: "Upgrade for more repos",
  },
  ai_limit: {
    title: "AI request limit reached",
    description: "You've used all your daily AI-powered insights. Upgrade for 10x more.",
    cta: "Upgrade for more AI",
  },
  automation_limit: {
    title: "Automation run limit approaching",
    description: "Upgrade for unlimited automation runs across all modules.",
    cta: "Upgrade for unlimited automations",
  },
  member_limit: {
    title: "Team member limit reached",
    description: "Add unlimited team members with a Pro subscription.",
    cta: "Upgrade for unlimited members",
  },
  module_limit: {
    title: "Unlock more modules",
    description: "Upgrade to access all modules and connect your entire workflow.",
    cta: "Upgrade for all modules",
  },
  export_limit: {
    title: "Export limit reached",
    description: "Upgrade to export unlimited data in any format.",
    cta: "Upgrade for exports",
  },
  generic: {
    title: "Unlock more with Pro",
    description: "Get advanced analytics, unlimited AI requests, and team features.",
    cta: "See plans",
  },
};

export function UpgradeBanner({
  trigger,
  current,
  limit,
  message,
  dismissible = true,
  compact = false,
}: UpgradeBannerProps) {
  const { isFree, isLoading } = useSubscription();
  const [dismissed, setDismissed] = useState(false);

  // Only show to free-tier users
  if (isLoading || !isFree || dismissed) return null;

  const config = TRIGGER_MESSAGES[trigger] || TRIGGER_MESSAGES.generic;
  const usageText =
    current !== undefined && limit !== undefined
      ? `${current}/${limit} used`
      : null;

  if (compact) {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-lg">
        <Crown className="h-4 w-4 text-amber-400 shrink-0" />
        <p className="text-sm text-foreground flex-1">
          {message || config.title}
          {usageText && (
            <span className="text-muted-foreground ml-1">({usageText})</span>
          )}
        </p>
        <Link
          href="/settings/plans"
          className="text-xs font-medium text-amber-400 hover:text-amber-300 transition whitespace-nowrap flex items-center gap-1"
        >
          {config.cta}
          <ArrowRight className="h-3 w-3" />
        </Link>
        {dismissible && (
          <button
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:text-foreground transition p-0.5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border border-amber-500/20 rounded-xl p-5">
      {dismissible && (
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <div className="flex items-start gap-4">
        <div className="p-2.5 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-lg shrink-0">
          <Crown className="h-5 w-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground mb-1">
            {message || config.title}
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            {config.description}
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/settings/plans"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-lg transition"
            >
              <Crown className="h-3.5 w-3.5" />
              {config.cta}
            </Link>
            {usageText && (
              <span className="text-xs text-muted-foreground">
                {usageText}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to check if a usage-based upgrade banner should show.
 * Returns true when usage >= threshold percentage of the limit.
 */
export function useShouldShowUpgradeBanner(
  current: number,
  limit: number,
  thresholdPercent = 80
): boolean {
  const { isFree } = useSubscription();
  if (!isFree || limit <= 0) return false;
  return (current / limit) * 100 >= thresholdPercent;
}
