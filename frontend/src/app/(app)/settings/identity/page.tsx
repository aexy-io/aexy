"use client";

import Link from "next/link";
import { Fingerprint, Github, RefreshCw, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAuth } from "@/hooks/useAuth";
import { useClaimGhostCommits, useGhostClaimPreview } from "@/hooks/useIdentity";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";

export default function IdentitySettingsPage() {
  const t = useTranslations("identity");
  const { data: preview, isLoading } = useGhostClaimPreview();
  const claim = useClaimGhostCommits();

  // Admin badge only — non-admins don't see the admin entry point.
  const { user } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const { members } = useWorkspaceMembers(currentWorkspaceId);
  const currentMember = members?.find((m) => m.developer_id === user?.id);
  const isAdmin =
    currentMember?.role === "owner" || currentMember?.role === "admin";

  const username = preview?.github_username;
  const hasGhost = preview && preview.ghost_id !== null;
  const hasGithub = !!username;

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
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2 py-1"
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

      {isLoading && (
        <section className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {t("loading")}
        </section>
      )}

      {hasGithub && !isLoading && (
        <section className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center gap-2 text-sm">
            <Github className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{t("github")}</span>
            <span className="font-mono font-medium">@{username}</span>
          </div>

          {!hasGhost ? (
            <p className="text-sm text-muted-foreground">
              {t("noneFound", { username })}
            </p>
          ) : (
            <>
              <div>
                <h3 className="text-sm font-medium text-foreground mb-2">
                  {t("previewHeader")}
                </h3>
                <div className="flex flex-wrap gap-2 text-sm">
                  <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-muted-foreground">
                    {t("metrics.commits", { count: preview!.commits })}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-muted-foreground">
                    {t("metrics.prs", { count: preview!.prs })}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-muted-foreground">
                    {t("metrics.reviews", { count: preview!.reviews })}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => claim.mutate()}
                disabled={claim.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
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
    </div>
  );
}
