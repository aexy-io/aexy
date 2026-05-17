"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAuth } from "@/hooks/useAuth";
import {
  useUpdateWorkspaceAISettings,
  useWorkspaceAISettings,
} from "@/hooks/useCodeInsights";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import type { AIModelTier, AISettingsMode } from "@/lib/code-insights-api";

/**
 * Workspace-level AI analysis toggle. Drop into the settings/insights page.
 * Admin-only writes; viewers see the read-only state.
 */
export function AISettingsSection() {
  const t = useTranslations("aiInsights.settings");
  const { user } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const { members } = useWorkspaceMembers(currentWorkspaceId);

  const currentMember = members?.find((m) => m.developer_id === user?.id);
  const isAdmin =
    currentMember?.role === "owner" || currentMember?.role === "admin";

  const { data: settings, isLoading } = useWorkspaceAISettings(currentWorkspaceId);
  const update = useUpdateWorkspaceAISettings(currentWorkspaceId);

  const [mode, setMode] = useState<AISettingsMode>("on");
  const [modelTier, setModelTier] = useState<AIModelTier>("haiku");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      setMode(settings.mode);
      setModelTier(settings.model_tier);
      setDirty(false);
    }
  }, [settings]);

  const disabled = !isAdmin || update.isPending || !currentWorkspaceId;

  const handleSave = () => {
    if (!currentWorkspaceId) return;
    update.mutate({ mode, model_tier: modelTier });
  };

  return (
    <section className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">{t("title")}</h2>
      </div>
      <div className="p-6 space-y-6">
        <p className="text-sm text-muted-foreground">{t("description")}</p>

        {!isAdmin && (
          <div className="text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2">
            {t("adminOnly")}
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="ai-mode">
            {t("modeLabel")}
          </label>
          <div className="flex gap-2">
            {(["on", "off"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={disabled}
                onClick={() => {
                  setMode(opt);
                  setDirty(true);
                }}
                className={[
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  mode === opt
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-foreground hover:bg-muted",
                  disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                ].join(" ")}
              >
                {t(opt === "on" ? "modeOn" : "modeOff")}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t(mode === "on" ? "modeOnHint" : "modeOffHint")}
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="ai-tier">
            {t("modelTierLabel")}
          </label>
          <select
            id="ai-tier"
            disabled={disabled || mode === "off"}
            value={modelTier}
            onChange={(e) => {
              setModelTier(e.target.value as AIModelTier);
              setDirty(true);
            }}
            className="w-full max-w-xs rounded-md border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-50"
          >
            <option value="haiku">{t("modelTierHaiku")}</option>
            <option value="sonnet">{t("modelTierSonnet")}</option>
          </select>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={disabled || !dirty || isLoading}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {update.isPending ? t("saving") : t("save")}
          </button>
        </div>
      </div>
    </section>
  );
}
