"use client";

import { useTranslations } from "next-intl";

import { SettingsPage } from "@/components/settings/SettingsPrimitives";
import { ReadOnlyNotice } from "@/components/settings/service-desk/sections";
import { ScorecardSection } from "@/components/settings/service-desk/ScorecardSection";

export default function ServiceDeskScorecardSettingsPage() {
  const t = useTranslations("serviceDesk.reports.config");

  return (
    <SettingsPage title={t("title")} description={t("description")}>
      <div className="space-y-6">
        <ReadOnlyNotice />
        <ScorecardSection />
      </div>
    </SettingsPage>
  );
}
