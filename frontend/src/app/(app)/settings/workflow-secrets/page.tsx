"use client";

/**
 * Workflow secrets.
 *
 * The point of this page is what it cannot do: there is no "reveal" button,
 * because there is no endpoint behind one. A credential readable through the
 * API is readable by everyone who can reach the API, which is exactly why
 * pasting one into a webhook header was a problem — header templates live in
 * the workflow definition, and reading a workflow needs only `member`.
 *
 * So this lists names, takes values in, and hands back the `{{secrets.NAME}}`
 * reference to paste into a step. Rotation is an overwrite of the same name.
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { CopyButton } from "@/components/ui/copy-button";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useWorkspaceSecrets } from "@/hooks/useWorkspaceSecrets";

/**
 * Same character set the backend accepts, and the same one
 * `{{secrets.NAME}}` can address — a name that stores but cannot be
 * referenced would be a trap.
 */
const VALID_NAME = /^[A-Za-z0-9_-]{1,120}$/;

export default function WorkflowSecretsPage() {
  const { currentWorkspaceId } = useWorkspace();
  const {
    secrets,
    isLoading,
    error,
    upsertSecret,
    deleteSecret,
    isSaving,
    isDeleting,
  } = useWorkspaceSecrets(currentWorkspaceId);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  // Set when the form was opened to rotate a specific secret rather than
  // create one, so the name is fixed and the copy says so.
  const [rotating, setRotating] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const trimmedName = name.trim();
  const nameError = useMemo(() => {
    if (!trimmedName) return null;
    if (!VALID_NAME.test(trimmedName)) {
      return "Letters, numbers, underscore and hyphen only — it has to be usable as {{secrets.NAME}}.";
    }
    if (!rotating && secrets.some((s) => s.name === trimmedName)) {
      return "A secret with this name exists. Saving will replace its value.";
    }
    return null;
  }, [trimmedName, rotating, secrets]);

  // A name clash is a warning, not a blocker: replacing the value is how
  // rotation works.
  const blocked =
    !trimmedName ||
    !value ||
    (nameError !== null && !nameError.startsWith("A secret with this name"));

  const resetForm = () => {
    setName("");
    setValue("");
    setDescription("");
    setRotating(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (blocked) return;
    try {
      await upsertSecret({
        name: trimmedName,
        value,
        description: description.trim() || undefined,
      });
      resetForm();
    } catch {
      // surfaced by the hook
    }
  };

  const startRotate = (secretName: string) => {
    setRotating(secretName);
    setName(secretName);
    setValue("");
    setDescription("");
    setShowForm(true);
  };

  const handleDelete = async (secretName: string) => {
    setConfirmDelete(null);
    try {
      await deleteSecret(secretName);
    } catch {
      // surfaced by the hook
    }
  };

  // Listing needs admin, so a 403 here is a role problem rather than a fault.
  const forbidden =
    error !== null &&
    typeof error === "object" &&
    "response" in error &&
    (error as { response?: { status?: number } }).response?.status === 403;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Lock className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Workflow Secrets</h1>
            <p className="text-sm text-muted-foreground">
              Credentials for automation steps, referenced as{" "}
              <code className="font-mono text-xs">{"{{secrets.NAME}}"}</code>{" "}
              instead of pasted in.
            </p>
          </div>
        </div>
        {!forbidden && (
          <button
            onClick={() => (showForm ? resetForm() : setShowForm(true))}
            className="inline-flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add secret
          </button>
        )}
      </div>

      {/* The thing this page deliberately cannot do */}
      <div className="flex gap-3 rounded-lg border border-border bg-accent/30 p-4">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Values cannot be read back — not here, not through the API, not by the
          person who saved them. Only a running step ever decrypts one. If you
          lose a credential, replace it rather than looking it up.
        </p>
      </div>

      {forbidden ? (
        <div className="text-center py-16 space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-accent flex items-center justify-center">
            <ShieldAlert className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Admins only</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Managing workspace secrets needs an admin role. Steps you build can
            still reference a secret an admin has already added.
          </p>
        </div>
      ) : (
        <>
          {/* Create / rotate form */}
          {showForm && (
            <div className="bg-accent/50 border border-border rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-medium">
                {rotating ? `Replace the value of ${rotating}` : "New secret"}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    disabled={!!rotating}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="STRIPE_API_KEY"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    Value
                  </label>
                  <input
                    type="password"
                    value={value}
                    autoComplete="off"
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Paste the credential"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  What it is for{" "}
                  <span className="text-muted-foreground/60">(optional)</span>
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Stripe live key, used by the billing webhook"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
              </div>

              {nameError && (
                <p className="flex items-start gap-2 text-xs text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  {nameError}
                </p>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={blocked || isSaving}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {rotating ? "Replace value" : "Save secret"}
                </button>
                <button
                  onClick={resetForm}
                  className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : secrets.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <div className="mx-auto h-12 w-12 rounded-full bg-accent flex items-center justify-center">
                <KeyRound className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No secrets yet</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Add one here, then reference it from a webhook header as{" "}
                <code className="font-mono">{"{{secrets.NAME}}"}</code>. The
                workflow stores the reference; the value stays here.
              </p>
            </div>
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border">
              <div className="grid grid-cols-[1fr_150px_140px_110px] gap-4 px-4 py-2 text-xs text-muted-foreground font-medium">
                <div>Name</div>
                <div>Reference</div>
                <div>Last used</div>
                <div />
              </div>

              {secrets.map((secret) => {
                const reference = `{{secrets.${secret.name}}}`;
                return (
                  <div
                    key={secret.name}
                    data-testid={`secret-row-${secret.name}`}
                    className="grid grid-cols-[1fr_150px_140px_110px] gap-4 px-4 py-3 items-center text-sm hover:bg-accent/30 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-mono font-medium truncate">
                        {secret.name}
                      </div>
                      {secret.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {secret.description}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 min-w-0">
                      <code className="text-xs text-muted-foreground font-mono truncate">
                        {reference}
                      </code>
                      <CopyButton text={reference} />
                    </div>

                    <div className="text-xs text-muted-foreground">
                      {secret.last_used_at ? (
                        formatDistanceToNow(new Date(secret.last_used_at), {
                          addSuffix: true,
                        })
                      ) : (
                        <span title="No step has resolved this yet">
                          Never
                        </span>
                      )}
                    </div>

                    <div className="flex justify-end items-center gap-1">
                      {confirmDelete === secret.name ? (
                        <>
                          <button
                            onClick={() => handleDelete(secret.name)}
                            disabled={isDeleting}
                            className="px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-400/10 rounded transition-colors"
                            title="Any step still referencing this will fail on its next run"
                          >
                            {isDeleting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              "Delete"
                            )}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded transition-colors"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startRotate(secret.name)}
                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
                            title="Replace the value"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(secret.name)}
                            className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                            title="Delete this secret"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {confirmDelete && (
            <p className="flex items-start gap-2 text-xs text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Deleting <code className="font-mono">{confirmDelete}</code> will
              not edit any workflow. Steps still referencing it fail on their
              next run, with the missing name in the error.
            </p>
          )}
        </>
      )}
    </div>
  );
}
