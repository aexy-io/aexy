"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ExternalLink,
  Hash,
  Loader2,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  communityApi,
  type CommunitySettings,
  type CommunityTemplate,
  type MemberPublicPref,
} from "@/lib/api";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { SettingsPage } from "@/components/settings/SettingsPrimitives";

interface PendingPost {
  id: string;
  content: string;
  created_at: string;
  channel_name: string;
  topic_name: string;
  sender_id: string;
  // True when this post opens a held thread. Approving publishes the whole
  // thread including its title; rejecting removes the thread, not one post.
  is_thread_opener?: boolean;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://aexy.io";

export default function CommunitySettingsPage() {
  const t = useTranslations("settingsCommunity");
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<CommunitySettings | null>(null);
  const [pref, setPref] = useState<MemberPublicPref>({
    public_display: "name",
    public_alias: null,
  });
  const [pending, setPending] = useState<PendingPost[]>([]);
  const [templates, setTemplates] = useState<CommunityTemplate[]>([]);
  const [applying, setApplying] = useState<string | null>(null);
  // A workspace with no channels published yet is the case the template picker
  // exists for; once it has some, the picker stops being the first thing.
  const [hasContent, setHasContent] = useState(false);

  const loadPending = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const res = await communityApi.listModerationQueue(workspaceId);
      setPending(res.pending);
    } catch {
      /* non-admins / disabled — ignore */
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    (async () => {
      setLoading(true);
      try {
        const [s, p, tpl] = await Promise.allSettled([
          communityApi.getSettings(workspaceId),
          communityApi.getMyPref(workspaceId),
          communityApi.listTemplates(workspaceId),
        ]);
        if (s.status === "fulfilled") setSettings(s.value);
        else
          setSettings({
            workspace_id: workspaceId,
            enabled: false,
            community_slug: currentWorkspace?.slug || "",
            title: null,
            description: null,
            logo_url: null,
            theme: {},
            default_public_display: "name",
            noindex: false,
            listed: false,
            allow_participation: false,
            post_moderation: "post",
            allow_new_topics: false,
            link_service_desk: false,
            link_docs: false,
          });
        if (p.status === "fulfilled") setPref(p.value);
        if (tpl.status === "fulfilled") setTemplates(tpl.value.templates);
        await loadPending();
      } finally {
        setLoading(false);
      }
    })();
  }, [workspaceId, currentWorkspace?.slug, loadPending]);

  const moderate = async (id: string, action: "approve" | "reject") => {
    if (!workspaceId) return;
    try {
      if (action === "approve") await communityApi.approvePost(workspaceId, id);
      else await communityApi.rejectPost(workspaceId, id);
      setPending((prev) => prev.filter((p) => p.id !== id));
      toast.success(action === "approve" ? t("toast.approved") : t("toast.rejected"));
    } catch {
      toast.error(t("toast.moderateFailed"));
    }
  };

  const saveSettings = async (patch: Partial<CommunitySettings>) => {
    if (!workspaceId || !settings) return;
    setSaving(true);
    try {
      const updated = await communityApi.updateSettings(workspaceId, { ...patch });
      setSettings(updated);
      toast.success(t("toast.saved"));
    } catch {
      toast.error(t("toast.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const applyTemplate = async (templateId: string) => {
    if (!workspaceId) return;
    setApplying(templateId);
    try {
      const result = await communityApi.applyTemplate(workspaceId, templateId);
      setHasContent(true);
      const fresh = await communityApi.getSettings(workspaceId);
      setSettings(fresh);
      if (result.channels_created.length > 0) {
        toast.success(
          t("toast.templateApplied", {
            channels: result.channels_created.length,
            threads: result.topics_created,
          }),
        );
        // Re-applying adds channels but leaves participation alone. Say so,
        // rather than letting the card's "anyone can reply" line imply the
        // template's defaults just took effect.
        if (!result.settings_applied) toast.info(t("toast.templateSettingsKept"));
      } else {
        // Idempotent by channel slug, so a second click is safe — but saying
        // "done" when nothing happened would be a lie.
        toast.info(t("toast.templateNothingToDo"));
      }
    } catch {
      toast.error(t("toast.templateFailed"));
    } finally {
      setApplying(null);
    }
  };

  const savePref = async (next: MemberPublicPref) => {
    if (!workspaceId) return;
    setPref(next);
    try {
      await communityApi.setMyPref(workspaceId, next);
    } catch {
      toast.error(t("toast.prefFailed"));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const publicUrl = settings ? `${SITE_URL}/community/${settings.community_slug}` : "";
  // Lead with the picker while there is nothing to publish. An empty forum with
  // a perfect settings page is not a forum.
  const showTemplatesFirst =
    templates.length > 0 && !settings?.enabled && !hasContent;

  const templateSection = (
    <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <h2 className="font-semibold text-foreground">{t("templates.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("templates.description")}</p>
        </div>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {templates.map((template) => (
          <li
            key={template.id}
            className="flex flex-col rounded-lg border border-border bg-background p-4"
          >
            <h3 className="font-medium text-foreground">{template.name}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{template.audience}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {template.description}
            </p>

            <ul className="mt-3 flex flex-wrap gap-1.5">
              {template.channels.map((channel) => (
                <li
                  key={channel.name}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                >
                  <Hash className="h-3 w-3" />
                  {channel.name}
                </li>
              ))}
            </ul>

            <p className="mt-3 text-xs text-muted-foreground">
              {template.allow_participation
                ? template.post_moderation === "pre"
                  ? t("templates.premoderated")
                  : t("templates.openReplies")
                : t("templates.readOnly")}
            </p>

            <button
              type="button"
              onClick={() => applyTemplate(template.id)}
              disabled={applying !== null}
              className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
            >
              {applying === template.id && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("templates.use")}
            </button>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">{t("templates.footnote")}</p>
    </section>
  );

  return (
    <SettingsPage title={t("title")} description={t("description")}>
      {showTemplatesFirst && templateSection}

      {/* Master switch */}
      <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={settings?.enabled ?? false}
            disabled={saving}
            onChange={(e) => saveSettings({ enabled: e.target.checked })}
          />
          <span>
            <span className="font-medium text-foreground">{t("enable.label")}</span>
            <p className="text-sm text-muted-foreground">{t("enable.hint")}</p>
          </span>
        </label>

        {settings?.enabled && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("enable.warning")}</span>
          </div>
        )}
      </section>

      {/* Branding + URL */}
      <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="font-semibold text-foreground">{t("details.title")}</h2>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            {t("details.publicUrl")}
          </label>
          <div className="flex items-center gap-2">
            <code className="truncate text-sm text-muted-foreground">{publicUrl}</code>
            {settings?.enabled && (
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("details.openPublicUrl")}
                className="text-blue-600 hover:text-blue-700"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>

        <div>
          <label
            htmlFor="community-title"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            {t("details.titleLabel")}
          </label>
          <input
            id="community-title"
            type="text"
            defaultValue={settings?.title || ""}
            onBlur={(e) => saveSettings({ title: e.target.value })}
            className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
            placeholder={t("details.titlePlaceholder")}
          />
        </div>

        <div>
          <label
            htmlFor="community-description"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            {t("details.descriptionLabel")}
          </label>
          <textarea
            id="community-description"
            defaultValue={settings?.description || ""}
            onBlur={(e) => saveSettings({ description: e.target.value })}
            className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
            rows={3}
            placeholder={t("details.descriptionPlaceholder")}
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings?.noindex ?? false}
            disabled={saving}
            onChange={(e) => saveSettings({ noindex: e.target.checked })}
          />
          <span className="text-foreground">{t("details.noindex")}</span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings?.listed ?? false}
            disabled={saving}
            onChange={(e) => saveSettings({ listed: e.target.checked })}
          />
          <span className="text-foreground">{t("details.listed")}</span>
        </label>
      </section>

      {/* Participation + moderation */}
      <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="font-semibold text-foreground">{t("participation.title")}</h2>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={settings?.allow_participation ?? false}
            disabled={saving}
            onChange={(e) => saveSettings({ allow_participation: e.target.checked })}
          />
          <span>
            <span className="font-medium text-foreground">
              {t("participation.repliesLabel")}
            </span>
            <p className="text-sm text-muted-foreground">
              {t("participation.repliesHint")}
            </p>
          </span>
        </label>

        {settings?.allow_participation && (
          <>
            <label className="flex items-start gap-3 pl-7">
              <input
                type="checkbox"
                className="mt-1"
                checked={settings?.allow_new_topics ?? false}
                disabled={saving}
                onChange={(e) => saveSettings({ allow_new_topics: e.target.checked })}
              />
              <span>
                <span className="font-medium text-foreground">
                  {t("participation.newTopicsLabel")}
                </span>
                <p className="text-sm text-muted-foreground">
                  {t("participation.newTopicsHint")}
                </p>
              </span>
            </label>

            <div className="space-y-2 pl-7">
              <p className="text-sm font-medium text-foreground">
                {t("participation.moderationTitle")}
              </p>
              {[
                { value: "post", label: t("participation.moderationPost") },
                { value: "pre", label: t("participation.moderationPre") },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="post_moderation"
                    checked={(settings?.post_moderation || "post") === opt.value}
                    onChange={() => saveSettings({ post_moderation: opt.value })}
                  />
                  <span className="text-foreground">{opt.label}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Connections to other modules — opt-in, off by default */}
      <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <div>
          <h2 className="font-semibold text-foreground">{t("connections.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("connections.description")}</p>
        </div>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={settings?.link_service_desk ?? false}
            disabled={saving}
            onChange={(e) => saveSettings({ link_service_desk: e.target.checked })}
          />
          <span>
            <span className="font-medium text-foreground">
              {t("connections.serviceDeskLabel")}
            </span>
            <p className="text-sm text-muted-foreground">
              {t("connections.serviceDeskHint")}
            </p>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={settings?.link_docs ?? false}
            disabled={saving}
            onChange={(e) => saveSettings({ link_docs: e.target.checked })}
          />
          <span>
            <span className="font-medium text-foreground">
              {t("connections.docsLabel")}
            </span>
            <p className="text-sm text-muted-foreground">{t("connections.docsHint")}</p>
          </span>
        </label>
      </section>

      {/* Moderation queue */}
      {pending.length > 0 && (
        <section
          data-testid="moderation-queue"
          className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-5 dark:border-amber-800 dark:bg-amber-900/10"
        >
          <h2 className="font-semibold text-foreground">
            {t("moderation.title", { count: pending.length })}
          </h2>
          <ul className="space-y-2">
            {pending.map((p) => (
              <li
                key={p.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-3"
              >
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    #{p.channel_name} · {p.topic_name}
                  </p>
                  <p className="break-words text-sm text-foreground">{p.content}</p>
                  {p.is_thread_opener && (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                      {t("moderation.wholeThread")}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => moderate(p.id, "approve")}
                    className="rounded-lg bg-green-600 p-1.5 text-white hover:bg-green-700"
                    title={t("moderation.approve")}
                    aria-label={t("moderation.approve")}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => moderate(p.id, "reject")}
                    className="rounded-lg bg-red-600 p-1.5 text-white hover:bg-red-700"
                    title={t("moderation.reject")}
                    aria-label={t("moderation.reject")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!showTemplatesFirst && templates.length > 0 && templateSection}

      {/* Per-member display preference */}
      <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <h2 className="font-semibold text-foreground">{t("appearance.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("appearance.description")}</p>
        <div className="space-y-2">
          {[
            { value: "name", label: t("appearance.realName") },
            { value: "alias", label: t("appearance.alias") },
            { value: "anonymous", label: t("appearance.anonymous") },
          ].map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="public_display"
                checked={pref.public_display === opt.value}
                onChange={() => savePref({ ...pref, public_display: opt.value })}
              />
              <span className="text-foreground">{opt.label}</span>
            </label>
          ))}
          {pref.public_display === "alias" && (
            <input
              type="text"
              defaultValue={pref.public_alias || ""}
              onBlur={(e) => savePref({ ...pref, public_alias: e.target.value })}
              className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
              placeholder={t("appearance.aliasPlaceholder")}
              aria-label={t("appearance.aliasPlaceholder")}
            />
          )}
        </div>
      </section>
    </SettingsPage>
  );
}
