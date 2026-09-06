"use client";

import { useMemo, useState } from "react";
import { Clock, Loader2, Pause, Play, Plus, Trash2, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useWorkspace, useIsWorkspaceAdmin } from "@/hooks/useWorkspace";
import { AgentSchedule, CRMAgent, agentSchedulesApi, agentsApi } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/utils";
import {
  SettingsAccessDenied,
  SettingsEmptyState,
  SettingsPage,
  SettingsSection,
  SettingsSkeleton,
} from "@/components/settings/SettingsPrimitives";

const INTERVALS: { minutes: number; key: string }[] = [
  { minutes: 15, key: "m15" },
  { minutes: 30, key: "m30" },
  { minutes: 60, key: "h1" },
  { minutes: 240, key: "h4" },
  { minutes: 720, key: "h12" },
  { minutes: 1440, key: "d1" },
  { minutes: 10080, key: "w1" },
];

/**
 * Routines an agent runs on a clock.
 *
 * The daily standup summary, the morning triage pass, the TAT sweep: the same
 * instruction to the same agent, every day, with nobody typing it. Only agents
 * that have a principal can be scheduled — a schedule has nobody at the
 * keyboard, so the agent's tools need an identity of their own to act as.
 */
export default function AgentSchedulesPage() {
  const t = useTranslations("agentSchedules");
  const tc = useTranslations("common");
  const { currentWorkspaceId } = useWorkspace();
  const { isWorkspaceAdmin, isLoading: adminLoading } = useIsWorkspaceAdmin(currentWorkspaceId);
  const queryClient = useQueryClient();

  const { data: schedules = [], isLoading } = useQuery<AgentSchedule[]>({
    queryKey: ["agent-schedules", currentWorkspaceId],
    queryFn: () => agentSchedulesApi.list(currentWorkspaceId!),
    enabled: Boolean(currentWorkspaceId),
  });
  const { data: agents = [] } = useQuery<CRMAgent[]>({
    queryKey: ["agents-for-schedules", currentWorkspaceId],
    queryFn: () => agentsApi.list(currentWorkspaceId!, { include_system: false }),
    enabled: Boolean(currentWorkspaceId) && isWorkspaceAdmin,
  });
  const schedulable = useMemo(() => agents.filter((a) => Boolean(a.principal_id)), [agents]);
  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? id.slice(0, 8);
  const intervalLabel = (minutes: number) => {
    const match = INTERVALS.find((i) => i.minutes === minutes);
    return match ? t(`interval.${match.key}`) : `${minutes} min`;
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["agent-schedules", currentWorkspaceId] });

  const [showCreate, setShowCreate] = useState(false);
  const [agentId, setAgentId] = useState("");
  const [name, setName] = useState("");
  const [routine, setRoutine] = useState("");
  const [interval, setInterval] = useState(1440);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      agentSchedulesApi.create(currentWorkspaceId!, {
        agent_id: agentId,
        name: name.trim(),
        routine: routine.trim(),
        interval_minutes: interval,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      }),
    onSuccess: () => {
      toast.success(tc("saved"));
      setShowCreate(false);
      setName("");
      setRoutine("");
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, tc("error"))),
  });

  const toggle = useMutation({
    mutationFn: (row: AgentSchedule) =>
      agentSchedulesApi.update(currentWorkspaceId!, row.id, { enabled: !row.enabled }),
    onSuccess: invalidate,
    onError: (error) => toast.error(getApiErrorMessage(error, tc("error"))),
    onSettled: () => setBusyId(null),
  });

  const runNow = useMutation({
    mutationFn: (row: AgentSchedule) => agentSchedulesApi.runNow(currentWorkspaceId!, row.id),
    onSuccess: () => {
      toast.success(t("actions.started"));
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, tc("error"))),
    onSettled: () => setBusyId(null),
  });

  const remove = useMutation({
    mutationFn: (row: AgentSchedule) => agentSchedulesApi.remove(currentWorkspaceId!, row.id),
    onSuccess: () => {
      toast.success(tc("deleted"));
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, tc("error"))),
    onSettled: () => {
      setBusyId(null);
      setConfirmRemove(null);
    },
  });

  if (!adminLoading && !isWorkspaceAdmin) {
    return (
      <SettingsPage title={t("title")} description={t("subtitle")} width="wide">
        <SettingsAccessDenied detail={t("adminOnly")} />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage
      title={t("title")}
      description={t("subtitle")}
      width="wide"
      actions={
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("createButton")}
        </button>
      }
    >
      {showCreate && (
        <SettingsSection title={t("form.heading")}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t("form.agentLabel")}</label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              >
                <option value="">—</option>
                {schedulable.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                {schedulable.length === 0 ? t("form.agentNone") : t("form.agentHint")}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t("form.nameLabel")}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("form.namePlaceholder")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
              <label className="mb-1 mt-3 block text-xs text-muted-foreground">{t("form.intervalLabel")}</label>
              <select
                value={interval}
                onChange={(e) => setInterval(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              >
                {INTERVALS.map((i) => (
                  <option key={i.minutes} value={i.minutes}>
                    {t(`interval.${i.key}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-xs text-muted-foreground">{t("form.routineLabel")}</label>
            <textarea
              value={routine}
              onChange={(e) => setRoutine(e.target.value)}
              placeholder={t("form.routinePlaceholder")}
              rows={4}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => create.mutate()}
              disabled={!agentId || !name.trim() || !routine.trim() || create.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {t("form.submit")}
            </button>
            <button onClick={() => setShowCreate(false)} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
              {tc("cancel")}
            </button>
          </div>
        </SettingsSection>
      )}

      {isLoading || adminLoading ? (
        <SettingsSkeleton rows={1} />
      ) : schedules.length === 0 ? (
        <SettingsSection flush>
          <SettingsEmptyState icon={<Clock className="h-8 w-8" />} title={t("empty.title")} description={t("empty.description")} />
        </SettingsSection>
      ) : (
        <SettingsSection flush footer={t("footer")}>
          <div className="overflow-x-auto">
            <div className="min-w-[820px]">
              <div className="grid grid-cols-[1.4fr_1fr_100px_130px_130px_60px_70px_150px] gap-4 border-b border-border px-5 py-2 text-xs font-medium text-muted-foreground">
                <div>{t("table.name")}</div>
                <div>{t("table.agent")}</div>
                <div>{t("table.every")}</div>
                <div>{t("table.nextRun")}</div>
                <div>{t("table.lastRun")}</div>
                <div>{t("table.runs")}</div>
                <div>{t("table.status")}</div>
                <div></div>
              </div>
              {schedules.map((row) => {
                const busy = busyId === row.id;
                return (
                  <div
                    key={row.id}
                    data-testid={`schedule-${row.id}`}
                    className="grid grid-cols-[1.4fr_1fr_100px_130px_130px_60px_70px_150px] items-center gap-4 border-b border-border px-5 py-3 text-sm last:border-b-0 hover:bg-accent/30"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{row.name}</div>
                      <div className="truncate text-xs text-muted-foreground" title={row.routine}>
                        {row.routine}
                      </div>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{agentName(row.agent_id)}</div>
                    <div className="text-xs text-muted-foreground">{intervalLabel(row.interval_minutes)}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.enabled && row.next_run_at
                        ? formatDistanceToNow(new Date(row.next_run_at), { addSuffix: true })
                        : t("table.paused")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.last_run_at ? formatDistanceToNow(new Date(row.last_run_at), { addSuffix: true }) : t("table.never")}
                    </div>
                    <div className="text-xs text-muted-foreground">{row.run_count}</div>
                    <div>
                      {row.enabled ? (
                        <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-400">{t("status.enabled")}</span>
                      ) : (
                        <span className="rounded-full bg-zinc-400/10 px-2 py-0.5 text-xs text-zinc-400">{t("status.disabled")}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      {confirmRemove === row.id ? (
                        <>
                          <button
                            onClick={() => {
                              setBusyId(row.id);
                              remove.mutate(row);
                            }}
                            disabled={busy}
                            className="rounded px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-400/10"
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("actions.remove")}
                          </button>
                          <button onClick={() => setConfirmRemove(null)} className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                            {tc("cancel")}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            title={t("actions.runNowTitle")}
                            disabled={busy}
                            onClick={() => {
                              setBusyId(row.id);
                              runNow.mutate(row);
                            }}
                            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                          >
                            {busy && runNow.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                          </button>
                          <button
                            title={row.enabled ? t("actions.pause") : t("actions.resume")}
                            disabled={busy}
                            onClick={() => {
                              setBusyId(row.id);
                              toggle.mutate(row);
                            }}
                            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                          >
                            {row.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                          </button>
                          <button
                            title={t("actions.removeTitle")}
                            onClick={() => setConfirmRemove(row.id)}
                            className="rounded p-1.5 text-muted-foreground hover:bg-red-400/10 hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </SettingsSection>
      )}
    </SettingsPage>
  );
}
