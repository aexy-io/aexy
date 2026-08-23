"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, ChevronRight, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import { useWorkspaceTrackerProjects, useAdminTimesheet, useTargetHours, useUpsertTargetHours, useDeleteTargetHours } from "@/hooks/useTrackerAdmin";
import { SettingsPage, SettingsSection, SettingsSkeleton, SettingsEmptyState } from "@/components/settings/SettingsPrimitives";

function fmtDuration(minutes: number) {
  if (!minutes) return "0m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const localISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function WorkspaceTrackerAdminPage() {
  const t = useTranslations("settings.tracker");
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const [tab, setTab] = useState<"projects" | "records" | "targets">("projects");
  const projectsQuery = useWorkspaceTrackerProjects(workspaceId);

  const { members } = useWorkspaceMembers(workspaceId);
  const [developerId, setDeveloperId] = useState<string>("");

  const memberList =
    (members as Array<{ developer_id: string; name?: string; email?: string }> | undefined) ?? [];
  const memberLabel = (id: string) => {
    const m = memberList.find((x) => x.developer_id === id);
    return m?.name || m?.email || id;
  };
  const projectName = (id: string) =>
    projectsQuery.data?.find((p) => p.id === id)?.name || id;

  const range = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    return { start: localISO(start), end: localISO(end) };
  }, []);
  const timesheet = useAdminTimesheet(workspaceId, developerId || null, range);

  const tabBtn = (id: "projects" | "records" | "targets", label: string) => (
    <button
      onClick={() => setTab(id)}
     className={
        tab === id
          ? "px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium"
          : "px-4 py-2 bg-muted hover:bg-accent text-foreground rounded-lg text-sm font-medium transition"
      }
    >
      {label}
    </button>
  );

  return (
    <SettingsPage
      title={t("title")}
      description={t("adminSubtitle")}
      width="wide"
    >
      <div className="flex gap-2">
        {tabBtn("projects", t("tabProjects"))}
        {tabBtn("records", t("tabRecords"))}
        {tabBtn("targets", t("tabTargets"))}
      </div>

      {tab === "targets" ? (
        <TargetsTab
          workspaceId={workspaceId}
          members={memberList}
          memberLabel={memberLabel}
          projectName={projectName}
        />
      ) : tab === "projects" ? (
        projectsQuery.isLoading ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : projectsQuery.isError ? (
          <div className="rounded-xl border border-dashed border-border py-16 text-center text-gray-500">
            {t("adminAccessDenied")}
          </div>
        ) : !projectsQuery.data?.length ? (
          <div className="rounded-xl border border-dashed border-border py-16 text-center text-gray-500">
            {t("noProjects")}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-border dark:divide-gray-800">
            {projectsQuery.data.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="text-xs text-gray-500">
                    {t("devicesCount", { count: p.device_count })} · {t("activeCount", { count: p.active_devices })}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                   className={
                      p.enabled
                        ? "rounded px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "rounded px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-muted-foreground"
                    }
                  >
                    {p.enabled ? t("enabled") : t("disabled")}
                  </span>
                  <Link
                    href={`/settings/projects/${p.id}/tracker`}
                   className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                  >
                    {t("configure")}
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="space-y-4">
          <div>
            <h2 className="font-medium">{t("recordsTitle")}</h2>
            <p className="text-sm text-gray-500">{t("recordsSubtitle")}</p>
          </div>
          <select
            value={developerId}
            onChange={(e) => setDeveloperId(e.target.value)}
           className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
          >
            <option value="">{t("selectDeveloper")}</option>
            {(members as Array<{ developer_id: string; name?: string; email?: string }> | undefined)?.map((m) => (
              <option key={m.developer_id} value={m.developer_id}>
                {m.name || m.email || m.developer_id}
              </option>
            ))}
          </select>

          {developerId &&
            (timesheet.isLoading ? (
              <div className="flex justify-center py-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : timesheet.isError ? (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20">
                {t("noRecordsPermission")}
              </div>
            ) : !timesheet.data?.days?.length ? (
              <div className="rounded-xl border border-dashed border-border py-12 text-center text-gray-500">
                {t("noActivity")}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-gray-500">
                  {t("totalTracked")}: {fmtDuration(timesheet.data.total_minutes)}
                </div>
                {timesheet.data.days.map((day) => (
                  <div
                    key={day.date}
                   className="rounded-xl border border-border bg-card p-4"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-medium">{day.date}</span>
                      <span className="text-sm text-gray-500">{fmtDuration(day.total_minutes)}</span>
                    </div>
                    {day.journal && (
                      <p className="mb-2 border-l-2 border-blue-400 pl-3 text-sm italic text-gray-600 dark:text-gray-300">
                        {day.journal}
                      </p>
                    )}
                    <ul className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
                      {day.entries.map((e) => (
                        <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                          <span className="truncate">{e.task_title || e.description || "—"}</span>
                          <span className="shrink-0 tabular-nums text-gray-500">
                            {fmtDuration(e.duration_minutes)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}
    </SettingsPage>
  );
}

function TargetsTab({
  workspaceId,
  members,
  memberLabel,
  projectName,
}: {
  workspaceId: string | null;
  members: Array<{ developer_id: string; name?: string; email?: string }>;
  memberLabel: (id: string) => string;
  projectName: (id: string) => string;
}) {
  const t = useTranslations("settings.tracker");
  const { data: targets, isLoading, isError } = useTargetHours(workspaceId);
  const upsert = useUpsertTargetHours(workspaceId);
  const del = useDeleteTargetHours(workspaceId);

  const wsDefault = targets?.find((x) => !x.project_id && !x.developer_id);
  const projectRows = (targets ?? []).filter((x) => x.project_id && !x.developer_id);
  const devRows = (targets ?? []).filter((x) => x.developer_id);

  const [defaultHours, setDefaultHours] = useState("");
  const [newDevId, setNewDevId] = useState("");
  const [newDevHours, setNewDevHours] = useState("8");

  // Sync the workspace-default input once data arrives (and after it changes).
  const wsDefaultValue = wsDefault ? String(wsDefault.target_hours_per_day) : "";
  useEffect(() => setDefaultHours(wsDefaultValue), [wsDefaultValue]);

  const valid = (s: string) => {
    const n = Number(s);
    return Number.isFinite(n) && n > 0 && n <= 24 ? n : null;
  };

  const saveDefault = () => {
    const n = valid(defaultHours);
    if (n === null) return toast.error(t("saveError"));
    upsert.mutate(
      { target_hours_per_day: n },
      { onSuccess: () => toast.success(t("targetSaved")), onError: () => toast.error(t("saveError")) },
    );
  };

  const addDevOverride = () => {
    const n = valid(newDevHours);
    if (!newDevId || n === null) return toast.error(t("saveError"));
    upsert.mutate(
      { developer_id: newDevId, target_hours_per_day: n },
      {
        onSuccess: () => {
          toast.success(t("targetSaved"));
          setNewDevId("");
          setNewDevHours("8");
        },
        onError: () => toast.error(t("saveError")),
      },
    );
  };

  const removeRow = (id: string) =>
    del.mutate(id, {
      onSuccess: () => toast.success(t("targetSaved")),
      onError: () => toast.error(t("saveError")),
    });

  if (isLoading) return <SettingsSkeleton rows={1} />;
  if (isError)
    return (
      <SettingsSection flush>
        <SettingsEmptyState title={t("adminAccessDenied")} />
      </SettingsSection>
    );

  const inputCls = "w-28 rounded-lg border border-border bg-transparent px-3 py-2 text-sm ";
  const availableMembers = members.filter(
    (m) => !devRows.some((r) => r.developer_id === m.developer_id),
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-medium">{t("targetsTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("targetsSubtitle")}</p>
      </div>

      {/* Workspace default */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div>
          <h3 className="text-sm font-medium">{t("workspaceDefault")}</h3>
          <p className="text-xs text-muted-foreground">{t("workspaceDefaultHint")}</p>
        </div>
        <div className="flex items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">{t("hoursPerDay")}</span>
            <input
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={defaultHours}
              onChange={(e) => setDefaultHours(e.target.value)}
              placeholder="8"
             className={inputCls}
            />
          </label>
          <button
            onClick={saveDefault}
            disabled={upsert.isPending}
           className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("save")}
          </button>
        </div>
      </div>

      {/* Per-developer overrides */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-medium">{t("developerOverrides")}</h3>
        {devRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noOverrides")}</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {devRows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="truncate">{memberLabel(r.developer_id!)}</span>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums text-gray-500">{r.target_hours_per_day}h</span>
                  <button
                    onClick={() => removeRow(r.id)}
                   className="text-muted-foreground hover:text-red-500"
                    title={t("remove")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-3 border-t border-gray-100 pt-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">{t("selectDeveloper")}</span>
            <select
              value={newDevId}
              onChange={(e) => setNewDevId(e.target.value)}
             className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
            >
              <option value="">{t("selectDeveloper")}</option>
              {availableMembers.map((m) => (
                <option key={m.developer_id} value={m.developer_id}>
                  {m.name || m.email || m.developer_id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">{t("hoursPerDay")}</span>
            <input
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={newDevHours}
              onChange={(e) => setNewDevHours(e.target.value)}
             className={inputCls}
            />
          </label>
          <button
            onClick={addDevOverride}
            disabled={upsert.isPending || !newDevId}
           className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {t("addOverride")}
          </button>
        </div>
      </div>

      {/* Per-project overrides (read-only; set on each project's Tracker page) */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-medium">{t("projectOverrides")}</h3>
        {projectRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noProjectOverrides")}</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {projectRows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Link
                  href={`/settings/projects/${r.project_id}/tracker`}
                 className="truncate text-blue-600 hover:underline"
                >
                  {projectName(r.project_id!)}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums text-gray-500">{r.target_hours_per_day}h</span>
                  <button
                    onClick={() => removeRow(r.id)}
                   className="text-muted-foreground hover:text-red-500"
                    title={t("remove")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
