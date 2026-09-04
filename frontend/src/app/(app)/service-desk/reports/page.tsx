"use client";

import { useMemo, useState } from "react";
import { BarChart3, Download, Inbox } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  useScorecard,
  useServiceDeskMutations,
  useTatReport,
} from "@/hooks/useServiceDesk";
import type { ReportColumn, ScorecardRow, TicketQuery } from "@/lib/service-desk-api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/EmptyState";

const FILTER_CLASS =
  "h-9 rounded-md border border-input bg-background px-2 py-1 text-xs";

type Tab = "tat" | "scorecard";

/**
 * A rating's colour, keyed on its *position* in the band list rather than on its
 * label. The labels are the workspace's own words — a desk that renames
 * "Outstanding" must not lose its colours — and the rating number is only
 * conventionally 1-5, so neither is safe to switch on.
 */
function bandTone(index: number, total: number): string {
  const share = total <= 1 ? 0 : index / (total - 1);
  if (share <= 0.25) return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
  if (share <= 0.5) return "bg-sky-500/10 text-sky-600 border-sky-500/20";
  if (share <= 0.75) return "bg-amber-500/10 text-amber-600 border-amber-500/20";
  return "bg-rose-500/10 text-rose-600 border-rose-500/20";
}

/** A figure formatted for its own unit, so a 0.83 rate is never read as 83 hours. */
function formatValue(value: unknown, unit: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (unit === "rate" && typeof value === "number") return `${Math.round(value * 100)}%`;
  if (unit === "ratio" && typeof value === "number") return `${value.toFixed(2)}×`;
  if (unit === "datetime" && typeof value === "string") {
    return new Date(value).toLocaleString();
  }
  return String(value);
}

export default function ServiceDeskReportsPage() {
  const t = useTranslations("serviceDesk.reports");
  const tf = useTranslations("serviceDesk.filters");
  const [tab, setTab] = useState<Tab>("tat");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");

  // One filter object for both reports, so switching tabs keeps the period and
  // the two views can never be showing different months.
  const query = useMemo<TicketQuery>(() => {
    const q: TicketQuery = {};
    if (createdFrom) q.created_from = new Date(createdFrom).toISOString();
    if (createdTo) q.created_to = new Date(`${createdTo}T23:59:59`).toISOString();
    return q;
  }, [createdFrom, createdTo]);

  const tat = useTatReport(tab === "tat" ? query : undefined);
  const scorecard = useScorecard(tab === "scorecard" ? query : undefined);
  const { exportReportCsv } = useServiceDeskMutations();

  const loading = tab === "tat" ? tat.isLoading : scorecard.isLoading;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={exportReportCsv.isPending}
          onClick={() =>
            exportReportCsv.mutate({
              report: tab,
              query,
              filename: tab === "tat" ? "tat-report.csv" : "scorecard.csv",
            })
          }
        >
          <Download className="h-4 w-4 mr-2" />
          {tf("export")}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex gap-1 rounded-md border border-input p-1">
          {(["tat", "scorecard"] as Tab[]).map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-1.5 text-xs rounded ${
                tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {t(`tabs.${key}`)}
            </button>
          ))}
        </div>
        <label className="text-xs text-muted-foreground">
          {tf("from")}
          <input
            type="date"
            value={createdFrom}
            onChange={(e) => setCreatedFrom(e.target.value)}
            className={`${FILTER_CLASS} ml-2`}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          {tf("to")}
          <input
            type="date"
            value={createdTo}
            onChange={(e) => setCreatedTo(e.target.value)}
            className={`${FILTER_CLASS} ml-2`}
          />
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : tab === "tat" ? (
        <TatTable report={tat.data} />
      ) : (
        <ScorecardTable report={scorecard.data} />
      )}
    </div>
  );
}

