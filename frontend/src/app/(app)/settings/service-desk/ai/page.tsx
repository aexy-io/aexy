"use client";

import { useTranslations } from "next-intl";

import { SettingsPage } from "@/components/settings/SettingsPrimitives";
import {
  AiSections,
  ReadOnlyNotice,
} from "@/components/settings/service-desk/sections";

export default function ServiceDeskAiSettingsPage() {
  const t = useTranslations("serviceDesk");

  return (
    <SettingsPage
      title={t("ai.title")}
      description={t("ai.description")}
    >
      <div className="space-y-6">
        <ReadOnlyNotice />
        <AiSections />
      </div>
    </SettingsPage>
  );
}
