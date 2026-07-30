"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, Download, Inbox, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { useServiceDeskDashboard } from "@/hooks/useServiceDesk";
import { DashboardTicket, StakeholderBucket } from "@/lib/service-desk-api";
import {
  SERVICE_DESK_BREACH_COLORS,
  SERVICE_DESK_PENDING_WITH_COLORS,
  SERVICE_DESK_PENDING_WITH_LABELS,
  SERVICE_DESK_REQUEST_TYPE_LABELS,
} from "@/lib/statusColors";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/EmptyState";

const STAKEHOLDER_ORDER = ["kam", "insurer", "partner", "sales", "third_party", "finance", "marketing"];

function StatTile({ icon, value, label, danger }: { icon: React.ReactNode; value: number; label: string; danger?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted p-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${danger ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300" : "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300"}`}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function ageCell(n: number, tone: "green" | "amber" | "red") {
  if (n === 0) return <span className="text-muted-foreground">0</span>;
  const c = SERVICE_DESK_BREACH_COLORS[tone];
  return <span className={`inline-flex min-w-6 justify-center rounded px-1.5 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}>{n}</span>;
}

function toCsv(tickets: DashboardTicket[]): string {
  const head = ["Ticket", "Subject", "LOB", "Partner", "Type", "Pending With", "Days in stage", "Overall age", "Status"];
  const rows = tickets.map((t) => [
    t.display_id, t.subject ?? "", t.lob_name ?? "", t.partner_name ?? "",
    t.request_type, t.pending_with, String(t.days_in_stage), String(t.overall_days), t.status ?? "",
  ]);
  return [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export default function ServiceDeskDashboardPage() {
  const t = useTranslations("serviceDesk");
  const router = useRouter();
  const { data, isLoading } = useServiceDeskDashboard();

  const bucketByKey: Record<string, StakeholderBucket> = {};
  (data?.stakeholders ?? []).forEach((s) => (bucketByKey[s.pending_with] = s));
  const rows = STAKEHOLDER_ORDER.filter((k) => bucketByKey[k]);

  const download = () => {
    if (!data) return;
    const blob = new Blob([toCsv(data.tickets)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "service-desk-open-tickets.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {data && data.tickets.length > 0 && (
          <button onClick={download} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
            <Download className="h-4 w-4" /> {t("dashboard.export")}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !data || data.total_open === 0 ? (
        <EmptyState icon={Inbox} title={t("dashboard.ticketsTitle")} description={t("dashboard.empty")} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile icon={<Inbox className="h-5 w-5" />} value={data.total_open} label={t("stats.totalOpen")} />
            <StatTile icon={<AlertTriangle className="h-5 w-5" />} value={data.breaching} label={t("stats.breaching")} danger />
            <StatTile icon={<Users className="h-5 w-5" />} value={rows.length} label={t("stats.stakeholders")} />
          </div>

          {/* Stakeholder × age matrix */}
          <Card className="overflow-x-auto p-4">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t("dashboard.matrixTitle")}</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{t("dashboard.stakeholder")}</th>
                  <th className="px-3 py-2 text-center">{t("dashboard.col01")}</th>
                  <th className="px-3 py-2 text-center">{t("dashboard.col12")}</th>
                  <th className="px-3 py-2 text-center">{t("dashboard.colGt2")}</th>
                  <th className="px-3 py-2 text-center">{t("dashboard.total")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((k) => {
                  const b = bucketByKey[k];
                  const c = SERVICE_DESK_PENDING_WITH_COLORS[k];
                  return (
                    <tr key={k} className="border-t border-border">
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1.5`}>
                          <span className={`h-2 w-2 rounded-full ${c?.dot ?? "bg-muted-foreground"}`} />
                          {SERVICE_DESK_PENDING_WITH_LABELS[k] ?? k}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">{ageCell(b.green, "green")}</td>
                      <td className="px-3 py-2 text-center">{ageCell(b.amber, "amber")}</td>
                      <td className="px-3 py-2 text-center">{ageCell(b.red, "red")}</td>
                      <td className="px-3 py-2 text-center font-medium">{b.total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* Individual tickets */}
          <Card className="overflow-x-auto p-4">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t("dashboard.ticketsTitle")}</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{t("table.id")}</th>
                  <th className="px-3 py-2">{t("table.lob")}</th>
                  <th className="px-3 py-2">{t("table.partner")}</th>
                  <th className="px-3 py-2">{t("table.type")}</th>
                  <th className="px-3 py-2">{t("table.pendingWith")}</th>
                  <th className="px-3 py-2 text-right">{t("table.daysInStage")}</th>
                  <th className="px-3 py-2 text-right">{t("table.overallAge")}</th>
                </tr>
              </thead>
              <tbody>
                {data.tickets.map((tk) => {
                  const pc = SERVICE_DESK_PENDING_WITH_COLORS[tk.pending_with];
                  const bc = SERVICE_DESK_BREACH_COLORS[tk.breach_level];
                  return (
                    <tr
                      key={tk.ticket_id}
                      onClick={() => router.push(`/service-desk/tickets/${tk.ticket_id}`)}
                      className="cursor-pointer border-t border-border hover:bg-accent/50"
                    >
                      <td className="px-3 py-2 font-medium">
                        {tk.display_id}
                        {tk.needs_triage && <Badge variant="outline" className="ml-1 text-[10px] text-amber-600">{t("table.triage")}</Badge>}
                      </td>
                      <td className="px-3 py-2">{tk.lob_name ?? "—"}</td>
                      <td className="px-3 py-2">{tk.partner_name ?? "—"}</td>
                      <td className="px-3 py-2">{SERVICE_DESK_REQUEST_TYPE_LABELS[tk.request_type] ?? tk.request_type}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs ${pc?.bg} ${pc?.text}`}>
                          {SERVICE_DESK_PENDING_WITH_LABELS[tk.pending_with] ?? tk.pending_with}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${bc?.bg} ${bc?.text}`}>{tk.days_in_stage}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{tk.overall_days}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
