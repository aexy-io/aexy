"use client";

import { useState } from "react";
import { Loader2, Ban, Plug, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import { useMcpConnectors } from "@/hooks/useMcpConnectors";
import {
  SettingsPage,
  SettingsSection,
  SettingsSkeleton,
  SettingsEmptyState,
} from "@/components/settings/SettingsPrimitives";

export default function ConnectorsPage() {
  const t = useTranslations("connectors");
  const tc = useTranslations("common");
  const { connectors, isLoading, revokeConnector } = useMcpConnectors();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const handleRevoke = async (grantId: string) => {
    setConfirmId(null);
    setPendingId(grantId);
    try {
      await revokeConnector(grantId);
    } catch {
      // error surfaced by the hook
    } finally {
      setPendingId(null);
    }
  };

  return (
    <SettingsPage title={t("title")} description={t("subtitle")} width="wide">
      {isLoading ? (
        <SettingsSkeleton rows={1} />
      ) : connectors.length === 0 ? (
        <SettingsSection flush>
          <SettingsEmptyState
            icon={<Plug className="h-8 w-8" />}
            title={t("empty.title")}
            description={t("empty.description")}
          />
          <div className="px-5 pb-5">
            <Link
              href="/mcp"
              className="inline-flex items-center gap-1.5 text-sm text-purple-400 hover:underline"
            >
              {t("empty.link")}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </SettingsSection>
      ) : (
        <SettingsSection flush footer={t("footer")}>
          {/* Six columns do not fit the settings panel at every width, and a
              crushed 1fr renders the client name as an empty cell — the one
              column you cannot lose on a revocation screen. Scroll instead. */}
          <div className="overflow-x-auto">
            {/* 900, not 720: the fixed columns and gaps eat 620px, so a lower
                floor leaves the name column too narrow to read once scrolling
                starts. */}
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[1fr_140px_120px_120px_90px_72px] gap-4 border-b border-border px-5 py-2 text-xs font-medium text-muted-foreground">
                <div>{t("table.client")}</div>
                <div>{t("table.workspace")}</div>
                <div>{t("table.authorized")}</div>
                <div>{t("table.lastUsed")}</div>
                <div>{t("table.status")}</div>
                <div></div>
              </div>
              {connectors.map((connector) => (
                <div
                  key={connector.grant_id}
                  className="grid grid-cols-[1fr_140px_120px_120px_90px_72px] items-center gap-4 border-b border-border px-5 py-3 text-sm transition-colors last:border-b-0 hover:bg-accent/30"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {connector.client_uri ? (
                        <a
                          href={connector.client_uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {connector.client_name}
                        </a>
                      ) : (
                        connector.client_name
                      )}
                    </div>
                    <code className="text-xs text-muted-foreground font-mono">
                      {connector.scope}
                    </code>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {connector.workspace_name ?? connector.workspace_id}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(connector.authorized_at), {
                      addSuffix: true,
                    })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {connector.last_used_at
                      ? formatDistanceToNow(new Date(connector.last_used_at), {
                          addSuffix: true,
                        })
                      : t("table.never")}
                  </div>
                  <div>
                    {connector.is_active ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-emerald-400 bg-emerald-400/10">
                        {t("status.active")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-zinc-400 bg-zinc-400/10">
                        {t("status.revoked")}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-end">
                    {connector.is_active &&
                      (confirmId === connector.grant_id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleRevoke(connector.grant_id)}
                            disabled={pendingId === connector.grant_id}
                            className="px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-400/10 rounded transition-colors"
                          >
                            {pendingId === connector.grant_id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              t("actions.revoke")
                            )}
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded transition-colors"
                          >
                            {tc("cancel")}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmId(connector.grant_id)}
                          className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                          title={t("actions.revokeTitle")}
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SettingsSection>
      )}
    </SettingsPage>
  );
}
