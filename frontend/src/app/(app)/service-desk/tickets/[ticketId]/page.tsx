"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Clock, GitBranch } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  useServiceDeskTicket,
  useServiceDeskMutations,
  useServiceDeskSettings,
  useServiceDeskTaxonomy,
} from "@/hooks/useServiceDesk";
import { useProjects } from "@/hooks/useProjects";
import { useWorkspace } from "@/hooks/useWorkspace";
import { PendingWith } from "@/lib/service-desk-api";
import {
  SERVICE_DESK_BREACH_COLORS,
  serviceDeskStakeholderColor,
} from "@/lib/statusColors";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

function fmtDays(seconds: number): string {
  const d = seconds / 86400;
  if (d >= 1) return `${d.toFixed(1)}d`;
  const h = seconds / 3600;
  if (h >= 1) return `${h.toFixed(1)}h`;
  return `${Math.max(0, Math.round(seconds / 60))}m`;
}

export default function ServiceDeskTicketDetailPage() {
  const t = useTranslations("serviceDesk");
  const router = useRouter();
  const params = useParams();
  const ticketId = params.ticketId as string;

  const { data: ticket, isLoading } = useServiceDeskTicket(ticketId);
  const { changePendingWith, convertToTask } = useServiceDeskMutations();
  const { currentWorkspace } = useWorkspace();
  const { projects } = useProjects(currentWorkspace?.id ?? null);
  const { data: settings } = useServiceDeskSettings();
  const { stakeholders, stakeholderLabel, requestTypeLabel } = useServiceDeskTaxonomy();
  const terms = settings?.terminology ?? {};

  const [target, setTarget] = useState<PendingWith | "">("");
  const [note, setNote] = useState("");
  const [projectId, setProjectId] = useState("");

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!ticket) return <div className="p-6 text-muted-foreground">Not found.</div>;

  const currentSh = stakeholders.find((x) => x.slug === ticket.pending_with);
  const pc = serviceDeskStakeholderColor(ticket.pending_with, {
    position: currentSh?.position,
    semantics: currentSh?.semantics,
  });
  const bc = SERVICE_DESK_BREACH_COLORS[ticket.tat.breach_level];

  const apply = async () => {
    if (!target) return;
    await changePendingWith.mutateAsync({ id: ticketId, pending_with: target, note: note || undefined });
    setTarget("");
    setNote("");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <button onClick={() => router.push("/service-desk")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("detail.back")}
      </button>

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{ticket.display_id}</h1>
          {ticket.needs_triage && <Badge variant="outline" className="text-amber-600">{t("detail.needsTriage")}</Badge>}
        </div>
        <p className="text-muted-foreground">{ticket.subject ?? "—"}</p>
      </div>

      {/* Fields */}
      <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
        <Field label={t("detail.requester")} value={ticket.requester_name || ticket.requester_email || "—"} />
        <Field label={t("detail.requestType")} value={requestTypeLabel(ticket.request_type)} />
        <Field label={terms.account ?? t("detail.account")} value={ticket.account_name ?? "—"} />
        <Field
          label={t("detail.pendingWith")}
          value={<span className={`inline-flex rounded px-1.5 py-0.5 text-xs ${pc?.bg} ${pc?.text}`}>{stakeholderLabel(ticket.pending_with)}</span>}
        />
      </Card>

      {/* TAT */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{t("detail.overallTat")}</div>
          <div className="text-xl font-semibold">{ticket.tat.overall_days}d</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{t("detail.currentStage")}</div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold">{ticket.tat.current_stage_days}d</span>
            <span className={`h-2.5 w-2.5 rounded-full ${bc?.dot}`} />
          </div>
        </Card>
        <Card className="p-4">
          <div className="mb-1 text-xs text-muted-foreground">{t("detail.stakeholderTat")}</div>
          <div className="space-y-0.5">
            {Object.entries(ticket.tat.stakeholder_seconds).map(([k, secs]) => (
              <div key={k} className="flex justify-between text-xs">
                <span>{stakeholderLabel(k)}</span>
                <span className="text-muted-foreground">{fmtDays(secs)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Pending-with control */}
      <Card className="space-y-3 p-4">
        <div className="text-sm font-semibold">{t("detail.changeTo")}</div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as PendingWith)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {stakeholders
              .filter((o) => o.slug !== ticket.pending_with)
              .map((o) => (
                <option key={o.slug} value={o.slug}>{o.label}</option>
              ))}
          </select>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("detail.note")} className="max-w-xs" />
          <Button onClick={apply} disabled={!target || changePendingWith.isPending}>{t("detail.apply")}</Button>
        </div>
      </Card>

      {/* Convert to project task */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <GitBranch className="h-4 w-4" /> {t("detail.convertToTask")}
        </div>
        {ticket.linked_task_id ? (
          <Badge variant="secondary">{t("detail.linkedToTask")}</Badge>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">{t("detail.selectProject")}</option>
              {projects.map((p: { id: string; name: string }) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <Button
              disabled={!projectId || convertToTask.isPending}
              onClick={() => convertToTask.mutate({ id: ticketId, data: { project_id: projectId } })}
            >
              {convertToTask.isPending ? t("detail.converting") : t("detail.convert")}
            </Button>
          </div>
        )}
      </Card>

      {/* Timeline */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><Clock className="h-4 w-4" /> {t("detail.timeline")}</div>
        <ol className="space-y-3">
          {ticket.segments.map((s) => {
            const sh = stakeholders.find((x) => x.slug === s.pending_with);
            const c = serviceDeskStakeholderColor(s.pending_with, {
              position: sh?.position,
              semantics: sh?.semantics,
            });
            return (
              <li key={s.id} className="flex gap-3">
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${c?.dot ?? "bg-muted-foreground"}`} />
                <div className="text-sm">
                  <div className="font-medium">{stakeholderLabel(s.pending_with)}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(s.entered_at).toLocaleString()}
                    {s.exited_at ? ` → ${new Date(s.exited_at).toLocaleString()}` : ` · ${t("detail.open")}`}
                    {s.duration_seconds != null && ` · ${fmtDays(s.duration_seconds)}`}
                  </div>
                  {s.note && <div className="text-xs text-muted-foreground">{s.note}</div>}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
