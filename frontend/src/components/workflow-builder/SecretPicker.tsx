"use client";

/**
 * Insert a `{{secrets.NAME}}` reference into a config field.
 *
 * The alternative this replaces is an author pasting the credential itself
 * into a webhook header — which then lives in the workflow definition, and
 * reading a workflow needs only `member`. Validation refuses that now, so the
 * builder has to offer the thing it wants instead of only refusing the thing
 * it does not.
 *
 * Names only. There is no endpoint that returns a value, so there is nothing
 * for this component to leak.
 */

import { useState } from "react";
import { ChevronDown, Lock, Plus } from "lucide-react";
import Link from "next/link";

import { useWorkspaceSecrets } from "@/hooks/useWorkspaceSecrets";

export function SecretPicker({
  workspaceId,
  onInsert,
  className = "",
  // A panel can show more than one of these — api_request has both an auth
  // field and headers — so each needs to be addressable on its own.
  testId = "secret-picker",
}: {
  workspaceId: string;
  onInsert: (reference: string) => void;
  className?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  // Listing needs admin. A member editing a workflow gets a 403 and simply
  // sees no picker — they can still type a reference an admin has told them.
  const { secrets, isLoading, error } = useWorkspaceSecrets(
    open ? workspaceId : null,
  );

  const insert = (name: string) => {
    onInsert(`{{secrets.${name}}}`);
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`} data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
        title="Insert a stored credential by reference"
      >
        <Lock className="h-3.5 w-3.5" />
        Insert secret
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <>
          {/* Click-away */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 z-50 mt-1 w-72 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
            <div className="max-h-56 overflow-y-auto">
              {isLoading ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">
                  Loading…
                </p>
              ) : error ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">
                  Only an admin can list workspace secrets. Type the reference
                  directly if you know the name.
                </p>
              ) : secrets.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">
                  No secrets in this workspace yet.
                </p>
              ) : (
                secrets.map((secret) => (
                  <button
                    key={secret.name}
                    type="button"
                    onClick={() => insert(secret.name)}
                    className="w-full text-left px-3 py-2 hover:bg-accent transition-colors"
                  >
                    <div className="text-xs font-mono truncate">
                      {secret.name}
                    </div>
                    {secret.description && (
                      <div className="text-[11px] text-muted-foreground truncate">
                        {secret.description}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>

            <Link
              href="/settings/workflow-secrets"
              target="_blank"
              className="flex items-center gap-1.5 px-3 py-2 border-t border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add a secret
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
