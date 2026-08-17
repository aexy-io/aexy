"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  FileCode2,
  GitBranch,
  AlertCircle,
  CheckCircle2,
  UserRound,
  RefreshCw,
  BellOff,
  Upload,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  DocumentCodeLink,
  DocumentSyncMode,
  GitHubSyncConfig,
  documentApi,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/utils";

interface Props {
  workspaceId: string;
  documentId: string;
  codeLinks: DocumentCodeLink[];
  /** Workspace members, for the transfer picker. Optional: without it the
   *  strip still shows state, it just cannot hand ownership on. */
  members?: { id: string; name?: string | null }[];
  /** Ask for an update now rather than waiting for the tier's schedule. */
  onSync?: () => void;
  isSyncing?: boolean;
  /** Where this document publishes itself, if it does. Rendered beside the
   *  source it was written from, because both are the same question — how is
   *  this page connected to the repository — and answering it in two separate
   *  panels is how one of them ends up unmounted and forgotten. */
  publishesTo?: GitHubSyncConfig[];
}

/**
 * "This page describes that code, and it is either current or it is not."
 *
 * A generated document looked identical to a hand-written one: same title,
 * same body, no indication it had a source at all. So the two facts that
 * decide whether you can trust what you are reading — where it came from,
 * and whether the code has moved since — were invisible unless you went
 * looking in a panel that was not mounted.
 *
 * Renders nothing when the document has no code links, because then there is
 * genuinely nothing to be out of date with.
 */
