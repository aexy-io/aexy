"use client";

/**
 * What a connected Gmail account keeps out of Aexy.
 *
 * Sits under Gmail Sync rather than in its own settings page on purpose: the
 * moment somebody is deciding to sync their mailbox is the moment they need to
 * know they can keep parts of it out.
 */

import { useState } from "react";
import { Ban, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { useGmailExclusions } from "@/hooks/useGoogleIntegration";
import { getApiErrorMessage } from "@/lib/utils";

export function GmailExclusions({
  workspaceId,
  connectedEmail,
}: {
  workspaceId: string | null;
  connectedEmail?: string | null;
}) {
  const { rules, isLoading, isManageable, addRule, removeRule } =
    useGmailExclusions(workspaceId);
  const [kind, setKind] = useState<"address" | "domain">("domain");
  const [value, setValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  if (!isManageable) {
    // Either nobody has connected an account, or somebody else did and these
    // are their exclusions to manage. Neither is an error worth showing.
    return null;
  }

  const submit = async () => {
    if (!value.trim() || isSaving) return;
    setIsSaving(true);
    try {
      const created = await addRule(kind, value.trim());
      setValue("");
      if (created && created.purged > 0) {
        // A rule applies backwards as well as forwards. Somebody excluding a
        // domain they have corresponded with for a year should see that a
        // year of mail has just gone, rather than discover it later.
        toast.success(
          `Excluded ${created.rule.value} — ${created.purged} already-synced ${
            created.purged === 1 ? "email" : "emails"
          } removed`
        );
      } else if (created) {
        toast.success(`Excluded ${created.rule.value}`);
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not add that exclusion"));
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (ruleId: string, ruleValue: string) => {
    setRemovingId(ruleId);
    try {
      await removeRule(ruleId);
      // Said explicitly, because the obvious expectation is the opposite one.
      toast.success(
        `${ruleValue} will sync again. Email removed earlier stays removed.`
      );
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not remove that exclusion"));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="ml-14 pl-4 border-l-2 border-border space-y-3" data-testid="gmail-exclusions">
      <div>
        <h4 className="font-medium text-foreground text-sm flex items-center gap-2">
          <Ban className="w-3.5 h-3.5" />
          Never sync
        </h4>
        <p className="text-xs text-muted-foreground mt-1">
          Mail to or from these addresses stays out of Aexy entirely — it is
          never stored, and adding one removes anything already synced.
          {connectedEmail ? ` Applies to ${connectedEmail}.` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "address" | "domain")}
          aria-label="Exclusion type"
          data-testid="exclusion-kind"
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="domain">Domain</option>
          <option value="address">Address</option>
        </select>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder={kind === "domain" ? "acme.com" : "bob@acme.com"}
          aria-label="Address or domain to exclude"
          data-testid="exclusion-value"
          className="min-w-[200px] flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
        <button
          onClick={submit}
          disabled={!value.trim() || isSaving}
          data-testid="exclusion-add"
          className="flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Add
        </button>
      </div>

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : rules.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing excluded yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2" data-testid="exclusion-list">
          {rules.map((rule) => (
            <li
              key={rule.id}
              data-testid={`exclusion-${rule.value}`}
              className="flex items-center gap-2 rounded-full border border-border bg-muted/40 py-1 pl-3 pr-1.5 text-xs"
            >
              <span className="text-muted-foreground">
                {rule.kind === "domain" ? "@" : ""}
              </span>
              <span className="text-foreground">{rule.value}</span>
              <button
                onClick={() => remove(rule.id, rule.value)}
                disabled={removingId === rule.id}
                aria-label={`Stop excluding ${rule.value}`}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {removingId === rule.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/*
        The disclosure, before the choice rather than after it. Exclusions are
        visible to workspace admins and standing rules notify a department head,
        which someone hiding a correspondent would otherwise reasonably assume
        was private. Saying so here is what keeps "don't connect this mailbox"
        an option they can still take.
      */}
      <p className="text-xs text-amber-600 dark:text-amber-500" data-testid="exclusion-disclosure">
        Exclusions are visible to workspace admins, and your department head is
        notified when you add one.
      </p>
    </div>
  );
}

/**
 * The follow-up after hiding a single email.
 *
 * Offered as a prompt rather than a setting because this is the moment somebody
 * knows they want it — having just hidden something they did not want synced —
 * and the moment they are most likely to assume the hide was private, so the
 * disclosure is repeated here.
 */
export function HideFollowUpPrompt({
  address,
  domain,
  onExclude,
  onDismiss,
}: {
  address: string | null;
  domain: string | null;
  onExclude: (kind: "address" | "domain", value: string) => Promise<void>;
  onDismiss: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  if (!address && !domain) return null;

  const choose = async (kind: "address" | "domain", value: string) => {
    setBusy(value);
    try {
      await onExclude(kind, value);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      data-testid="hide-followup"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm"
    >
      <span className="text-foreground">Hidden. Also stop syncing</span>
      {address && (
        <button
          onClick={() => choose("address", address)}
          disabled={busy !== null}
          data-testid="followup-address"
          className="rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-50"
        >
          {busy === address ? "…" : address}
        </button>
      )}
      {domain && (
        <button
          onClick={() => choose("domain", domain)}
          disabled={busy !== null}
          data-testid="followup-domain"
          className="rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-50"
        >
          {busy === domain ? "…" : `everyone at ${domain}`}
        </button>
      )}
      <span className="text-muted-foreground">in future?</span>
      <button
        onClick={onDismiss}
        data-testid="followup-dismiss"
        className="ml-auto rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent"
      >
        No thanks
      </button>
      <p className="w-full text-xs text-amber-600 dark:text-amber-500">
        A rule is visible to workspace admins and notifies your department head.
        Hiding this one email is not.
      </p>
    </div>
  );
}
