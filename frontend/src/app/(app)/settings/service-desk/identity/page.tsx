"use client";

import { useTranslations } from "next-intl";

import { SettingsPage } from "@/components/settings/SettingsPrimitives";
import {
  IdentitySections,
  ReadOnlyNotice,
} from "@/components/settings/service-desk/sections";

export default function ServiceDeskIdentitySettingsPage() {
  const t = useTranslations("serviceDesk");

  return (
    <SettingsPage
      title={t("deskIdentity.title")}
      description={t("deskIdentity.description")}
    >
      <div className="space-y-6">
        <ReadOnlyNotice />
        <IdentitySections />
      </div>
    </SettingsPage>
  );
}
