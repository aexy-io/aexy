"use client";

import { useState } from "react";
import {
  KeyRound,
  Plus,
  Loader2,
  Copy,
  CheckCircle2,
  Trash2,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import { useApiTokens, ApiTokenCreated } from "@/hooks/useApiTokens";
import { formatDistanceToNow } from "date-fns";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

const EXPIRY_OPTIONS = [
  { value: 30, label: "30 days" },
  { value: 60, label: "60 days" },
  { value: 90, label: "90 days" },
  { value: 180, label: "180 days" },
  { value: 365, label: "1 year" },
  { value: null, label: "No expiry" },
];

export default function ApiTokensPage() {
  const { tokens, isLoading, createToken, isCreating, deleteToken } =
    useApiTokens();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<number | null>(90);
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<ApiTokenCreated | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      const result = await createToken({
        name: name.trim(),
        expires_in_days: expiresInDays,
      });
      setNewlyCreatedToken(result);
      setName("");
      setShowCreate(false);
    } catch {
      // error handled by hook
    }
  };

  const handleDelete = async (tokenId: string) => {
    setDeletingId(tokenId);
    try {
      await deleteToken(tokenId);
    } catch {
      // error handled by hook
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <KeyRound className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">API Tokens</h1>
            <p className="text-sm text-muted-foreground">
              Create and manage tokens for MCP servers and external integrations
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Token
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-accent/50 border border-border rounded-lg p-4 space-y-4">
          <h3 className="text-sm font-medium">New API Token</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Token name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='e.g. "Claude Code local"'
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Expiry
              </label>
              <select
                value={expiresInDays ?? ""}
                onChange={(e) =>
                  setExpiresInDays(
                    e.target.value === "" ? null : Number(e.target.value)
                  )
                }
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              >
                {EXPIRY_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value ?? ""}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreate}
              disabled={!name.trim() || isCreating}
              className="inline-flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isCreating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Newly created token banner */}
      {newlyCreatedToken && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-medium">
              Token &ldquo;{newlyCreatedToken.name}&rdquo; created
            </span>
          </div>
          <div className="flex items-center gap-2 bg-zinc-900 border border-border rounded-lg px-3 py-2">
            <code className="text-sm text-emerald-300 font-mono flex-1 select-all break-all">
              {newlyCreatedToken.token}
            </code>
            <CopyButton text={newlyCreatedToken.token} />
          </div>
          <div className="flex items-center gap-2 text-xs text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>
              Copy this token now. It won&apos;t be shown again.
            </span>
          </div>
          <button
            onClick={() => setNewlyCreatedToken(null)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Token list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : tokens.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-accent flex items-center justify-center">
            <ShieldAlert className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No API tokens yet</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Create a token to connect AI clients like Claude Code or OpenAI
            Codex to your Aexy workspace via MCP.
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_140px_140px_100px_80px] gap-4 px-4 py-2 text-xs text-muted-foreground font-medium">
            <div>Name</div>
            <div>Created</div>
            <div>Last used</div>
            <div>Status</div>
            <div></div>
          </div>
          {tokens.map((token) => (
            <div
              key={token.id}
              className="grid grid-cols-[1fr_140px_140px_100px_80px] gap-4 px-4 py-3 items-center text-sm hover:bg-accent/30 transition-colors"
            >
              <div>
                <div className="font-medium">{token.name}</div>
                <code className="text-xs text-muted-foreground font-mono">
                  {token.token_prefix}...
                </code>
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(token.created_at), {
                  addSuffix: true,
                })}
              </div>
              <div className="text-xs text-muted-foreground">
                {token.last_used_at
                  ? formatDistanceToNow(new Date(token.last_used_at), {
                      addSuffix: true,
                    })
                  : "Never"}
              </div>
              <div>
                {token.is_active ? (
                  token.expires_at &&
                  new Date(token.expires_at) < new Date() ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-amber-400 bg-amber-400/10">
                      Expired
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-emerald-400 bg-emerald-400/10">
                      Active
                    </span>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-zinc-400 bg-zinc-400/10">
                    Revoked
                  </span>
                )}
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => handleDelete(token.id)}
                  disabled={deletingId === token.id}
                  className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                  title="Delete token"
                >
                  {deletingId === token.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      {tokens.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Tokens authenticate MCP servers and external integrations with your
          account. Revoke any token you no longer use.
        </p>
      )}
    </div>
  );
}
