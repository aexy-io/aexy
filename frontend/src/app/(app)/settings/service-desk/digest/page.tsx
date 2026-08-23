"use client";

import { useTranslations } from "next-intl";

import { SettingsPage } from "@/components/settings/SettingsPrimitives";
import {
  DigestSections,
  ReadOnlyNotice,
} from "@/components/settings/service-desk/sections";

export default function ServiceDeskDigestSettingsPage() {
  const t = useTranslations("serviceDesk");

  return (
    <SettingsPage
      title={t("digest.title")}
      description={t("digest.description")}
    >
      <div className="space-y-6">
        <ReadOnlyNotice />
        <DigestSections />
      </div>
    </SettingsPage>
  );
}
