"use client";

/**
 * What people have kept out of Gmail sync, for an admin.
 *
 * The policy half of the exclusions feature. Exclusions are deliberately not
 * private — the organisation wants a record that business correspondence is not
 * being quietly suppressed — and this is where that record is read.
 *
 * Opening this page writes an `exclusions_viewed` entry server-side, which is
 * why the trail below shows reads alongside changes. That symmetry is the
 * point: a list of hidden domains is itself revealing, so looking at one is
 * recorded. The people whose lists appear here are not notified of the read.
 */

import { useEffect, useState } from "react";
import { Ban, EyeOff, Loader2, ScrollText } from "lucide-react";

import { useWorkspace } from "@/hooks/useWorkspace";
import { googleIntegrationApi, WorkspaceExclusions } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/utils";
import { SettingsPage } from "@/components/settings/SettingsPrimitives";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const ACTION_LABELS: Record<string, string> = {
  exclusion_rule_created: "added a rule",
  exclusion_rule_deleted: "removed a rule",
  message_hidden: "hid one email",
  exclusions_viewed: "viewed this page",
};

export default function GmailExclusionsAdminPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;
  const [data, setData] = useState<WorkspaceExclusions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    setIsLoading(true);
    googleIntegrationApi.exclusions
      .forWorkspace(workspaceId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err, "Could not load exclusions"));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return (
    <SettingsPage
      title="Gmail exclusions"
      description="Addresses and domains people have kept out of Gmail sync. Opening this page is recorded."
      width="wide"
    >
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : error ? (
        <p className="text-sm text-destructive" data-testid="exclusions-admin-error">
          {error}
        </p>
      ) : !data ? null : (
        <div className="space-y-4">
          <Card className="space-y-3 p-4" data-testid="admin-rules">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Ban className="h-4 w-4" aria-hidden />
              Standing rules
            </h2>
            {data.rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nobody has excluded an address or domain.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {data.rules.map((rule) => (
                  <li key={rule.id}>
                    <Badge variant="secondary" className="gap-1">
                      {rule.kind === "domain" ? "@" : ""}
                      {rule.value}
                      {rule.match_scope === "sender" && (
                        <span className="text-[10px] opacity-70">sender only</span>
                      )}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="space-y-2 p-4" data-testid="admin-hidden-count">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <EyeOff className="h-4 w-4" aria-hidden />
              Individually hidden
            </h2>
            <p className="text-sm text-muted-foreground">
              {/* A count, not the messages. An admin is entitled to know that mail
                  was hidden, not to read the mail somebody hid. */}
              {data.hidden_message_count}{" "}
              {data.hidden_message_count === 1 ? "email has" : "emails have"} been hidden
              one at a time. Their contents are deleted, not held here.
            </p>
          </Card>

          <Card className="space-y-3 p-4" data-testid="admin-audit">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ScrollText className="h-4 w-4" aria-hidden />
              Trail
            </h2>
            {data.audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.audit.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground"
                  >
                    <span className="text-foreground">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </span>
                    {entry.target && <code className="rounded bg-muted px-1">{entry.target}</code>}
                    <span>{new Date(entry.created_at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </SettingsPage>
  );
}