export function DocumentProvenance({
  workspaceId,
  documentId,
  codeLinks,
  members,
  onSync,
  isSyncing,
  publishesTo,
}: Props) {
  const t = useTranslations("docs.provenance");
  const queryClient = useQueryClient();
  const [transferringId, setTransferringId] = useState<string | null>(null);

  const behind = useMemo(
    () =>
      codeLinks.filter(
        (link) => link.has_pending_changes && link.sync_mode !== "off"
      ).length,
    [codeLinks]
  );

  const setMode = useMutation({
    mutationFn: ({
      linkId,
      syncMode,
    }: {
      linkId: string;
      syncMode: DocumentSyncMode;
    }) =>
      documentApi.setCodeLinkSyncMode(
        workspaceId,
        documentId,
        linkId,
        syncMode
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["document", documentId, "code-links"],
      });
      toast.success(t("syncModeSaved"));
    },
    onError: (error) =>
      toast.error(getApiErrorMessage(error, t("syncModeFailed"))),
  });

  const transfer = useMutation({
    mutationFn: ({ linkId, ownerId }: { linkId: string; ownerId: string }) =>
      documentApi.transferCodeLinkOwner(
        workspaceId,
        documentId,
        linkId,
        ownerId
      ),
    onSuccess: () => {
      setTransferringId(null);
      queryClient.invalidateQueries({
        queryKey: ["document", documentId, "code-links"],
      });
      toast.success(t("transferred"));
    },
    onError: (error) =>
      toast.error(getApiErrorMessage(error, t("transferFailed"))),
  });

  if (!codeLinks.length && !publishesTo?.length) return null;

  return (
    <div
      data-testid="document-provenance"
      className="rounded-lg border border-border bg-muted/20 px-3 py-2 space-y-1.5"
    >
      {codeLinks.map((link) => {
        const stale = link.has_pending_changes;
        return (
          <div
            key={link.id}
            data-testid={`provenance-${link.id}`}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
          >
            <FileCode2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-mono text-foreground">
              {link.repository_name ? `${link.repository_name}/` : ""}
              {link.path}
            </span>

            <span className="flex items-center gap-1 text-muted-foreground">
              <GitBranch className="h-3 w-3" />
              {link.branch}
            </span>

            {link.sync_mode === "off" ? (
              <span
                data-testid={`provenance-muted-${link.id}`}
                className="flex items-center gap-1 text-muted-foreground"
              >
                <BellOff className="h-3 w-3" />
                {t("muted")}
              </span>
            ) : stale ? (
              <span
                data-testid={`provenance-behind-${link.id}`}
                className="flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-warning"
              >
                <AlertCircle className="h-3 w-3" />
                {t("behind")}
              </span>
            ) : (
              <span
                data-testid={`provenance-current-${link.id}`}
                className="flex items-center gap-1 text-muted-foreground"
              >
                <CheckCircle2 className="h-3 w-3 text-success" />
                {link.last_synced_at
                  ? t("inSync", {
                      date: new Date(link.last_synced_at).toLocaleDateString(),
                    })
                  : t("neverGenerated")}
              </span>
            )}

            {/* Ownership is not decoration: it decides whose plan tier drives
                this sync and whose GitHub access it falls back on. An orphaned
                one is worth showing rather than hiding. */}
            <span className="flex items-center gap-1 text-muted-foreground ml-auto">
              <UserRound className="h-3 w-3" />
              {link.owner_developer_id ? (
                members?.find((m) => m.id === link.owner_developer_id)?.name ??
                t("owned")
              ) : (
                <span className="text-warning">{t("unowned")}</span>
              )}
            </span>

            {/* The off switch is the point, not an afterthought: a queue that
                fills faster than anyone drains it is one people stop opening,
                and that costs more than the setting. */}
            <select
              data-testid={`provenance-sync-mode-${link.id}`}
              aria-label={t("syncModeLabel")}
              value={link.sync_mode}
              disabled={setMode.isPending}
              title={
                link.sync_mode === "auto"
                  ? t("syncModeAutoHint")
                  : link.sync_mode === "off"
                    ? t("syncModeOffHint")
                    : t("syncModeProposeHint")
              }
              onChange={(event) =>
                setMode.mutate({
                  linkId: link.id,
                  syncMode: event.target.value as DocumentSyncMode,
                })
              }
              className="rounded border border-border bg-background px-1 py-0.5 text-xs text-muted-foreground"
            >
              <option value="propose">{t("syncModePropose")}</option>
              <option value="auto">{t("syncModeAuto")}</option>
              <option value="off">{t("syncModeOff")}</option>
            </select>

            {members?.length ? (
              transferringId === link.id ? (
                <select
                  autoFocus
                  data-testid={`provenance-transfer-${link.id}`}
                  className="rounded border border-border bg-background px-1 py-0.5 text-xs"
                  defaultValue=""
                  disabled={transfer.isPending}
                  onChange={(event) => {
                    if (event.target.value) {
                      transfer.mutate({
                        linkId: link.id,
                        ownerId: event.target.value,
                      });
                    }
                  }}
                  onBlur={() => setTransferringId(null)}
                >
                  <option value="" disabled>
                    {t("handTo")}
                  </option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name ?? member.id}
                    </option>
                  ))}
                </select>
              ) : (
                <button
                  type="button"
                  onClick={() => setTransferringId(link.id)}
                  className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  {t("transfer")}
                </button>
              )
            ) : null}
          </div>
        );
      })}

      {/* The other direction. A document can describe a path and publish
          itself to one, and the export is what an author needs to see when a
          page they edited has not reached the repository yet. */}
      {publishesTo?.map((sync) => (
        <div
          key={sync.id}
          data-testid={`provenance-publishes-${sync.id}`}
          className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/50 pt-1.5 text-xs"
        >
          <Upload className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">{t("publishesTo")}</span>
          <span className="font-mono text-foreground">
            {sync.repository_name ? `${sync.repository_name}/` : ""}
            {sync.file_path}
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <GitBranch className="h-3 w-3" />
            {sync.branch}
          </span>
          <span className="ml-auto text-muted-foreground">
            {sync.last_exported_at
              ? t("lastPublished", {
                  date: new Date(sync.last_exported_at).toLocaleDateString(),
                })
              : t("neverPublished")}
          </span>
          {sync.auto_export && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {t("autoPublish")}
            </span>
          )}
        </div>
      ))}

      {behind > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <p className="text-[11px] text-muted-foreground">
            {behind === 1
              ? t("behindOne")
              : t("behindMany", { count: behind })}{" "}
            {t("willPropose")}
          </p>
          {onSync && (
            <button
              type="button"
              data-testid="provenance-sync-now"
              disabled={isSyncing}
              onClick={onSync}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] font-medium text-foreground transition hover:bg-accent disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`}
              />
              {isSyncing ? t("updating") : t("updateNow")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
