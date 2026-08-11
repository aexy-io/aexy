"use client";

/**
 * Connecting your own Google account — the personal half of the integration.
 *
 * The backend has always allowed this. `GET /integrations/google/connect`
 * requires only workspace *membership*, and says why in as many words: what it
 * connects is your own mailbox, and requiring admin meant a new joiner could
 * not put their own inbox on the Service Desk without an admin sitting at
 * Google's sign-in screen as them.
 *
 * The frontend never offered it anywhere a member could reach. Every surface
 * with a connect button sat behind a workspace-admin gate —
 * `/settings/integrations` behind CAN_MANAGE_INTEGRATIONS, the Service Desk
 * pages behind CAN_MANAGE_TICKETS, and the account list itself only inside
 * `/settings/crm/integrations`, which needs the CRM app. A support agent with
 * none of those had exactly one chance to connect Gmail, during onboarding, and
 * no way back afterwards.
 *
 * So this page is ungated, like Appearance, Notifications, Identity, API Tokens
 * and Connected Apps: it manages something that is yours. The asymmetry the API
 * already encodes is preserved — connecting affects only you; removing somebody
 * else's account still requires admin, and the button reports the refusal.
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { googleIntegrationApi } from "@/lib/api";
import { useWorkspace } from "@/hooks/useWorkspace";
import { GoogleAccounts } from "@/components/settings/GoogleAccounts";
import {
  SettingsPage,
  SettingsSection,
  SettingsSkeleton,
} from "@/components/settings/SettingsPrimitives";

export default function ConnectedAccountsPage() {
  const t = useTranslations("connectedAccounts");
  const searchParams = useSearchParams();
  const { currentWorkspaceId, workspacesLoading } = useWorkspace();
  // Bumped after a disconnect so the list re-reads rather than trusting local state.
  const [version, setVersion] = useState(0);

  // Google sends the browser back here with the outcome in the query string.
  useEffect(() => {
    const status = searchParams.get("google");
    if (status === "connected") {
      toast.success(t("toast.connected"));
    } else if (status === "error") {
      toast.error(searchParams.get("message") || t("toast.failed"));
    }
  }, [searchParams, t]);

  const handleConnect = useCallback(async () => {
    if (!currentWorkspaceId) return;
    try {
      // Returning to this exact URL means the result lands on the page the
      // person started from, rather than dropping them somewhere generic.
      const { auth_url } = await googleIntegrationApi.getConnectUrl(
        currentWorkspaceId,
        window.location.href,
      );
      window.location.href = auth_url;
    } catch {
      toast.error(t("toast.failed"));
    }
  }, [currentWorkspaceId, t]);

  return (
    <SettingsPage title={t("title")} description={t("subtitle")} width="wide">
      {workspacesLoading ? (
        <SettingsSkeleton rows={1} />
      ) : (
        <SettingsSection title={t("google.heading")} footer={t("google.footer")}>
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4" aria-hidden />
            {t("google.label")}
          </div>
          <GoogleAccounts
            key={version}
            workspaceId={currentWorkspaceId}
            onConnectAnother={handleConnect}
            onChanged={() => setVersion((v) => v + 1)}
          />
        </SettingsSection>
      )}

      <SettingsSection title={t("what.heading")}>
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
            {t("what.serviceDesk")}
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
            {t("what.crm")}
          </li>
          <li className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
            {t("what.shared")}
          </li>
        </ul>
      </SettingsSection>
    </SettingsPage>
  );
}
