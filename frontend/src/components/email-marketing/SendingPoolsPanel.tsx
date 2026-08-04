"use client";

/**
 * Sending pools — spread a campaign across several domains instead of one.
 *
 * The pool endpoints have existed since the multi-domain infrastructure landed and
 * nothing on the client had ever called them, so a pool could only be created with
 * curl. That made the routing they drive unreachable in practice, which is how it
 * came to be broken without anyone noticing.
 *
 * The two knobs that matter are per-member and strategy-dependent, so the UI says
 * which one is in play rather than showing both unconditionally: `weight` only
 * means anything under `weighted`, `priority` only under `failover`.
 */

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Layers,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { useSendingPool, useSendingPools } from "@/hooks/useEmailMarketing";
import { isSendableDomain } from "@/hooks/useEmailMarketingSetup";
import type { RoutingStrategy, SendingDomain, SendingPoolSummary } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  SettingsEmptyState,
  SettingsSection,
} from "@/components/settings/SettingsPrimitives";

const STRATEGIES: RoutingStrategy[] = ["health_based", "round_robin", "weighted", "failover"];

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

function PoolMembers({
  workspaceId,
  pool,
  domains,
}: {
  workspaceId: string | null;
  pool: SendingPoolSummary;
  domains: SendingDomain[];
}) {
  const t = useTranslations("settingsEmailMarketing");
  const { data: detail, isLoading } = useSendingPool(workspaceId, pool.id);
  const { addMember, removeMember } = useSendingPools(workspaceId);

  const [adding, setAdding] = useState("");
  const byId = new Map(domains.map((d) => [d.id, d]));
  const members = detail?.members ?? [];
  const memberIds = new Set(members.map((m) => m.domain_id));
  // Only domains that could actually carry traffic are worth adding.
  const addable = domains.filter((d) => !memberIds.has(d.id) && isSendableDomain(d));

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  const showWeight = pool.routing_strategy === "weighted";
  const showPriority = pool.routing_strategy === "failover";

  return (
    <div className="space-y-3 border-t border-border px-4 py-3">
      {members.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("pools.noMembers")}</p>
      ) : (
        <ul className="space-y-1.5">
          {members.map((m) => {
            const domain = byId.get(m.domain_id);
            const sendable = domain ? isSendableDomain(domain) : false;
            return (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    sendable ? "bg-emerald-500" : "bg-amber-500"
                  )}
                  aria-hidden
                />
                <span className="truncate text-foreground">
                  {domain?.domain ?? m.domain_id}
                </span>
                {domain && !sendable && (
                  <span className="text-[10px] uppercase tracking-wide text-amber-500">
                    {domain.status}
                  </span>
                )}
                {showWeight && (
                  <span className="text-xs text-muted-foreground">
                    {t("pools.weightIs", { weight: m.weight })}
                  </span>
                )}
                {showPriority && (
                  <span className="text-xs text-muted-foreground">
                    {t("pools.priorityIs", { priority: m.priority })}
                  </span>
                )}
                {domain && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {t("pools.usage", { sent: domain.daily_sent, limit: domain.daily_limit })}
                  </span>
                )}
                <button
                  onClick={() => removeMember({ poolId: pool.id, domainId: m.domain_id })}
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                  title={t("pools.removeMember")}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {addable.length > 0 ? (
        <div className="flex items-center gap-2">
          <select
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            className={cn(inputClass, "max-w-xs")}
            aria-label={t("pools.addMember")}
          >
            <option value="">{t("pools.chooseDomain")}</option>
            {addable.map((d) => (
              <option key={d.id} value={d.id}>
                {d.domain}
              </option>
            ))}
          </select>
          <button
            disabled={!adding}
            onClick={async () => {
              await addMember({ poolId: pool.id, data: { domain_id: adding } });
              setAdding("");
            }}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            {t("pools.addMember")}
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {memberIds.size > 0 ? t("pools.allAdded") : t("pools.needVerifiedDomain")}
        </p>
      )}
    </div>
  );
}

export function SendingPoolsPanel({
  workspaceId,
  domains,
}: {
  workspaceId: string | null;
  domains: SendingDomain[];
}) {
  const t = useTranslations("settingsEmailMarketing");
  const { pools, isLoading, createPool, updatePool, deletePool, isCreating } =
    useSendingPools(workspaceId);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [strategy, setStrategy] = useState<RoutingStrategy>("health_based");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const sendable = domains.filter(isSendableDomain);

  if (isLoading) {
    return (
      <SettingsSection>
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
        </div>
      </SettingsSection>
    );
  }

  return (
    <div className="space-y-4">
      {showForm && (
        <SettingsSection title={t("pools.newPool")}>
          <div className="space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("pools.namePlaceholder")}
              className={inputClass}
              aria-label={t("pools.name")}
            />
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                {t("pools.strategy")}
              </label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as RoutingStrategy)}
                className={inputClass}
              >
                {STRATEGIES.map((s) => (
                  <option key={s} value={s}>
                    {t(`pools.strategies.${s}.label`)}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {t(`pools.strategies.${strategy}.detail`)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={!name.trim() || isCreating}
                onClick={async () => {
                  const created = await createPool({
                    name: name.trim(),
                    routing_strategy: strategy,
                    // Every sendable domain to start with: a pool with no members
                    // routes nothing, and adding them one by one is the tedious
                    // path to the obvious default.
                    members: sendable.map((d) => ({ domain_id: d.id })),
                  });
                  setName("");
                  setShowForm(false);
                  setExpanded(created.id);
                }}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isCreating && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                {t("pools.create")}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setName("");
                }}
                className="px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("pools.cancel")}
              </button>
            </div>
            {sendable.length === 0 && (
              <p className="flex items-start gap-2 text-xs text-amber-500">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {t("pools.noVerifiedYet")}
              </p>
            )}
          </div>
        </SettingsSection>
      )}

      {pools.length === 0 ? (
        <SettingsSection>
          <SettingsEmptyState
            icon={<Layers className="h-8 w-8" aria-hidden />}
            title={t("pools.emptyTitle")}
            description={t("pools.emptyDetail")}
            action={
              !showForm ? (
                <button
                  onClick={() => setShowForm(true)}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  {t("pools.add")}
                </button>
              ) : undefined
            }
          />
        </SettingsSection>
      ) : (
        pools.map((pool) => (
          <SettingsSection key={pool.id} flush>
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                onClick={() => setExpanded(expanded === pool.id ? null : pool.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                aria-expanded={expanded === pool.id}
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    expanded === pool.id && "rotate-180"
                  )}
                  aria-hidden
                />
                <span className="truncate text-sm font-medium text-foreground">{pool.name}</span>
                {pool.is_default && (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t("pools.default")}
                  </span>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t("pools.memberCount", { count: pool.member_count })}
                </span>
              </button>

              <select
                value={pool.routing_strategy}
                onChange={(e) =>
                  updatePool({
                    poolId: pool.id,
                    data: { routing_strategy: e.target.value as RoutingStrategy },
                  })
                }
                className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label={t("pools.strategy")}
              >
                {STRATEGIES.map((s) => (
                  <option key={s} value={s}>
                    {t(`pools.strategies.${s}.label`)}
                  </option>
                ))}
              </select>

              {!pool.is_default && (
                <button
                  onClick={() => updatePool({ poolId: pool.id, data: { is_default: true } })}
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                  title={t("pools.makeDefault")}
                >
                  <Check className="h-4 w-4" aria-hidden />
                </button>
              )}

              {confirmDelete === pool.id ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={async () => {
                      await deletePool(pool.id);
                      setConfirmDelete(null);
                    }}
                    className="rounded px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                  >
                    {t("pools.confirmDelete")}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t("pools.cancel")}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(pool.id)}
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                  title={t("pools.delete")}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>

            {expanded === pool.id && (
              <PoolMembers workspaceId={workspaceId} pool={pool} domains={domains} />
            )}
          </SettingsSection>
        ))
      )}

      {pools.length > 0 && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("pools.add")}
        </button>
      )}
    </div>
  );
}
