"use client";

import { useTranslations } from "next-intl";

import { SettingsPage } from "@/components/settings/SettingsPrimitives";
import {
  MasterDataSections,
  ReadOnlyNotice,
} from "@/components/settings/service-desk/sections";

export default function ServiceDeskMasterDataSettingsPage() {
  const t = useTranslations("serviceDesk");

  return (
    <SettingsPage
      title={t("tabs.settings")}
      // Not t("subtitle") — that describes the Service Desk app as a whole
      // ("email-intake ticketing with stakeholder turnaround tracking"), which
      // told a reader of this page nothing about what the three tables do.
      description={t("settings.masterDataHint")}
      width="wide"
    >
      <div className="space-y-6">
        <ReadOnlyNotice />
        <MasterDataSections />
      </div>
    </SettingsPage>
  );
}
