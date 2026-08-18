"use client";

import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { docImpactApi, DocImpactSettings as Settings } from "@/lib/api";

interface Props {
  workspaceId: string;
  /** Only an admin may change these — the same person who can grant the GitHub
   *  App the permission they depend on. */
  canEdit: boolean;
}

/**
 * Whether Aexy writes into this workspace's pull requests.
 *
 * Lives on the repositories settings page rather than a route of its own: this is
 * where the person who can grant App permissions already is, and a new route
 * would need a nav entry and would churn the settings-navigation test for one
 * section.
 *
 * Both GitHub toggles default off. The copy says out loud that this is a
 * workspace decision and not a personal preference — a comment on a pull request
 * is one shared artifact, and there is no honest way to reconcile four reviewers'
 * opinions about whether it exists.
 */
export function DocImpactSettings({ workspaceId, canEdit }: Props) {
  const t = useTranslations("settingsRepositories.docImpact");
  const queryClient = useQueryClient();
  const queryKey = ["doc-impact-settings", workspaceId];

  const { data: settings } = useQuery<Settings>({
    queryKey,
    queryFn: () => docImpactApi.getSettings(workspaceId),
    enabled: Boolean(workspaceId),
  });

  const update = useMutation({
    mutationFn: (changes: Partial<Settings>) =>
      docImpactApi.updateSettings(workspaceId, changes),
    onSuccess: (fresh) => queryClient.setQueryData(queryKey, fresh),
    onError: () => toast.error(t("saveFailed")),
  });

  if (!settings) return null;

  const row = (
    key: "enabled" | "pr_comment_enabled" | "check_run_enabled",
    label: string,
    description: string,
  ) => (
    <label
      key={key}
      className="flex items-start gap-3 py-2"
      data-testid={`doc-impact-${key}`}
    >
      <input
        type="checkbox"
        checked={settings[key]}
        disabled={!canEdit || update.isPending}
        onChange={(event) => update.mutate({ [key]: event.target.checked })}
        className="mt-0.5 h-4 w-4 shrink-0"
      />
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );

  return (
    <section data-testid="doc-impact-settings" className="space-y-1">
      <h3 className="text-sm font-medium text-foreground">{t("heading")}</h3>
      <p className="text-xs text-muted-foreground">{t("description")}</p>

      {/* The banner. Stateful and idempotent, unlike a notification — which would
          fire once per pull request and reach the author, who cannot grant an
          organisation's App permissions. */}
      {settings.github_write_block_reason && (
        <p
          data-testid="doc-impact-blocked"
          className="mt-2 flex items-start gap-2 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {settings.github_write_block_reason}{" "}
            <a
              href="https://github.com/settings/installations"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline"
            >
              {t("blockedAction")}
              <ExternalLink className="h-3 w-3" />
            </a>
          </span>
        </p>
      )}

      <div className="mt-1 divide-y divide-border/60">
        {row("enabled", t("enabledLabel"), t("enabledDescription"))}
        {row("pr_comment_enabled", t("commentLabel"), t("commentDescription"))}
        {row("check_run_enabled", t("checkLabel"), t("checkDescription"))}

        {settings.check_run_enabled && (
          <div className="py-2" data-testid="doc-impact-conclusion">
            <label
              htmlFor="check-run-conclusion"
              className="block text-sm text-foreground"
            >
              {t("conclusionLabel")}
            </label>
            <select
              id="check-run-conclusion"
              value={settings.check_run_conclusion}
              disabled={!canEdit || update.isPending}
              onChange={(event) =>
                update.mutate({ check_run_conclusion: event.target.value })
              }
              className="mt-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              <option value="neutral">{t("conclusionNeutral")}</option>
              <option value="action_required">{t("conclusionBlocking")}</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("conclusionHint")}
            </p>
          </div>
        )}
      </div>

      {/* Said plainly rather than discovered: an author who dislikes bot comments
          cannot opt out on their own, the same way branch protection is not a
          personal preference. */}
      <p className="pt-1 text-xs text-muted-foreground">{t("sharedNote")}</p>

      {!canEdit && (
        <p data-testid="doc-impact-readonly" className="text-xs text-muted-foreground">
          {t("adminOnly")}
        </p>
      )}
    </section>
  );
}
