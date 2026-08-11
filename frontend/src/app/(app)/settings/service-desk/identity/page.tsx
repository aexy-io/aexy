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
      breadcrumbs={[
        { label: "Settings", href: "/settings" },
        { label: t("tabs.settings") },
        { label: t("deskIdentity.title") },
      ]}
    >
      <div className="space-y-6">
        <ReadOnlyNotice />
        <IdentitySections />
      </div>
    </SettingsPage>
  );
}
