"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Fingerprint, RefreshCw, Settings2, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { useClaimGhostCommits, useGhostClaimPreview } from "@/hooks/useIdentity";

/**
 * Auto-detecting banner that surfaces unclaimed orphan commits where the
 * symptom is visible (insights pages, own profile, leaderboard). Calls the
 * cheap preview endpoint on mount; renders nothing if nothing to claim or
 * if the user dismissed it this session.
 *
 * One-click claim path: in-place mutation + success state, no navigation
 * required. For multi-step management, link to `/settings/identity`.
 */
export function ClaimCommitsBanner() {
  const t = useTranslations("identity");
  const { data: preview, isLoading } = useGhostClaimPreview();
  const claim = useClaimGhostCommits();
  const [dismissed, setDismissed] = useState(false);

  // Session-scoped dismissal: a user who closes the banner doesn't see it
  // again until they reload the tab. Don't use localStorage — they might
  // want it back after a fresh session if they didn't actually claim.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem("claim-banner-dismissed") === "1") {
      setDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("claim-banner-dismissed", "1");
    }
    setDismissed(true);
  };

  // Don't render anything when loading (no flash), nothing to claim, or
  // dismissed. Also hide after a successful claim — the toast covers it.
  if (
    isLoading ||
    dismissed ||
    !preview ||
    !preview.ghost_id ||
    !preview.github_username ||
    claim.isSuccess
  ) {
    return null;
  }

  const totalOrphans =
    (preview.commits || 0) + (preview.prs || 0) + (preview.reviews || 0);
  if (totalOrphans === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 sm:px-5 sm:py-4 mb-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="rounded-lg bg-amber-500/20 p-1.5 shrink-0 mt-0.5">
            <Fingerprint className="h-4 w-4 text-amber-700 dark:text-amber-400" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">
              {t("banner.title", {
                count: preview.commits || 0,
                username: preview.github_username,
              })}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {t("banner.subtitle")}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <Link
            href="/settings/identity"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <Settings2 className="h-3 w-3" />
            {t("banner.settings")}
          </Link>
          <button
            type="button"
            onClick={handleDismiss}
            disabled={claim.isPending}
            className="text-xs text-muted-foreground hover:text-foreground rounded-md px-2 py-1"
          >
            {t("banner.dismiss")}
          </button>
          <button
            type="button"
            onClick={() => claim.mutate()}
            disabled={claim.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 hover:bg-amber-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3 w-3 ${claim.isPending ? "animate-spin" : ""}`}
            />
            {claim.isPending ? t("claiming") : t("banner.claim")}
          </button>
          <button
            type="button"
            aria-label={t("banner.dismiss")}
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground rounded-md p-1 -mr-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
