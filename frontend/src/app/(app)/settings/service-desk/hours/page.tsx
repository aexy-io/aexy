"use client";

import { useTranslations } from "next-intl";

import { SettingsPage } from "@/components/settings/SettingsPrimitives";
import {
  ReadOnlyNotice,
  WorkingHoursSections,
} from "@/components/settings/service-desk/sections";

export default function ServiceDeskHoursSettingsPage() {
  const t = useTranslations("serviceDesk");

  return (
    <SettingsPage
      title={t("workingHours.title")}
      description={t("workingHours.description")}
    >
      <div className="space-y-6">
        <ReadOnlyNotice />
        <WorkingHoursSections />
      </div>
    </SettingsPage>
  );
}
