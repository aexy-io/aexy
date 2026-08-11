"use client";

/**
 * The workspace's connected Google accounts.
 *
 * A workspace used to hold exactly one, and connecting a second overwrote the
 * first — the original owner's mailbox stopped syncing and nobody was told.
 * It now holds one per address, so this has to be a list rather than a single
 * "Connected as …" line, and connecting has to say which address it will add
 * *before* it adds it.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Plus, Trash2, User } from "lucide-react";
import { toast } from "sonner";

import { googleIntegrationApi, GoogleAccountSummary } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/utils";

export function GoogleAccounts({
  workspaceId,
  onConnectAnother,
  onChanged,
}: {
  workspaceId: string | null;
  onConnectAnother: () => void;
  onChanged?: () => void;
}) {
  const [accounts, setAccounts] = useState<GoogleAccountSummary[]>([]);
  const [connectableEmail, setConnectableEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    try {
      const data = await googleIntegrationApi.accounts.list(workspaceId);
      setAccounts(data.accounts);
      setConnectableEmail(data.connectable_email);
    } catch {
      setAccounts([]);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const disconnect = async (account: GoogleAccountSummary) => {
    if (!workspaceId) return;
    if (
      !confirm(
        `Stop syncing ${account.google_email}? Mail already synced from it stays.`
      )
    ) {
      return;
    }
    setRemovingId(account.id);
    try {
      await googleIntegrationApi.accounts.disconnect(workspaceId, account.id);
      toast.success(`${account.google_email} disconnected`);
      await refresh();
      onChanged?.();
    } catch (err) {
      // The 409 for a Service Desk mailbox is the message worth showing —
      // it names the queue that would have gone quiet.
      toast.error(getApiErrorMessage(err, "Could not disconnect that account"));
    } finally {
      setRemovingId(null);
    }
  };

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  const alreadyConnected =
    !!connectableEmail &&
    accounts.some(
      (a) => a.google_email.toLowerCase() === connectableEmail.toLowerCase()
    );

  return (
    <div className="space-y-3" data-testid="google-accounts">
      <ul className="space-y-2">
        {accounts.map((account) => (
          <li
            key={account.id}
            data-testid={`google-account-${account.google_email}`}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background/40 px-3 py-2"
          >
            <User className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-sm text-foreground">{account.google_email}</span>

            {account.is_mine && (
              <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[11px] text-purple-600 dark:text-purple-300">
                yours
              </span>
            )}
            {!account.is_mine && account.connected_by_name && (
              <span className="text-xs text-muted-foreground">
                connected by {account.connected_by_name}
              </span>
            )}
            {account.is_service_desk_mailbox && (
              <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-600 dark:text-cyan-300">
                service desk
              </span>
            )}
            {!account.gmail_sync_enabled && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-muted-foreground">
                Gmail sync off
              </span>
            )}
            {!account.is_active && (
              <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] text-red-600 dark:text-red-400">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                disconnected
              </span>
            )}

            <button
              onClick={() => disconnect(account)}
              disabled={removingId === account.id}
              aria-label={`Disconnect ${account.google_email}`}
              data-testid={`disconnect-${account.google_email}`}
              className="ml-auto rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {removingId === account.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onConnectAnother}
          data-testid="connect-another-google"
          className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1.5 text-sm text-foreground transition hover:bg-accent"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Connect another account
        </button>
        {/* Named before the click. The flow attaches whichever Google account
            is authorised to a shared workspace, and finding out afterwards
            which one that was is the wrong order. */}
        <p className="text-xs text-muted-foreground">
          {connectableEmail && !alreadyConnected
            ? `You can add ${connectableEmail}, or choose a different account when Google asks.`
            : "You'll choose which account on Google's sign-in screen."}
        </p>
      </div>
    </div>
  );
}
