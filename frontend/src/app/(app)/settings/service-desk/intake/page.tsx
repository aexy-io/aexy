"use client";

import { useTranslations } from "next-intl";

import { SettingsPage } from "@/components/settings/SettingsPrimitives";
import {
  IntakeSection,
  ReadOnlyNotice,
} from "@/components/settings/service-desk/sections";

export default function ServiceDeskIntakeSettingsPage() {
  const t = useTranslations("serviceDesk");

  return (
    <SettingsPage
      title={t("deskDepartment.title")}
      description={t("deskDepartment.description")}
    >
      <div className="space-y-6">
        <ReadOnlyNotice />
        <IntakeSection />
      </div>
    </SettingsPage>
  );
}
