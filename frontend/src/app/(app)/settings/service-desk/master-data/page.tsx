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
      description={t("subtitle")}
      width="wide"
      breadcrumbs={[
        { label: "Settings", href: "/settings" },
        { label: t("tabs.settings") },
      ]}
    >
      <div className="space-y-6">
        <ReadOnlyNotice />
        <MasterDataSections />
      </div>
    </SettingsPage>
  );
}