function TatTable({ report }: { report: ReturnType<typeof useTatReport>["data"] }) {
  const t = useTranslations("serviceDesk.reports");
  if (!report || report.rows.length === 0) {
    return <EmptyState icon={Inbox} title={t("empty.tat")} description={t("empty.tatHint")} />;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {t("clockNote", {
          hours: report.working_day_hours,
          days: report.breach_red_days,
        })}
      </p>
      {/* The wide table scrolls in its own box; the page body must not scroll
          sideways, and a desk with a dozen stakeholders makes this wide. */}
      <Card className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b bg-muted/40">
            <tr>
              {report.columns.map((column: ReportColumn) => (
                <th
                  key={column.key}
                  className="px-3 py-2 text-left font-medium whitespace-nowrap"
                  // The unit is the only place a reader can see whether a figure
                  // is working time or elapsed time.
                  title={column.unit}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row, index) => (
              <tr key={String(row.ticket_id ?? index)} className="border-b last:border-0">
                {report.columns.map((column: ReportColumn) => (
                  <td key={column.key} className="px-3 py-2 whitespace-nowrap">
                    {column.key === "breach_level" ? (
                      <BreachChip level={String(row[column.key] ?? "green")} />
                    ) : (
                      formatValue(row[column.key], column.unit)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function BreachChip({ level }: { level: string }) {
  const tone =
    level === "red"
      ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
      : level === "amber"
        ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
        : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
  return <Badge className={`${tone} border`}>{level}</Badge>;
}

function ScorecardTable({ report }: { report: ReturnType<typeof useScorecard>["data"] }) {
  const t = useTranslations("serviceDesk.reports");
  if (!report || report.rows.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title={t("empty.scorecard")}
        description={t("empty.scorecardHint")}
      />
    );
  }

  const bandIndex = new Map(report.bands.map((b, i) => [b.rating, i]));

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {report.restricted_to_self
          ? t("ownRowOnly", { owners: report.cohort.owners })
          : t("cohort", { owners: report.cohort.owners })}
      </p>
      <Card className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t("columns.owner")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("columns.closed")}</th>
              {report.kpis.map((kpi) => (
                <th
                  key={kpi.metric_key}
                  className="px-3 py-2 text-left font-medium whitespace-nowrap"
                  title={t("weightTip", { weight: Math.round(kpi.weight * 100) })}
                >
                  {kpi.label}
                </th>
              ))}
              <th className="px-3 py-2 text-left font-medium">{t("columns.total")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("columns.rating")}</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row: ScorecardRow) => (
              <tr key={row.owner_id ?? row.owner} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{row.owner}</td>
                <td className="px-3 py-2">
                  {row.tickets_closed} / {row.tickets}
                </td>
                {report.kpis.map((kpi) => {
                  const value = row.values[kpi.metric_key];
                  const score = row.scores[kpi.metric_key];
                  return (
                    <td key={kpi.metric_key} className="px-3 py-2 whitespace-nowrap">
                      {/* Raw figure and score together: a rating nobody can see
                          the arithmetic behind is not reviewable, and this is
                          performance data about a named person. */}
                      <span>{formatValue(value, kpi.unit)}</span>
                      <span className="ml-2 text-muted-foreground">
                        {score === null ? "—" : score}
                      </span>
                    </td>
                  );
                })}
                <td className="px-3 py-2 font-medium">
                  {row.sim_score === null ? "—" : row.sim_score}
                  {/* Below full weight means KPIs were skipped for want of data
                      and the total was renormalised over the rest. */}
                  {row.sim_score !== null && row.weight_scored < 1 && (
                    <span
                      className="ml-1 text-muted-foreground"
                      title={t("partialTip", { pct: Math.round(row.weight_scored * 100) })}
                    >
                      *
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {row.rating === null ? (
                    "—"
                  ) : (
                    <Badge
                      className={`border ${bandTone(
                        bandIndex.get(row.rating) ?? 0,
                        report.bands.length,
                      )}`}
                    >
                      {row.rating_label}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
