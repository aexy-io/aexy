"use client";

import { useState } from "react";
import {
  Plus,
  Loader2,
  CheckCircle2,
  Trash2,
  Ban,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useApiTokens, ApiTokenCreated } from "@/hooks/useApiTokens";
import { CopyButton } from "@/components/ui/copy-button";
import { formatDistanceToNow } from "date-fns";
import {
  SettingsPage,
  SettingsSection,
  SettingsSkeleton,
  SettingsEmptyState,
} from "@/components/settings/SettingsPrimitives";

// Expiry values in days; null means no expiry. Labels are resolved via i18n.
const EXPIRY_VALUES: (number | null)[] = [30, 60, 90, 180, 365, null];

export default function ApiTokensPage() {
  const t = useTranslations("apiTokens");
  const tc = useTranslations("common");
  const {
    tokens,
    isLoading,
    createToken,
    isCreating,
    revokeToken,
    deleteToken,
  } = useApiTokens();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<number | null>(90);
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<ApiTokenCreated | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const expiryLabel = (value: number | null) => {
    if (value === null) return t("expiry.none");
    if (value === 365) return t("expiry.year1");
    return t("expiry.days", { count: value });
  };

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

  // Active tokens are revoked (soft-disabled, kept for audit); already-revoked
  // tokens can then be permanently deleted.
  const handleAction = async (tokenId: string, isActive: boolean) => {
    setConfirmId(null);
    setPendingId(tokenId);
    try {
      if (isActive) {
        await revokeToken(tokenId);
      } else {
        await deleteToken(tokenId);
      }
    } catch {
      // error handled by hook
    } finally {
      setPendingId(null);
    }
  };

  return (
    <SettingsPage
      title={t("title")}
      description={t("subtitle")}
      width="wide"
      actions={
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("createButton")}
        </button>
      }
    >
      {/* Create form */}
      {showCreate && (
        <SettingsSection title={t("form.heading")}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                {t("form.nameLabel")}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("form.namePlaceholder")}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                {t("form.expiryLabel")}
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
                {EXPIRY_VALUES.map((value) => (
                  <option key={value ?? "none"} value={value ?? ""}>
                    {expiryLabel(value)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={handleCreate}
              disabled={!name.trim() || isCreating}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isCreating && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {t("form.submit")}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {tc("cancel")}
            </button>
          </div>
        </SettingsSection>
      )}

      {/* Newly created token banner */}
      {newlyCreatedToken && (
        <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-medium">
              {t("created.banner", { name: newlyCreatedToken.name })}
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
            <span>{t("created.warning")}</span>
          </div>
          <button
            onClick={() => setNewlyCreatedToken(null)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("created.dismiss")}
          </button>
        </div>
      )}

      {/* Token list */}
      {isLoading ? (
        <SettingsSkeleton rows={1} />
      ) : tokens.length === 0 ? (
        <SettingsSection flush>
          <SettingsEmptyState
            icon={<ShieldAlert className="h-8 w-8" />}
            title={t("empty.title")}
            description={t("empty.description")}
          />
        </SettingsSection>
      ) : (
        <SettingsSection flush footer={t("footer")}>
          {/* Table header */}
          <div className="grid grid-cols-[1fr_140px_140px_100px_80px] gap-4 border-b border-border px-5 py-2 text-xs font-medium text-muted-foreground">
            <div>{t("table.name")}</div>
            <div>{t("table.created")}</div>
            <div>{t("table.lastUsed")}</div>
            <div>{t("table.status")}</div>
            <div></div>
          </div>
          {tokens.map((token) => (
            <div
              key={token.id}
              className="grid grid-cols-[1fr_140px_140px_100px_80px] items-center gap-4 border-b border-border px-5 py-3 text-sm transition-colors last:border-b-0 hover:bg-accent/30"
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
                  : t("table.never")}
              </div>
              <div>
                {token.is_active ? (
                  token.expires_at &&
                  new Date(token.expires_at) < new Date() ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-amber-400 bg-amber-400/10">
                      {t("status.expired")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-emerald-400 bg-emerald-400/10">
                      {t("status.active")}
                    </span>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-zinc-400 bg-zinc-400/10">
                    {t("status.revoked")}
                  </span>
                )}
              </div>
              <div className="flex justify-end">
                {confirmId === token.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleAction(token.id, token.is_active)}
                      disabled={pendingId === token.id}
                      className="px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-400/10 rounded transition-colors"
                    >
                      {pendingId === token.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : token.is_active ? (
                        t("actions.revoke")
                      ) : (
                        t("actions.delete")
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
                    onClick={() => setConfirmId(token.id)}
                    className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                    title={
                      token.is_active
                        ? t("actions.revokeTitle")
                        : t("actions.deleteTitle")
                    }
                  >
                    {token.is_active ? (
                      <Ban className="h-4 w-4" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </SettingsSection>
      )}
    </SettingsPage>
  );
}
