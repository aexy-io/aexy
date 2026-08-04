"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Activity, Shield, FolderGit2, Workflow, AlertTriangle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePermissions, PERMISSIONS } from "@/hooks/usePermissions";
import { useProjectTrackerConfig, useUpdateProjectTrackerConfig, useTargetHours, useUpsertTargetHours, useDeleteTargetHours, DEFAULT_CAPTURE_CONFIG, TrackerCaptureConfig } from "@/hooks/useTrackerAdmin";
import { SettingsPage, SettingsSection, SettingsSkeleton, SettingsEmptyState } from "@/components/settings/SettingsPrimitives";

export default function ProjectTrackerSettingsPage() {
  const t = useTranslations("settings.tracker");
  const params = useParams();
  const projectId = params.projectId as string;
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const { hasPermission, isLoading: permsLoading } = usePermissions(workspaceId, projectId);
  const canEdit = hasPermission(PERMISSIONS.CAN_EDIT_PROJECTS);

  const { data, isLoading } = useProjectTrackerConfig(projectId);
  const update = useUpdateProjectTrackerConfig(projectId);

  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState<TrackerCaptureConfig>(DEFAULT_CAPTURE_CONFIG);
  const [excludedText, setExcludedText] = useState("");

  // Per-project target hours (overrides the workspace default for this project).
  const { data: targets } = useTargetHours(workspaceId);
  const upsertTarget = useUpsertTargetHours(workspaceId);
  const deleteTarget = useDeleteTargetHours(workspaceId);
  const projectTarget = targets?.find(
    (t) => t.project_id === projectId && t.developer_id === null,
  );
  const [targetHours, setTargetHours] = useState("");
  useEffect(() => {
    setTargetHours(projectTarget ? String(projectTarget.target_hours_per_day) : "");
  }, [projectTarget]);

  const saveTarget = () => {
    const n = Number(targetHours);
    if (!Number.isFinite(n) || n <= 0 || n > 24) {
      toast.error(t("saveError"));
      return;
    }
    upsertTarget.mutate(
      { project_id: projectId, target_hours_per_day: n },
      { onSuccess: () => toast.success(t("targetSaved")), onError: () => toast.error(t("saveError")) },
    );
  };

  const clearTarget = () => {
    if (!projectTarget) return;
    deleteTarget.mutate(projectTarget.id, {
      onSuccess: () => toast.success(t("targetSaved")),
      onError: () => toast.error(t("saveError")),
    });
  };

  useEffect(() => {
    if (data) {
      setEnabled(data.enabled);
      setConfig(data.config);
      setExcludedText((data.config.excluded_bundle_ids || []).join(", "));
    }
  }, [data]);

  const setCfg = <K extends keyof TrackerCaptureConfig>(key: K, value: TrackerCaptureConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));

  const save = () => {
    if (!enabled && data?.enabled && !window.confirm(t("disableConfirm"))) return;
    const excluded_bundle_ids = excludedText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    update.mutate(
      { enabled, config: { ...config, excluded_bundle_ids } },
      {
        onSuccess: () => toast.success(t("saved")),
        onError: () => toast.error(t("saveError")),
      },
    );
  };

  const tab = (href: string, label: string, icon?: React.ReactNode, active = false) => (
    <Link
      href={href}
      className={
        active
          ? "px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"
          : "px-4 py-2 bg-muted hover:bg-accent text-foreground rounded-lg text-sm font-medium transition flex items-center gap-2"
      }
    >
      {icon}
      {label}
    </Link>
  );

  return (
    <SettingsPage
      title={t("title")}
      description={t("projectSubtitle")}
      width="wide"
      breadcrumbs={[
        { label: "Settings", href: "/settings" },
        { label: "Projects", href: "/settings/projects" },
        { label: t("title") },
      ]}
    >
      <div className="flex flex-wrap gap-2">
        {tab(`/settings/projects/${projectId}`, "General")}
        {tab(`/settings/projects/${projectId}/permissions`, "Permissions", <Shield className="h-4 w-4" />)}
        {tab(`/settings/projects/${projectId}/repositories`, "Repositories", <FolderGit2 className="h-4 w-4" />)}
        {tab(`/settings/projects/${projectId}/statuses`, "Statuses", <Workflow className="h-4 w-4" />)}
        {tab(`/settings/projects/${projectId}/tracker`, t("title"), <Activity className="h-4 w-4" />, true)}
      </div>

      {permsLoading || isLoading ? (
        <SettingsSkeleton rows={2} />
      ) : !canEdit ? (
        <SettingsSection flush>
          <SettingsEmptyState title={t("accessDenied")} />
        </SettingsSection>
      ) : (
        <div className="space-y-5">
          {/* Privacy notice */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
            <div className="font-medium">{t("privacyTitle")}</div>
            <p className="mt-1">{t("privacyBody")}</p>
          </div>

          {/* Enable toggle */}
          <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-card p-4 dark:border-gray-800">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span>
              <span className="font-medium">{t("enableLabel")}</span>
              <span className="block text-sm text-gray-500">{t("enableHint")}</span>
            </span>
          </label>

          {/* Capture config */}
          <fieldset
            disabled={!enabled}
            className="space-y-4 rounded-xl border border-gray-200 bg-card p-4 disabled:opacity-50 dark:border-gray-800"
          >
            <legend className="px-1 text-sm font-medium">{t("captureTitle")}</legend>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">{t("sampleInterval")}</span>
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={config.sample_interval_s}
                  onChange={(e) => setCfg("sample_interval_s", Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">{t("idleThreshold")}</span>
                <input
                  type="number"
                  min={30}
                  max={3600}
                  value={config.idle_threshold_s}
                  onChange={(e) => setCfg("idle_threshold_s", Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">{t("screenshotPolicy")}</span>
                <select
                  value={config.screenshot_policy}
                  onChange={(e) =>
                    setCfg("screenshot_policy", e.target.value as TrackerCaptureConfig["screenshot_policy"])
                  }
                  className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700"
                >
                  <option value="off">{t("screenshotOff")}</option>
                  <option value="active_window">{t("screenshotActive")}</option>
                  <option value="full_screen">{t("screenshotFull")}</option>
                </select>
              </label>

              {config.screenshot_policy !== "off" && (
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">{t("screenshotEvery")}</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={config.screenshot_every_n_samples}
                    onChange={(e) => setCfg("screenshot_every_n_samples", Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700"
                  />
                </label>
              )}
            </div>

            {config.screenshot_policy !== "off" && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {t("screenshotWarning")}
              </div>
            )}

            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">{t("excludedApps")}</span>
              <input
                type="text"
                value={excludedText}
                onChange={(e) => setExcludedText(e.target.value)}
                placeholder="com.apple.Safari, com.tinyspeck.slackmacgap"
                className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700"
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.paused}
                onChange={(e) => setCfg("paused", e.target.checked)}
                className="h-4 w-4"
              />
              {t("paused")}
            </label>

            <p className="text-xs text-muted-foreground">{t("applyNote")}</p>
          </fieldset>

          {/* Per-project target hours */}
          <div className="space-y-3 rounded-xl border border-gray-200 bg-card p-4 dark:border-gray-800">
            <div>
              <h2 className="text-sm font-medium">{t("projectTargetTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("projectTargetHint")}</p>
            </div>
            <div className="flex items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">{t("hoursPerDay")}</span>
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  value={targetHours}
                  onChange={(e) => setTargetHours(e.target.value)}
                  placeholder="8"
                  className="w-28 rounded-lg border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700"
                />
              </label>
              <button
                onClick={saveTarget}
                disabled={upsertTarget.isPending}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {upsertTarget.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("save")}
              </button>
              {projectTarget && (
                <button
                  onClick={clearTarget}
                  disabled={deleteTarget.isPending}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-accent disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
                >
                  {t("clear")}
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={update.isPending}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("save")}
            </button>
          </div>
        </div>
      )}
    </SettingsPage>
  );
}
