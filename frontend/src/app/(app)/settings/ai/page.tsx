"use client";

/**
 * Workspace AI settings.
 *
 * Two controls, deliberately on one page because they answer the same question
 * — "what happens to our data?":
 *
 *  1. One switch that stops the whole workspace from reaching any LLM. Every
 *     module used to carry its own AI toggle, so "no AI on our data" meant
 *     hunting through screens and hoping nobody shipped a new one.
 *  2. The workspace's own provider and key, so prompts travel on their contract
 *     rather than the platform's.
 *
 * Like Workflow Secrets, there is no reveal button, because there is no
 * endpoint behind one. The page shows the last four characters and when the key
 * was installed; rotating means overwriting.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Ban, CheckCircle2, Loader2, Plug, Server, ShieldAlert, Sparkles } from "lucide-react";

import { AIProvider } from "@/lib/ai-settings-api";
import {
  SettingsPage,
  SettingsSection,
  SettingsSkeleton,
} from "@/components/settings/SettingsPrimitives";
import {
  useAISettings,
  useTestAIConnection,
  useUpdateAISettings,
} from "@/hooks/useAISettings";

/** Providers reached by URL rather than by key (self-hosted). */
const SELF_HOSTED: AIProvider[] = ["ollama", "lmstudio"];

export default function AISettingsPage() {
  const t = useTranslations("aiSettings");
  const tc = useTranslations("common");

  const { data: settings, isLoading, error } = useAISettings();
  const update = useUpdateAISettings();
  const test = useTestAIConnection();

  const [reason, setReason] = useState("");
  const [provider, setProvider] = useState<AIProvider | "">("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [allowFallback, setAllowFallback] = useState(false);

  // Seed the form from the server once it has answered. Keyed on updated_at so
  // a save (or another admin's change arriving on refetch) re-syncs the inputs
  // instead of leaving stale text in them.
  useEffect(() => {
    if (!settings) return;
    setReason(settings.disabled_reason ?? "");
    setProvider(settings.provider ?? "");
    setModel(settings.model ?? "");
    setBaseUrl(settings.base_url ?? "");
    setAllowFallback(settings.allow_platform_fallback);
    setApiKey("");
  }, [settings?.updated_at, settings?.workspace_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <SettingsSkeleton rows={2} />;

  if (error || !settings) {
    return (
      <SettingsPage title={t("title")} description={t("subtitle")}>
        <SettingsSection>
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
            <p className="text-sm text-muted-foreground">{t("loadFailed")}</p>
          </div>
        </SettingsSection>
      </SettingsPage>
    );
  }

  const readOnly = !settings.can_manage || !settings.plan_allows;
  const needsKey = provider !== "" && !SELF_HOSTED.includes(provider);
  const keyMissing = needsKey && !settings.has_api_key && !apiKey.trim();

  const saveAccess = (enabled: boolean) =>
    update.mutate({ ai_enabled: enabled, disabled_reason: enabled ? null : reason || null });

  const saveProvider = () =>
    update.mutate({
      provider: (provider || undefined) as AIProvider | undefined,
      model: model.trim() || null,
      base_url: baseUrl.trim() || null,
      // Omit entirely when untouched, so saving a model change does not wipe
      // the installed key.
      ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      allow_platform_fallback: allowFallback,
    });

  const usePlatformDefault = () => update.mutate({ clear_provider: true });

  return (
    <SettingsPage title={t("title")} description={t("subtitle")}>

      {/* Why the controls may be unavailable — say which reason it is, because
          "upgrade" and "ask an admin" are very different next steps. */}
      {!settings.plan_allows && (
        <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("planGate.title")}</p>
            <p className="text-xs text-muted-foreground">
              {t("planGate.body", { tier: settings.plan_tier ?? "free" })}
            </p>
          </div>
        </div>
      )}
      {settings.plan_allows && !settings.can_manage && (
        <div className="flex gap-3 rounded-lg border border-border bg-accent/30 p-4">
          <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">{t("adminsOnly")}</p>
        </div>
      )}

      {/* What is actually in force right now */}
      <div className="rounded-lg border border-border p-4 flex items-center gap-3">
        {settings.effective_source === "disabled" ? (
          <Ban className="h-4 w-4 text-red-400 shrink-0" />
        ) : settings.effective_source === "workspace" ? (
          <Server className="h-4 w-4 text-emerald-400 shrink-0" />
        ) : (
          <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <div className="text-sm">
          <span className="font-medium">{t("inForce.label")}</span>{" "}
          <span className="text-muted-foreground">
            {t(`inForce.${settings.effective_source}`)}
          </span>
        </div>
      </div>

      {/* 1. Access */}
      <SettingsSection title={t("access.title")} description={t("access.help")}>
        <div className="space-y-4">

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={!settings.ai_enabled}
            disabled={readOnly || update.isPending}
            onChange={(e) => saveAccess(!e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border"
          />
          <span className="text-sm">
            {t("access.disableLabel")}
            <span className="block text-xs text-muted-foreground">
              {t("access.disableHelp")}
            </span>
          </span>
        </label>

        {!settings.ai_enabled && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              {t("access.reasonLabel")}
            </label>
            <textarea
              value={reason}
              disabled={readOnly}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => {
                if (!readOnly && reason !== (settings.disabled_reason ?? "")) {
                  update.mutate({ disabled_reason: reason || null });
                }
              }}
              rows={2}
              placeholder={t("access.reasonPlaceholder")}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-60"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t("access.reasonHelp")}
            </p>
          </div>
        )}
        </div>
      </SettingsSection>

      {/* 2. Provider */}
      <SettingsSection title={t("provider.title")} description={t("provider.help")}>
        <div className="space-y-4">

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              {t("provider.providerLabel")}
            </label>
            <select
              value={provider}
              disabled={readOnly}
              onChange={(e) => setProvider(e.target.value as AIProvider | "")}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-60"
            >
              <option value="">{t("provider.platformDefault")}</option>
              {settings.supported_providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              {t("provider.modelLabel")}
            </label>
            <input
              type="text"
              value={model}
              disabled={readOnly || provider === ""}
              onChange={(e) => setModel(e.target.value)}
              placeholder={t("provider.modelPlaceholder")}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-60"
            />
          </div>
        </div>

        {provider !== "" && SELF_HOSTED.includes(provider) && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              {t("provider.baseUrlLabel")}
            </label>
            <input
              type="url"
              value={baseUrl}
              disabled={readOnly}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://ollama.internal:11434"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-60"
            />
          </div>
        )}

        {needsKey && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              {t("provider.apiKeyLabel")}
            </label>
            <input
              type="password"
              value={apiKey}
              disabled={readOnly}
              autoComplete="off"
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                settings.has_api_key
                  ? t("provider.apiKeyInstalled", { hint: settings.key_hint ?? "" })
                  : t("provider.apiKeyPlaceholder")
              }
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-60"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {settings.has_api_key
                ? t("provider.apiKeyRotateHelp")
                : t("provider.apiKeyHelp")}
            </p>
          </div>
        )}

        {provider !== "" && (
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={allowFallback}
              disabled={readOnly}
              onChange={(e) => setAllowFallback(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border"
            />
            <span className="text-sm">
              {t("provider.fallbackLabel")}
              <span className="block text-xs text-muted-foreground">
                {t("provider.fallbackHelp")}
              </span>
            </span>
          </label>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={saveProvider}
            disabled={readOnly || update.isPending || keyMissing}
            className="inline-flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {tc("save")}
          </button>

          <button
            onClick={() => test.mutate()}
            disabled={readOnly || test.isPending || settings.provider === null}
            className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm hover:bg-accent transition-colors disabled:opacity-50"
          >
            {test.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plug className="h-4 w-4" />
            )}
            {t("provider.test")}
          </button>

          {settings.provider !== null && (
            <button
              onClick={usePlatformDefault}
              disabled={readOnly || update.isPending}
              className="text-sm text-muted-foreground hover:text-foreground underline disabled:opacity-50"
            >
              {t("provider.usePlatform")}
            </button>
          )}

          {keyMissing && (
            <span className="text-xs text-amber-400">{t("provider.keyRequired")}</span>
          )}
        </div>

        {test.data?.ok && (
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {t("provider.testOk")}
          </div>
        )}
        </div>
      </SettingsSection>

      {/* What this page deliberately cannot do */}
      <div className="flex gap-3 rounded-lg border border-border bg-accent/30 p-4">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("keyNeverRead")}
        </p>
      </div>
    </SettingsPage>
  );
}
