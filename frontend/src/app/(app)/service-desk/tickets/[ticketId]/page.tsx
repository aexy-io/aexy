"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Clock, GitBranch } from "lucide-react";
import { useTranslations } from "next-intl";

import { useServiceDeskTicket, useServiceDeskMutations } from "@/hooks/useServiceDesk";
import { useProjects } from "@/hooks/useProjects";
import { useWorkspace } from "@/hooks/useWorkspace";
import { PendingWith } from "@/lib/service-desk-api";
import {
  SERVICE_DESK_BREACH_COLORS,
  SERVICE_DESK_PENDING_WITH_COLORS,
  SERVICE_DESK_PENDING_WITH_LABELS,
  SERVICE_DESK_REQUEST_TYPE_LABELS,
} from "@/lib/statusColors";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

const PENDING_OPTIONS: PendingWith[] = [
  "kam", "insurer", "partner", "sales", "third_party", "finance", "marketing", "closed",
];

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

  const [target, setTarget] = useState<PendingWith | "">("");
  const [note, setNote] = useState("");
  const [projectId, setProjectId] = useState("");

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!ticket) return <div className="p-6 text-muted-foreground">Not found.</div>;

  const pc = SERVICE_DESK_PENDING_WITH_COLORS[ticket.pending_with];
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
        <Field label={t("detail.requestType")} value={SERVICE_DESK_REQUEST_TYPE_LABELS[ticket.request_type] ?? ticket.request_type} />
        <Field label={t("detail.partner")} value={ticket.partner_name ?? "—"} />
        <Field
          label={t("detail.pendingWith")}
          value={<span className={`inline-flex rounded px-1.5 py-0.5 text-xs ${pc?.bg} ${pc?.text}`}>{SERVICE_DESK_PENDING_WITH_LABELS[ticket.pending_with] ?? ticket.pending_with}</span>}
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
                <span>{SERVICE_DESK_PENDING_WITH_LABELS[k] ?? k}</span>
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
            {PENDING_OPTIONS.filter((o) => o !== ticket.pending_with).map((o) => (
              <option key={o} value={o}>{SERVICE_DESK_PENDING_WITH_LABELS[o]}</option>
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
            const c = SERVICE_DESK_PENDING_WITH_COLORS[s.pending_with];
            return (
              <li key={s.id} className="flex gap-3">
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${c?.dot ?? "bg-muted-foreground"}`} />
                <div className="text-sm">
                  <div className="font-medium">{SERVICE_DESK_PENDING_WITH_LABELS[s.pending_with] ?? s.pending_with}</div>
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
