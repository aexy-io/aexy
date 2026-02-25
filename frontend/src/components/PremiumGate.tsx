"use client";

import { ReactNode, useState } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { Crown, Lock, Sparkles, X } from "lucide-react";

type PremiumFeature = "team_features" | "sync" | "roles" | "exports" | "advanced_analytics" | "webhooks" | "sso" | "email_delivery";

interface PremiumGateProps {
  feature: PremiumFeature;
  children: ReactNode;
  fallback?: ReactNode;
  showBadge?: boolean;
  inline?: boolean;
}

const featureNames: Record<PremiumFeature, string> = {
  team_features: "Team Features",
  sync: "Repository Sync",
  roles: "Role Management",
  exports: "Data Exports",
  advanced_analytics: "Advanced Analytics",
  webhooks: "Webhooks",
  sso: "Single Sign-On",
  email_delivery: "Email Delivery Logs",
};

const featureDescriptions: Record<PremiumFeature, string> = {
  team_features: "Manage team members, sync from repositories, and assign roles.",
  sync: "Automatically sync team members from repository contributors.",
  roles: "Assign lead or member roles to organize your team.",
  exports: "Export your data in various formats for reporting.",
  advanced_analytics: "Get deeper insights into your team's performance.",
  webhooks: "Integrate with external services via webhooks.",
  sso: "Configure SAML or OpenID Connect for centralized authentication.",
  email_delivery: "Monitor email delivery status, bounces, and logs.",
};

const enterpriseFeatures: PremiumFeature[] = ["sso", "email_delivery"];

export function PremiumGate({
  feature,
  children,
  fallback,
  showBadge = true,
  inline = false,
}: PremiumGateProps) {
  const { canUseTeamFeatures, canUseExports, canUseAdvancedAnalytics, canUseWebhooks, isPremium, isEnterprise, isLoading } =
    useSubscription();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Check if user has access to this feature
  const hasAccess = (() => {
    switch (feature) {
      case "team_features":
      case "sync":
      case "roles":
        return canUseTeamFeatures;
      case "exports":
        return canUseExports;
      case "advanced_analytics":
        return canUseAdvancedAnalytics;
      case "webhooks":
        return canUseWebhooks;
      case "sso":
      case "email_delivery":
        return isEnterprise;
      default:
        return isPremium;
    }
  })();

  const isEnterpriseFeature = enterpriseFeatures.includes(feature);

  if (isLoading) {
    return <>{children}</>;
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  // Show fallback or locked state
  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <>
      <div
        className={`relative ${inline ? "inline-flex items-center" : ""}`}
        onClick={() => setShowUpgradeModal(true)}
      >
        <div className={`${inline ? "" : "opacity-50 pointer-events-none"}`}>{children}</div>
        {showBadge && (
          <span
            className={`${
              inline ? "ml-1.5" : "absolute -top-1 -right-1"
            } inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium cursor-pointer transition-all ${
              isEnterpriseFeature
                ? "bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600"
                : "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600"
            }`}
            title={isEnterpriseFeature ? "Enterprise feature" : "Pro feature"}
          >
            <Crown className="h-3 w-3" />
            {isEnterpriseFeature ? "Enterprise" : "Pro"}
          </span>
        )}
      </div>

      {showUpgradeModal && (
        <UpgradeModal feature={feature} onClose={() => setShowUpgradeModal(false)} />
      )}
    </>
  );
}

// Simple badge component for inline use
export function ProBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-gradient-to-r from-amber-500 to-orange-500 text-white ${className}`}
    >
      <Crown className="h-3 w-3" />
      Pro
    </span>
  );
}

// Upgrade modal component
function UpgradeModal({
  feature,
  onClose,
}: {
  feature: PremiumFeature;
  onClose: () => void;
}) {
  const isEnterprise = enterpriseFeatures.includes(feature);

  const handleUpgrade = () => {
    window.location.href = "/settings/plans";
  };

  const proBenefits = [
    "Sync members from repositories",
    "Assign team roles",
    "Advanced team analytics",
    "Unlimited LLM requests",
  ];

  const enterpriseBenefits = [
    "SAML & OpenID Connect SSO",
    "Email delivery monitoring & logs",
    "Priority support",
    "Custom integrations",
  ];

  const benefits = isEnterprise ? enterpriseBenefits : proBenefits;
  const tierLabel = isEnterprise ? "Enterprise" : "Pro";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className={`p-3 rounded-lg ${
            isEnterprise
              ? "bg-gradient-to-br from-purple-500/20 to-indigo-500/20"
              : "bg-gradient-to-br from-amber-500/20 to-orange-500/20"
          }`}>
            <Lock className={`h-6 w-6 ${isEnterprise ? "text-purple-400" : "text-amber-400"}`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">{featureNames[feature]}</h3>
            <p className="text-sm text-muted-foreground">{tierLabel} Feature</p>
          </div>
        </div>

        <p className="text-foreground mb-6">{featureDescriptions[feature]}</p>

        <div className="bg-muted/50 rounded-lg p-4 mb-6">
          <div className={`flex items-center gap-2 mb-2 ${isEnterprise ? "text-purple-400" : "text-amber-400"}`}>
            <Sparkles className="h-4 w-4" />
            <span className="font-medium">Unlock with {tierLabel}</span>
          </div>
          <ul className="text-sm text-foreground space-y-1.5">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-center gap-2">
                <span className="text-green-400">+</span> {benefit}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-foreground hover:text-foreground border border-border rounded-lg transition-colors"
          >
            Maybe Later
          </button>
          <button
            onClick={handleUpgrade}
            className={`flex-1 px-4 py-2.5 text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
              isEnterprise
                ? "bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600"
                : "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
            }`}
          >
            <Crown className="h-4 w-4" />
            {isEnterprise ? "Contact Sales" : "Upgrade to Pro"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Export the upgrade modal for standalone use
export { UpgradeModal };
