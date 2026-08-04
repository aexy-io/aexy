"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, Inbox, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { useServiceDeskDashboard, useServiceDeskSettings, useServiceDeskTaxonomy } from "@/hooks/useServiceDesk";
import { DashboardTicket, StakeholderBucket } from "@/lib/service-desk-api";
import {
  SERVICE_DESK_BREACH_COLORS,
  serviceDeskStakeholderColor,
} from "@/lib/statusColors";
import { ServiceDeskSetup } from "@/components/service-desk/ServiceDeskSetup";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/EmptyState";

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

function toCsv(tickets: DashboardTicket[], terms: Record<string, string>): string {
  // Header nouns follow the workspace's vocabulary — an insurance desk still
  // exports "Line of Business"/"Partner", a software desk "Product"/"Customer".
  const head = [
    "Ticket", "Subject", terms.product ?? "Product", terms.account ?? "Account",
    "Type", "Pending With", "Days in stage", "Overall age", "Status",
  ];
  const rows = tickets.map((t) => [
    t.display_id, t.subject ?? "", t.product_name ?? "", t.account_name ?? "",
    t.request_type, t.pending_with, String(t.days_in_stage), String(t.overall_days), t.status ?? "",
  ]);
  return [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export default function ServiceDeskDashboardPage() {
  const t = useTranslations("serviceDesk");
  const router = useRouter();
  const { data, isLoading } = useServiceDeskDashboard();
  const { data: settings } = useServiceDeskSettings();
  const { stakeholders, stakeholderLabel, requestTypeLabel, isConfigured, isLoading: taxonomyLoading } =
    useServiceDeskTaxonomy();
  const terms = settings?.terminology ?? {};
  // The age columns used to read "0–1 day / 1–2 days / >2 days", which was one
  // customer's SLA written into the UI. Both thresholds are per workspace.
  const thresholds = {
    amber: settings?.breach_amber_days ?? 1,
    red: settings?.breach_red_days ?? 2,
  };

  const bucketByKey: Record<string, StakeholderBucket> = {};
  (data?.stakeholders ?? []).forEach((s) => (bucketByKey[s.pending_with] = s));
  // The server already returns one bucket per open stakeholder in the
  // workspace's order, so the board no longer imposes a hardcoded ordering that
  // silently dropped any stakeholder it hadn't heard of.
  const rows = (data?.stakeholders ?? []).map((s) => s.pending_with);
  const positionOf = (slug: string) => stakeholders.find((s) => s.slug === slug)?.position;
  const semanticsOf = (slug: string) => stakeholders.find((s) => s.slug === slug)?.semantics;

  // See the `justSetUp` note below where the setup screen is rendered.
  const [justSetUp, setJustSetUp] = useState(false);

  const download = () => {
    if (!data) return;
    const blob = new Blob([toCsv(data.tickets, terms)], { type: "text/csv" });
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

      {isLoading || taxonomyLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !isConfigured || justSetUp ? (
        /* No stakeholders means nobody has chosen a starting point yet. Showing
           the queue board here renders zero columns and reads as a broken page
           rather than an unconfigured one.
           `justSetUp` keeps this mounted after a template is applied: without it
           the taxonomy query invalidates, `isConfigured` flips true, and the
           component is swapped out before it can show what it created or point
           at the departments that still need people in them. */
        <ServiceDeskSetup
          canManage={!!settings?.can_manage}
          onComplete={() => setJustSetUp(true)}
          onDismiss={() => setJustSetUp(false)}
        />
      ) : !data || data.total_open === 0 ? (
        <EmptyState icon={Inbox} title={t("dashboard.ticketsTitle")} description={t("dashboard.empty")} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile icon={<Inbox className="h-5 w-5" />} value={data.total_open} label={t("stats.totalOpen")} />
            <StatTile icon={<AlertTriangle className="h-5 w-5" />} value={data.breaching} label={t("stats.breaching", thresholds)} danger />
            <StatTile icon={<Users className="h-5 w-5" />} value={rows.length} label={t("stats.stakeholders")} />
          </div>

          {/* Stakeholder × age matrix */}
          <Card className="overflow-x-auto p-4">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t("dashboard.matrixTitle")}</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{t("dashboard.stakeholder")}</th>
                  <th className="px-3 py-2 text-center">{t("dashboard.col01", thresholds)}</th>
                  <th className="px-3 py-2 text-center">{t("dashboard.col12", thresholds)}</th>
                  <th className="px-3 py-2 text-center">{t("dashboard.colGt2", thresholds)}</th>
                  <th className="px-3 py-2 text-center">{t("dashboard.total")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((k) => {
                  const b = bucketByKey[k];
                  const c = serviceDeskStakeholderColor(k, { position: positionOf(k), semantics: semanticsOf(k) });
                  return (
                    <tr key={k} className="border-t border-border">
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1.5`}>
                          <span className={`h-2 w-2 rounded-full ${c?.dot ?? "bg-muted-foreground"}`} />
                          {stakeholderLabel(k)}
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
                  <th className="px-3 py-2">{terms.product ?? t("table.product")}</th>
                  <th className="px-3 py-2">{terms.account ?? t("table.account")}</th>
                  <th className="px-3 py-2">{t("table.type")}</th>
                  <th className="px-3 py-2">{t("table.pendingWith")}</th>
                  <th className="px-3 py-2 text-right">{t("table.daysInStage")}</th>
                  <th className="px-3 py-2 text-right">{t("table.overallAge")}</th>
                </tr>
              </thead>
              <tbody>
                {data.tickets.map((tk) => {
                  const pc = serviceDeskStakeholderColor(tk.pending_with, {
                    position: positionOf(tk.pending_with),
                    semantics: semanticsOf(tk.pending_with),
                  });
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
                      <td className="px-3 py-2">{tk.product_name ?? "—"}</td>
                      <td className="px-3 py-2">{tk.account_name ?? "—"}</td>
                      <td className="px-3 py-2">{requestTypeLabel(tk.request_type)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs ${pc?.bg} ${pc?.text}`}>
                          {stakeholderLabel(tk.pending_with)}
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
