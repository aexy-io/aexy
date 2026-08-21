"use client";

/**
 * How the AI edits Word documents in this workspace.
 *
 * A workspace page rather than a personal preference, because none of it is
 * personal: the handle that triggers a draft, the name signed on a tracked
 * change, and the ceiling on how many changes one proposal may carry are all
 * properties of the file everybody reviews. There is no honest way to reconcile
 * four opinions about what the AI is called inside one document.
 *
 * Autosaving per control, like `DocImpactSettings`, rather than a save bar:
 * every setting here is independent, so there is nothing to submit as a set and
 * nothing a discard would usefully revert.
 *
 * Who hears about a draft is NOT here — that is per-person, and
 * `/settings/notifications` already owns it, per event and per channel. The one
 * thing this page decides is whether a machine-initiated draft reaches the
 * document's owner at all, which is a workspace policy about noise rather than
 * a preference about delivery.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import {
  SettingsAutosaveHint,
  SettingsPage,
  SettingsRow,
  SettingsRowGroup,
  SettingsSection,
  SettingsSkeleton,
} from "@/components/settings/SettingsPrimitives";
import {
  useDocsAiSettings,
  useUpdateDocsAiSettings,
} from "@/hooks/useDocsAiSettings";
import type { DocsAiSettingsUpdate } from "@/lib/docs-ai-settings-api";

export default function DocsSettingsPage() {
  const t = useTranslations("settingsDocsAi");

  const { data: settings, isLoading } = useDocsAiSettings();
  const update = useUpdateDocsAiSettings();

  // The two free-text fields are local until committed, so a keystroke is not a
  // request. Seeded from the server and re-seeded when it answers again, which
  // is also how another admin's change arriving on a refetch reaches the inputs.
  const [handle, setHandle] = useState("");
  const [authorLabel, setAuthorLabel] = useState("");

  useEffect(() => {
    if (!settings) return;
    setHandle(settings.comment_trigger_handle);
    setAuthorLabel(settings.ai_author_label);
  }, [settings?.comment_trigger_handle, settings?.ai_author_label]);

  if (isLoading || !settings) return <SettingsSkeleton rows={3} />;

  const readOnly = !settings.can_manage || update.isPending;
  const enabled = settings.mode === "on";
  const save = (changes: DocsAiSettingsUpdate) => update.mutate(changes);

  const toggle = (
    key: "comment_trigger" | "allow_ai_comments" | "notify_owner",
    labelKey: string,
    descriptionKey: string,
    disabled = false
  ) => (
    <SettingsRow
      label={t(labelKey)}
      description={t(descriptionKey)}
      htmlFor={`docs-ai-${key}`}
      control={
        <input
          id={`docs-ai-${key}`}
          data-testid={`docs-ai-${key}`}
          type="checkbox"
          className="h-4 w-4"
          checked={settings[key]}
          disabled={readOnly || disabled}
          onChange={(event) => save({ [key]: event.target.checked })}
        />
      }
    />
  );

  return (
    <SettingsPage title={t("title")} description={t("description")}>
      {!settings.can_manage && (
        <p
          data-testid="docs-ai-read-only"
          className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted-foreground"
        >
          {t("readOnly")}
        </p>
      )}

      <SettingsSection title={t("featureTitle")} description={t("featureDescription")}>
        <SettingsRowGroup>
          <SettingsRow
            label={t("modeLabel")}
            description={t("modeDescription")}
            htmlFor="docs-ai-mode"
            control={
              <input
                id="docs-ai-mode"
                data-testid="docs-ai-mode"
                type="checkbox"
                className="h-4 w-4"
                checked={enabled}
                disabled={readOnly}
                onChange={(event) =>
                  save({ mode: event.target.checked ? "on" : "off" })
                }
              />
            }
          />
          {toggle(
            "allow_ai_comments",
            "allowCommentsLabel",
            "allowCommentsDescription",
            !enabled
          )}
          <SettingsRow
            label={t("maxOpsLabel")}
            description={t("maxOpsDescription")}
            htmlFor="docs-ai-max-ops"
            control={
              <input
                id="docs-ai-max-ops"
                data-testid="docs-ai-max-ops"
                type="number"
                min={1}
                max={50}
                className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm"
                defaultValue={settings.max_ops}
                disabled={readOnly || !enabled}
                // On blur rather than on change: a number input passes through
                // the empty string while you retype it, and every intermediate
                // value would otherwise be a request the server clamps.
                onBlur={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isInteger(next) || next === settings.max_ops) {
                    event.target.value = String(settings.max_ops);
                    return;
                  }
                  save({ max_ops: next });
                }}
              />
            }
          />
        </SettingsRowGroup>
      </SettingsSection>

      <SettingsSection
        title={t("mentionTitle")}
        description={t("mentionDescription")}
      >
        <SettingsRowGroup>
          {toggle(
            "comment_trigger",
            "commentTriggerLabel",
            "commentTriggerDescription",
            !enabled
          )}
          <SettingsRow
            label={t("handleLabel")}
            description={t("handleDescription", {
              mention: `@${settings.comment_trigger_handle}`,
            })}
            htmlFor="docs-ai-handle"
            control={
              <div className="flex items-center gap-1">
                <span aria-hidden className="text-sm text-muted-foreground">
                  @
                </span>
                <input
                  id="docs-ai-handle"
                  data-testid="docs-ai-handle"
                  className="w-40 rounded-md border border-border bg-background px-2 py-1 text-sm"
                  value={handle}
                  disabled={readOnly || !enabled || !settings.comment_trigger}
                  onChange={(event) => setHandle(event.target.value)}
                  onBlur={() => {
                    const next = handle.trim().replace(/^@/, "");
                    if (!next || next === settings.comment_trigger_handle) {
                      setHandle(settings.comment_trigger_handle);
                      return;
                    }
                    save({ comment_trigger_handle: next });
                  }}
                />
              </div>
            }
          />
        </SettingsRowGroup>
      </SettingsSection>

      <SettingsSection
        title={t("attributionTitle")}
        description={t("attributionDescription")}
      >
        <SettingsRowGroup>
          <SettingsRow
            label={t("authorLabel")}
            description={t("authorDescription")}
            htmlFor="docs-ai-author"
            control={
              <input
                id="docs-ai-author"
                data-testid="docs-ai-author"
                className="w-48 rounded-md border border-border bg-background px-2 py-1 text-sm"
                value={authorLabel}
                disabled={readOnly || !enabled}
                onChange={(event) => setAuthorLabel(event.target.value)}
                onBlur={() => {
                  const next = authorLabel.trim();
                  if (!next || next === settings.ai_author_label) {
                    setAuthorLabel(settings.ai_author_label);
                    return;
                  }
                  save({ ai_author_label: next });
                }}
              />
            }
          />
          {toggle("notify_owner", "notifyOwnerLabel", "notifyOwnerDescription", !enabled)}
        </SettingsRowGroup>

        <p className="mt-4 text-xs text-muted-foreground">
          {t("notificationsHint")}{" "}
          <Link href="/settings/notifications" className="underline">
            {t("notificationsLink")}
          </Link>
        </p>
      </SettingsSection>

      <p className="text-xs text-muted-foreground">
        <SettingsAutosaveHint>{t("autosave")}</SettingsAutosaveHint>
      </p>
    </SettingsPage>
  );
}
