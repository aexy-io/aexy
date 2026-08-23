"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { useWorkspace } from "@/hooks/useWorkspace";
import { useBillingBreakdown, useBillingBreakdownHistory } from "@/hooks/useBillingBreakdown";
import { BillingBreakdownView } from "@/components/billing/BillingBreakdownView";
import { SettingsPage, SettingsSkeleton, SettingsAccessDenied } from "@/components/settings/SettingsPrimitives";

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
      <SettingsAccessDenied title={t("adminRequired")} detail={t("adminRequiredDesc")} />
    );
  }

  return (
    <SettingsPage
      title={t("title")}
      description={t("subtitle")}
      width="wide"
    >
      {breakdown.isLoading || history.isLoading ? (
        <SettingsSkeleton rows={2} />
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
    </SettingsPage>
  );
}
