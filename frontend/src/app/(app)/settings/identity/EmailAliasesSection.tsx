"use client";

import { useState } from "react";
import { Mail, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  useAddEmailAlias,
  useEmailAliases,
  useEmailAliasPreview,
  useRemoveEmailAlias,
} from "@/hooks/useIdentity";

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function EmailAliasesSection() {
  const t = useTranslations("identity.aliases");
  const { data: aliases, isLoading } = useEmailAliases();
  const addAlias = useAddEmailAlias();
  const removeAlias = useRemoveEmailAlias();

  const [newEmail, setNewEmail] = useState("");
  // Only preview once the email parses; otherwise the API throws 400.
  const canPreview = isLikelyEmail(newEmail);
  const { data: preview } = useEmailAliasPreview(
    canPreview ? newEmail.trim().toLowerCase() : null,
  );

  const handleAdd = () => {
    const email = newEmail.trim().toLowerCase();
    if (!isLikelyEmail(email)) return;
    addAlias.mutate(
      { email },
      {
        onSuccess: () => {
          setNewEmail("");
        },
      },
    );
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-start gap-2">
        <Mail className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {t("title")}
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            {t("description")}
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2">
          <div className="h-8 w-full max-w-md rounded bg-muted animate-pulse" />
          <div className="h-8 w-full max-w-md rounded bg-muted animate-pulse" />
        </div>
      )}

      {!isLoading && aliases && aliases.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {aliases.map((alias) => (
            <li
              key={alias.id}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span className="font-mono text-foreground">{alias.email}</span>
              <button
                type="button"
                onClick={() =>
                  removeAlias.mutate({ aliasId: alias.id })
                }
                disabled={removeAlias.isPending}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
                title={t("removeTitle")}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("remove")}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">
          {t("addLabel")}
        </label>
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="name@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            className="flex-1 max-w-md rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!isLikelyEmail(newEmail) || addAlias.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary hover:bg-primary/90 px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-3.5 w-3.5" />
            {addAlias.isPending ? t("adding") : t("add")}
          </button>
        </div>
        {canPreview && preview && (
          <p className="text-xs text-muted-foreground">
            {preview.commits > 0
              ? t("previewReclaim", { count: preview.commits })
              : t("previewEmpty")}
          </p>
        )}
      </div>
    </section>
  );
}
