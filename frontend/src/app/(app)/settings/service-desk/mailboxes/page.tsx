"use client";

import { useTranslations } from "next-intl";

import { SettingsPage } from "@/components/settings/SettingsPrimitives";
import {
  MailboxesSection,
  ReadOnlyNotice,
} from "@/components/settings/service-desk/sections";

export default function ServiceDeskMailboxesSettingsPage() {
  const t = useTranslations("serviceDesk");

  return (
    <SettingsPage
      title={t("settings.mailboxes")}
      description={t("settings.mailboxesHint")}
    >
      <div className="space-y-6">
        <ReadOnlyNotice />
        <MailboxesSection />
      </div>
    </SettingsPage>
  );
}
