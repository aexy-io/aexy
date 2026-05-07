"use client";

import { Info, Loader2, Receipt, TrendingDown, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import type {
  BillingBreakdown,
  BillingBreakdownHistory,
  BillingLineItem,
} from "@/lib/api";

function formatCents(cents: number, currency: string = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface Props {
  breakdown: BillingBreakdown;
  history?: BillingBreakdownHistory["history"];
  showMargin?: boolean;
  period: string;
  onPeriodChange?: (period: string) => void;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export function BillingBreakdownView({
  breakdown,
  history,
  showMargin = false,
  period,
  onPeriodChange,
  isLoading,
  onRefresh,
}: Props) {
  const t = useTranslations("settings.billing.breakdownPage");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const categoryLabel = (category: BillingLineItem["category"]) => {
    switch (category) {
      case "base_fee":
        return t("category.baseFee");
      case "seats":
        return t("category.seats");
      case "llm_usage":
        return t("category.llmUsage");
      case "storage":
        return t("category.storage");
      case "free_credit":
        return t("category.freeCredit");
      case "overage":
        return t("category.overage");
      default:
        return t("category.other");
    }
  };

  const periodOptions = useMemo(() => {
    const opts = [
      { value: "current", label: t("current") },
      { value: "previous", label: t("previous") },
    ];
    if (history && history.length > 0) {
      history.forEach((h) => {
        const start = new Date(h.period_start);
        const v = `${start.getFullYear()}-${String(
          start.getMonth() + 1,
        ).padStart(2, "0")}`;
        const label = start.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        });
        if (!opts.find((o) => o.value === v)) {
          opts.push({ value: v, label });
        }
      });
    }
    return opts;
  }, [history, t]);

  const totalDue = breakdown.total_cents;
  const delta = breakdown.delta_cents;
  const deltaPct = breakdown.delta_pct;

  return (
    <div className="space-y-6">
      {/* Period header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            {breakdown.workspace_name ?? t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {breakdown.plan_name} · {breakdown.billing_model.replace(/_/g, " ")}{" "}
            · {formatDate(breakdown.period_start)} →{" "}
            {formatDate(breakdown.period_end)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onPeriodChange && (
            <select
              className="px-3 py-2 text-sm bg-background border border-border rounded-lg"
              value={period}
              onChange={(e) => onPeriodChange(e.target.value)}
            >
              {periodOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="px-3 py-2 text-sm bg-background border border-border rounded-lg hover:bg-accent disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("refresh")
              )}
            </button>
          )}
        </div>
      </div>

      {/* Cost summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 bg-card border border-border rounded-xl">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {t("totalForPeriod")}
          </div>
          <div className="text-3xl font-semibold mt-1 text-foreground">
            {formatCents(totalDue)}
          </div>
          {breakdown.subtotal_cents !== totalDue && (
            <div className="text-xs text-muted-foreground mt-2">
              {t("subtotalLine", {
                subtotal: formatCents(breakdown.subtotal_cents),
                credits: formatCents(-breakdown.credit_cents),
              })}
            </div>
          )}
        </div>
        <div className="p-5 bg-card border border-border rounded-xl">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {t("vsPrevious")}
          </div>
          {delta === null || deltaPct === null ? (
            <div className="text-sm text-muted-foreground mt-3">
              {t("noPriorData")}
            </div>
          ) : (
            <>
              <div
                className={`text-2xl font-semibold mt-1 flex items-center gap-2 ${
                  delta >= 0 ? "text-amber-500" : "text-emerald-500"
                }`}
              >
                {delta >= 0 ? (
                  <TrendingUp className="h-5 w-5" />
                ) : (
                  <TrendingDown className="h-5 w-5" />
                )}
                {delta >= 0 ? "+" : ""}
                {formatCents(delta)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {t("deltaPctFromLastPeriod", {
                  pct: `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}`,
                })}
              </div>
            </>
          )}
        </div>
        {showMargin && breakdown.margin && (
          <div className="p-5 bg-card border border-border rounded-xl">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              {t("marginAdmin")}
            </div>
            <div className="text-2xl font-semibold mt-1 text-foreground">
              {formatCents(breakdown.margin.margin_cents)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {t("marginOnCharged", {
                pct: breakdown.margin.margin_pct.toFixed(1),
                charged: formatCents(breakdown.margin.charged_cents),
              })}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {t("marginProviderCost", {
                cost: formatCents(breakdown.margin.base_cost_cents),
              })}
            </div>
          </div>
        )}
      </div>

      {/* Line items */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/40">
          <h3 className="text-sm font-medium text-foreground">
            {t("lineItems")}
          </h3>
        </div>
        <div className="divide-y divide-border">
          {breakdown.line_items.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              {t("noUsage")}
            </div>
          ) : (
            breakdown.line_items.map((item, idx) => (
              <div key={idx} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wide">
                        {categoryLabel(item.category)}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {item.label}
                      </span>
                    </div>
                    {item.description && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {item.description}
                      </div>
                    )}
                    {item.rate_display && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {t("rate")}: {item.rate_display}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`text-base font-semibold ${
                        item.subtotal_cents < 0
                          ? "text-emerald-500"
                          : "text-foreground"
                      }`}
                    >
                      {formatCents(item.subtotal_cents)}
                    </div>
                    {item.unit && item.quantity > 0 && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatNumber(item.quantity)} {item.unit}
                      </div>
                    )}
                  </div>
                </div>
                {item.metadata && Object.keys(item.metadata).length > 0 && (
                  <button
                    className="text-xs text-blue-500 mt-2 hover:underline"
                    onClick={() =>
                      setExpanded((e) => ({ ...e, [idx]: !e[idx] }))
                    }
                  >
                    {expanded[idx] ? t("hideDetails") : t("showDetails")}
                  </button>
                )}
                {expanded[idx] && item.metadata && (
                  <pre className="mt-2 p-3 bg-muted/50 rounded text-xs overflow-x-auto text-muted-foreground">
                    {JSON.stringify(item.metadata, null, 2)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
        <div className="px-5 py-3 border-t border-border bg-muted/40 flex justify-between items-center">
          <div className="text-sm text-muted-foreground">{t("total")}</div>
          <div className="text-lg font-semibold text-foreground">
            {formatCents(totalDue)}
          </div>
        </div>
      </div>

      {/* Info counters */}
      {Object.keys(breakdown.info_counters).length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-medium text-foreground mb-3">
            {t("otherCounters")}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(breakdown.info_counters).map(([key, value]) => (
              <div key={key} className="text-sm">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  {key.replace(/_/g, " ")}
                </div>
                <div className="font-medium text-foreground">
                  {String(value ?? "—")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoices */}
      {breakdown.invoices && breakdown.invoices.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/40 flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium text-foreground">
              {t("invoicesForPeriod")}
            </h3>
          </div>
          <div className="divide-y divide-border">
            {breakdown.invoices.map((inv) => (
              <div
                key={inv.id}
                className="px-5 py-3 flex items-center justify-between"
              >
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {inv.stripe_invoice_number ?? inv.id.slice(0, 8)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {inv.status} · {formatDate(inv.created_at)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm font-medium text-foreground">
                    {formatCents(inv.total_cents, inv.currency)}
                  </div>
                  {inv.hosted_invoice_url && (
                    <a
                      href={inv.hosted_invoice_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-500 hover:underline"
                    >
                      {t("viewInvoice")}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History sparkline */}
      {history && history.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-medium text-foreground mb-3">
            {t("trendTitle", { count: history.length })}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            {history.slice().reverse().map((h, idx) => {
              const max = Math.max(...history.map((x) => x.total_cents), 1);
              const height = Math.max(4, (h.total_cents / max) * 80);
              return (
                <div key={idx} className="flex flex-col items-center gap-1">
                  <div className="text-xs text-muted-foreground">
                    {formatCents(h.total_cents)}
                  </div>
                  <div
                    className="w-full bg-blue-500/30 rounded"
                    style={{ height: `${height}px` }}
                  />
                  <div className="text-xs text-muted-foreground">
                    {new Date(h.period_start).toLocaleDateString("en-US", {
                      month: "short",
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Computation notes */}
      {breakdown.computation_notes && breakdown.computation_notes.length > 0 && (
        <div className="bg-muted/40 border border-border rounded-xl p-4 flex gap-3">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="space-y-1">
            {breakdown.computation_notes.map((note, idx) => (
              <p key={idx} className="text-xs text-muted-foreground">
                {note}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
