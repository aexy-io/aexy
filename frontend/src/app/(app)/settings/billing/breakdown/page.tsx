"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { useWorkspace } from "@/hooks/useWorkspace";
import {
  useBillingBreakdown,
  useBillingBreakdownHistory,
} from "@/hooks/useBillingBreakdown";
import { BillingBreakdownView } from "@/components/billing/BillingBreakdownView";

export default function BillingBreakdownPage() {
  const t = useTranslations("settings.billing.breakdownPage");
  const { currentWorkspaceId } = useWorkspace();
  const [period, setPeriod] = useState("current");

  const breakdown = useBillingBreakdown(currentWorkspaceId ?? undefined, period);
  const history = useBillingBreakdownHistory(
    currentWorkspaceId ?? undefined,
    6,
  );

  const status = (breakdown.error as any)?.response?.status;
  if (status === 403) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h1 className="text-lg font-semibold text-foreground">
            {t("adminRequired")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("adminRequiredDesc")}
          </p>
          <Link
            href="/settings/billing"
            className="inline-block mt-4 text-sm text-blue-500 hover:underline"
          >
            {t("back")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/settings/billing"
          className="p-2 -ml-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      {breakdown.isLoading || history.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : breakdown.error ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">
          {t("failedLoad")}
        </div>
      ) : breakdown.data ? (
        <BillingBreakdownView
          breakdown={breakdown.data}
          history={history.data?.history}
          period={period}
          onPeriodChange={setPeriod}
          isLoading={breakdown.isFetching}
          onRefresh={() => {
            breakdown.refetch();
            history.refetch();
          }}
          showMargin={false}
        />
      ) : null}
    </div>
  );
}
