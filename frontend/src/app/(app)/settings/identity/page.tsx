"use client";

import Link from "next/link";
import {
  CheckCircle2,
  Fingerprint,
  Github,
  GitCommit,
  GitPullRequest,
  MessageSquare,
  RefreshCw,
  Settings2,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { useAuth } from "@/hooks/useAuth";
import { useClaimGhostCommits, useGhostClaimPreview } from "@/hooks/useIdentity";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";

import { EmailAliasesSection } from "./EmailAliasesSection";

function MetricChip({
  icon: Icon,
  label,
}: {
  icon: typeof GitCommit;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-sm text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

export default function IdentitySettingsPage() {
  const t = useTranslations("identity");
  const { data: preview, isLoading } = useGhostClaimPreview();
  const claim = useClaimGhostCommits();

  const { user } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const { members } = useWorkspaceMembers(currentWorkspaceId);
  const currentMember = members?.find((m) => m.developer_id === user?.id);
  const isAdmin =
    currentMember?.role === "owner" || currentMember?.role === "admin";

  const username = preview?.github_username;
  const hasGhost = preview && preview.ghost_id !== null;
  const hasGithub = !!username;

  // Optimistic post-claim numbers come from the mutation result, not the
  // preview (preview will only refresh after invalidation).
  const justClaimed = claim.isSuccess && claim.data;
  const claimedTotal = justClaimed
    ? claim.data.commits + claim.data.prs + claim.data.reviews
    : 0;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 mt-0.5">
            <Fingerprint className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              {t("title")}
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              {t("intro")}
            </p>
          </div>
        </div>
        {isAdmin && (
          <Link
            href="/settings/identity/admin"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2 py-1 shrink-0"
          >
            <Settings2 className="h-3 w-3" />
            Admin
          </Link>
        )}
      </header>

      {!hasGithub && !isLoading && (
        <section className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-foreground">{t("noGithub")}</p>
          <Link
            href="/settings/integrations"
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
          >
            <Github className="h-4 w-4" />
            {t("noGithubLink")}
          </Link>
        </section>
      )}

      {/* Loading skeleton — visible bones so users see structure forming. */}
      {isLoading && (
        <section className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="h-5 w-48 rounded bg-muted animate-pulse" />
          <div className="flex gap-2">
            <div className="h-7 w-20 rounded-md bg-muted animate-pulse" />
            <div className="h-7 w-24 rounded-md bg-muted animate-pulse" />
            <div className="h-7 w-20 rounded-md bg-muted animate-pulse" />
          </div>
          <div className="h-9 w-36 rounded-md bg-muted animate-pulse" />
        </section>
      )}

      {/* Post-claim celebratory state — bright CTA to go see the result. */}
      {justClaimed && claimedTotal > 0 && (
        <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-base font-semibold text-foreground">
              {t("successHeader")}
            </h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("successDetail", {
              commits: claim.data.commits,
              prs: claim.data.prs,
              reviews: claim.data.reviews,
            })}
          </p>
          {user?.id && (
            <Link
              href={`/insights/developers/${user.id}`}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white"
            >
              <Sparkles className="h-4 w-4" />
              {t("successCta")}
            </Link>
          )}
        </section>
      )}

      {hasGithub && !isLoading && !justClaimed && (
        <section className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center gap-2 text-sm">
            <Github className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{t("github")}</span>
            <span className="font-mono font-medium">@{username}</span>
          </div>

          {!hasGhost ? (
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                {t("noneFound", { username })}
              </p>
            </div>
          ) : (
            <>
              <div>
                <h3 className="text-sm font-medium text-foreground mb-2">
                  {t("previewHeader")}
                </h3>
                <div className="flex flex-wrap gap-2">
                  <MetricChip
                    icon={GitCommit}
                    label={t("metrics.commits", {
                      count: preview!.commits,
                    })}
                  />
                  <MetricChip
                    icon={GitPullRequest}
                    label={t("metrics.prs", { count: preview!.prs })}
                  />
                  <MetricChip
                    icon={MessageSquare}
                    label={t("metrics.reviews", {
                      count: preview!.reviews,
                    })}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => claim.mutate()}
                disabled={claim.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-primary hover:bg-primary/90 px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw
                  className={`h-4 w-4 ${claim.isPending ? "animate-spin" : ""}`}
                />
                {claim.isPending ? t("claiming") : t("claim")}
              </button>
            </>
          )}

          <p className="text-xs text-muted-foreground border-t border-border pt-4">
            {t("explainer")}
          </p>
        </section>
      )}

      {hasGithub && !isLoading && <EmailAliasesSection />}
    </div>
  );
}
