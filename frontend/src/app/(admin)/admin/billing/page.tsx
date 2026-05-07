"use client";

import { useState } from "react";
import { Building2, Loader2, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  usePlatformBillingBreakdown,
  usePlatformBillingBreakdownHistory,
  usePlatformBillingSummary,
  usePlatformBillingTotals,
} from "@/hooks/useBillingBreakdown";
import { BillingBreakdownView } from "@/components/billing/BillingBreakdownView";

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function PlatformBillingPage() {
  const t = useTranslations("settings.platformBilling");
  const tBreakdown = useTranslations("settings.billing.breakdownPage");

  const [period, setPeriod] = useState("current");
  const [search, setSearch] = useState("");
  const [planTier, setPlanTier] = useState<string>("");
  const [billingModel, setBillingModel] = useState<string>("");
  const [page, setPage] = useState(1);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    null,
  );
  const [drilldownPeriod, setDrilldownPeriod] = useState("current");

  const totals = usePlatformBillingTotals(period);
  const summary = usePlatformBillingSummary({
    page,
    per_page: 25,
    plan_tier: planTier || undefined,
    billing_model: billingModel || undefined,
    search: search || undefined,
  });
  const breakdown = usePlatformBillingBreakdown(
    selectedWorkspaceId ?? undefined,
    drilldownPeriod,
  );
  const history = usePlatformBillingBreakdownHistory(
    selectedWorkspaceId ?? undefined,
    6,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-3 py-2 text-sm bg-background border border-border rounded-lg"
        >
          <option value="current">{tBreakdown("current")}</option>
          <option value="previous">{tBreakdown("previous")}</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 bg-card border border-border rounded-xl">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {t("totalRevenue")}
          </div>
          <div className="text-2xl font-semibold mt-1 text-foreground">
            {totals.data ? formatCents(totals.data.total_revenue_cents) : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {t("workspaceCount", { count: totals.data?.workspace_count ?? 0 })}
          </div>
        </div>
        <div className="p-5 bg-card border border-border rounded-xl">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {t("margin")}
          </div>
          <div className="text-2xl font-semibold mt-1 text-foreground">
            {totals.data ? formatCents(totals.data.total_margin_cents) : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {t("providerCost")}{" "}
            {totals.data
              ? formatCents(totals.data.total_base_cost_cents)
              : "—"}
          </div>
        </div>
        <div className="p-5 bg-card border border-border rounded-xl">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {t("byPlanTier")}
          </div>
          <div className="space-y-1 mt-2 text-sm">
            {totals.data
              ? Object.entries(totals.data.by_plan_tier).map(([tier, v]) => (
                  <div
                    key={tier}
                    className="flex justify-between text-foreground"
                  >
                    <span className="text-muted-foreground">{tier}</span>
                    <span>{formatCents(v)}</span>
                  </div>
                ))
              : null}
          </div>
        </div>
        <div className="p-5 bg-card border border-border rounded-xl">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {t("byBillingModel")}
          </div>
          <div className="space-y-1 mt-2 text-sm">
            {totals.data
              ? Object.entries(totals.data.by_billing_model).map(
                  ([model, v]) => (
                    <div
                      key={model}
                      className="flex justify-between text-foreground"
                    >
                      <span className="text-muted-foreground">
                        {model.replace(/_/g, " ")}
                      </span>
                      <span>{formatCents(v)}</span>
                    </div>
                  ),
                )
              : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-card border border-border rounded-xl p-3">
        <div className="flex-1 min-w-[220px] relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={t("search")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-lg"
          />
        </div>
        <select
          value={planTier}
          onChange={(e) => {
            setPlanTier(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-sm bg-background border border-border rounded-lg"
        >
          <option value="">{t("allTiers")}</option>
          <option value="free">{t("tier.free")}</option>
          <option value="pro">{t("tier.pro")}</option>
          <option value="enterprise">{t("tier.enterprise")}</option>
          <option value="custom">{t("tier.custom")}</option>
        </select>
        <select
          value={billingModel}
          onChange={(e) => {
            setBillingModel(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-sm bg-background border border-border rounded-lg"
        >
          <option value="">{t("allBillingModels")}</option>
          <option value="free">{t("billingModel.free")}</option>
          <option value="per_seat">{t("billingModel.perSeat")}</option>
          <option value="flat_plus_usage">
            {t("billingModel.flatPlusUsage")}
          </option>
          <option value="postpaid">{t("billingModel.postpaid")}</option>
        </select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="text-left px-5 py-3 text-xs uppercase text-muted-foreground tracking-wide">
                  {t("headers.workspace")}
                </th>
                <th className="text-left px-5 py-3 text-xs uppercase text-muted-foreground tracking-wide">
                  {t("headers.plan")}
                </th>
                <th className="text-left px-5 py-3 text-xs uppercase text-muted-foreground tracking-wide">
                  {t("headers.billing")}
                </th>
                <th className="text-right px-5 py-3 text-xs uppercase text-muted-foreground tracking-wide">
                  {t("headers.seats")}
                </th>
                <th className="text-right px-5 py-3 text-xs uppercase text-muted-foreground tracking-wide">
                  {t("headers.providerCost")}
                </th>
                <th className="text-right px-5 py-3 text-xs uppercase text-muted-foreground tracking-wide">
                  {t("headers.margin")}
                </th>
                <th className="text-right px-5 py-3 text-xs uppercase text-muted-foreground tracking-wide">
                  {t("headers.total")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {summary.isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" />
                  </td>
                </tr>
              ) : summary.data && summary.data.rows.length > 0 ? (
                summary.data.rows.map((row) => (
                  <tr
                    key={row.workspace_id}
                    className="hover:bg-muted/30 cursor-pointer"
                    onClick={() => {
                      setSelectedWorkspaceId(row.workspace_id);
                      setDrilldownPeriod(period);
                    }}
                  >
                    <td className="px-5 py-3 text-foreground flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {row.workspace_name}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {row.plan_tier}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {row.billing_model.replace(/_/g, " ")}
                    </td>
                    <td className="px-5 py-3 text-right text-muted-foreground">
                      {row.seat_count}
                    </td>
                    <td className="px-5 py-3 text-right text-muted-foreground">
                      {formatCents(row.base_cost_cents)}
                    </td>
                    <td className="px-5 py-3 text-right text-emerald-500">
                      {formatCents(row.margin_cents)}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-foreground">
                      {formatCents(row.total_cents)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center py-8 text-muted-foreground"
                  >
                    {t("noWorkspaces")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {summary.data && summary.data.total > summary.data.per_page && (
          <div className="px-5 py-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {t("paginationLabel", {
                page: summary.data.page,
                total: Math.ceil(summary.data.total / summary.data.per_page),
                count: summary.data.total,
              })}
            </span>
            <div className="flex gap-2">
              <button
                disabled={summary.data.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 border border-border rounded disabled:opacity-50"
              >
                {t("prev")}
              </button>
              <button
                disabled={
                  summary.data.page * summary.data.per_page >=
                  summary.data.total
                }
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 border border-border rounded disabled:opacity-50"
              >
                {t("next")}
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedWorkspaceId && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-black/50"
            onClick={() => setSelectedWorkspaceId(null)}
          />
          <div className="w-full max-w-4xl bg-background border-l border-border overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-foreground">
                {t("workspaceBreakdown")}
              </h2>
              <button
                onClick={() => setSelectedWorkspaceId(null)}
                className="p-2 hover:bg-accent rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {breakdown.isLoading || history.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : breakdown.error ? (
              <div className="text-sm text-red-400">{t("failedLoad")}</div>
            ) : breakdown.data ? (
              <BillingBreakdownView
                breakdown={breakdown.data}
                history={history.data?.history}
                period={drilldownPeriod}
                onPeriodChange={setDrilldownPeriod}
                isLoading={breakdown.isFetching}
                onRefresh={() => {
                  breakdown.refetch();
                  history.refetch();
                }}
                showMargin={true}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
