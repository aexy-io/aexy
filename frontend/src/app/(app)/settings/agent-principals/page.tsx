"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Power,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useWorkspace, useIsWorkspaceAdmin } from "@/hooks/useWorkspace";
import {
  AgentPrincipal,
  PrincipalTokenCreated,
  agentPrincipalsApi,
  mcpApi,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/utils";
import { CopyButton } from "@/components/ui/copy-button";
import { MCP_TOOL_CATEGORIES } from "@/config/mcpTools";
import {
  SettingsAccessDenied,
  SettingsEmptyState,
  SettingsPage,
  SettingsSection,
  SettingsSkeleton,
} from "@/components/settings/SettingsPrimitives";

/**
 * The identities agents run as.
 *
 * Every MCP call used to run as a person. A principal is a workspace-owned
 * identity with a capability scope that can only be a subset of what the
 * workspace grants; it gets its own token, and its writes appear in the
 * ledger and the review queue under its own name. Admin-only, because
 * creating one and minting it a token is writing a grant.
 */
function CapabilityPicker({
  value,
  onChange,
  grantable,
  loading,
  label,
  hint,
  emptyHint,
}: {
  value: Set<string>;
  onChange: (next: Set<string>) => void;
  grantable: typeof MCP_TOOL_CATEGORIES;
  loading: boolean;
  label: string;
  hint: string;
  emptyHint: string;
}) {
  const toggle = (capability: string) => {
    const next = new Set(value);
    if (next.has(capability)) next.delete(capability);
    else next.add(capability);
    onChange(next);
  };
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      {loading ? (
        <SettingsSkeleton rows={1} />
      ) : grantable.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {grantable.map((category) => (
            <label
              key={category.capability}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-accent/40"
            >
              <input
                type="checkbox"
                checked={value.has(category.capability)}
                onChange={() => toggle(category.capability)}
                className="h-3.5 w-3.5"
              />
              <span className="truncate">{category.name}</span>
              {category.privileged && (
                <span className="ml-auto rounded bg-amber-400/10 px-1 text-[10px] uppercase text-amber-400">!</span>
              )}
            </label>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export default function AgentPrincipalsPage() {
  const t = useTranslations("agentPrincipals");
  const tc = useTranslations("common");
  const { currentWorkspaceId } = useWorkspace();
  const { isWorkspaceAdmin, isLoading: adminLoading } = useIsWorkspaceAdmin(currentWorkspaceId);
  const queryClient = useQueryClient();

  const { data: principals = [], isLoading } = useQuery<AgentPrincipal[]>({
    queryKey: ["agent-principals", currentWorkspaceId],
    queryFn: () => agentPrincipalsApi.list(currentWorkspaceId!),
    enabled: Boolean(currentWorkspaceId) && isWorkspaceAdmin,
  });

  // What this workspace can grant at all, as seen by the admin. A principal
  // may hold a subset of this, never more.
  const { data: surface, isLoading: surfaceLoading } = useQuery({
    queryKey: ["mcp-tools", currentWorkspaceId],
    queryFn: () => mcpApi.tools(currentWorkspaceId!),
    enabled: Boolean(currentWorkspaceId) && isWorkspaceAdmin,
  });
  // Strict: until the surface has loaded there is nothing to offer, and a
  // workspace holding nothing offers nothing. Falling open to the whole
  // catalogue here would let an admin tick `admin` in a workspace that has
  // no such module, and the backend now refuses that anyway.
  const grantable = useMemo(() => {
    const granted = new Set(surface?.granted_capabilities ?? []);
    return MCP_TOOL_CATEGORIES.filter((c) => granted.has(c.capability));
  }, [surface]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["agent-principals", currentWorkspaceId] });

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<AgentPrincipal | null>(null);
  const [editSelected, setEditSelected] = useState<Set<string>>(new Set());
  const [issued, setIssued] = useState<{ principal: AgentPrincipal; token: PrincipalTokenCreated } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      agentPrincipalsApi.create(currentWorkspaceId!, {
        name: name.trim(),
        description: description.trim() || null,
        capabilities: [...selected],
      }),
    onSuccess: () => {
      toast.success(tc("saved"));
      setName("");
      setDescription("");
      setSelected(new Set());
      setShowCreate(false);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, tc("error"))),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof agentPrincipalsApi.update>[2] }) =>
      agentPrincipalsApi.update(currentWorkspaceId!, id, data),
    onSuccess: () => {
      toast.success(tc("saved"));
      setEditing(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, tc("error"))),
    onSettled: () => setBusyId(null),
  });

  const remove = useMutation({
    mutationFn: (id: string) => agentPrincipalsApi.remove(currentWorkspaceId!, id),
    onSuccess: () => {
      toast.success(tc("deleted"));
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, tc("error"))),
    onSettled: () => {
      setBusyId(null);
      setConfirmRemove(null);
    },
  });

  const rotate = useMutation({
    mutationFn: (principal: AgentPrincipal) =>
      agentPrincipalsApi.rotateToken(currentWorkspaceId!, principal.id).then((token) => ({ principal, token })),
    onSuccess: (result) => {
      setIssued(result);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, tc("error"))),
    onSettled: () => setBusyId(null),
  });



  if (!adminLoading && !isWorkspaceAdmin) {
    return (
      <SettingsPage title={t("title")} description={t("subtitle")} width="wide">
        <SettingsAccessDenied detail={t("adminOnly")} />
      </SettingsPage>
    );
  }

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
      {showCreate && (
        <SettingsSection title={t("form.heading")}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t("form.nameLabel")}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("form.namePlaceholder")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t("form.descriptionLabel")}</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("form.descriptionPlaceholder")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
            </div>
          </div>
          <div className="mt-4">
            <CapabilityPicker value={selected} onChange={setSelected} grantable={grantable} loading={surfaceLoading} label={t("form.capabilitiesLabel")} hint={t("form.capabilitiesHint")} emptyHint={t("form.capabilitiesNone")} />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => create.mutate()}
              disabled={!name.trim() || create.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
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

      {issued && (
        <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4" data-testid="principal-token">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-medium">{t("token.banner", { name: issued.principal.name })}</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-zinc-900 px-3 py-2">
            <code className="flex-1 select-all break-all font-mono text-sm text-emerald-300">{issued.token.token}</code>
            <CopyButton text={issued.token.token} />
          </div>
          <p className="text-xs text-muted-foreground">{t("token.bridgeHint")}</p>
          <div className="flex items-center gap-2 text-xs text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{t("token.warning")}</span>
          </div>
          <button onClick={() => setIssued(null)} className="text-xs text-muted-foreground transition-colors hover:text-foreground">
            {t("token.dismiss")}
          </button>
        </div>
      )}

      {editing && (
        <SettingsSection title={`${t("actions.editCapabilities")} — ${editing.name}`}>
          <CapabilityPicker value={editSelected} onChange={setEditSelected} grantable={grantable} loading={surfaceLoading} label={t("form.capabilitiesLabel")} hint={t("form.capabilitiesHint")} emptyHint={t("form.capabilitiesNone")} />
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => {
                setBusyId(editing.id);
                update.mutate({ id: editing.id, data: { capabilities: [...editSelected] } });
              }}
              disabled={update.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {update.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {t("actions.save")}
            </button>
            <button onClick={() => setEditing(null)} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
              {tc("cancel")}
            </button>
          </div>
        </SettingsSection>
      )}

      {isLoading || adminLoading ? (
        <SettingsSkeleton rows={1} />
      ) : principals.length === 0 ? (
        <SettingsSection flush>
          <SettingsEmptyState icon={<Bot className="h-8 w-8" />} title={t("empty.title")} description={t("empty.description")} />
        </SettingsSection>
      ) : (
        <SettingsSection flush footer={t("footer")}>
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[1fr_1.4fr_90px_130px_90px_150px] gap-4 border-b border-border px-5 py-2 text-xs font-medium text-muted-foreground">
                <div>{t("table.name")}</div>
                <div>{t("table.capabilities")}</div>
                <div>{t("table.tokens")}</div>
                <div>{t("table.lastUsed")}</div>
                <div>{t("table.status")}</div>
                <div></div>
              </div>
              {principals.map((principal) => {
                const busy = busyId === principal.id;
                return (
                  <div
                    key={principal.id}
                    data-testid={`principal-${principal.id}`}
                    className="grid grid-cols-[1fr_1.4fr_90px_130px_90px_150px] items-center gap-4 border-b border-border px-5 py-3 text-sm last:border-b-0 hover:bg-accent/30"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{principal.name}</div>
                      {principal.description && (
                        <div className="truncate text-xs text-muted-foreground">{principal.description}</div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {principal.capabilities.length === 0 ? (
                        <span className="text-xs text-muted-foreground">{t("form.none")}</span>
                      ) : (
                        principal.capabilities.map((cap) => (
                          <code key={cap} className="rounded bg-accent px-1.5 py-0.5 font-mono text-[11px]">
                            {cap.replace(/^mcp\./, "")}
                          </code>
                        ))
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{principal.active_token_count}</div>
                    <div className="text-xs text-muted-foreground">
                      {principal.last_used_at
                        ? formatDistanceToNow(new Date(principal.last_used_at), { addSuffix: true })
                        : t("table.never")}
                    </div>
                    <div>
                      {principal.is_active ? (
                        <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-400">{t("status.active")}</span>
                      ) : (
                        <span className="rounded-full bg-zinc-400/10 px-2 py-0.5 text-xs text-zinc-400">{t("status.inactive")}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      {confirmRemove === principal.id ? (
                        <>
                          <button
                            onClick={() => {
                              setBusyId(principal.id);
                              remove.mutate(principal.id);
                            }}
                            disabled={busy}
                            className="rounded px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-400/10"
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("actions.remove")}
                          </button>
                          <button onClick={() => setConfirmRemove(null)} className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                            {tc("cancel")}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            title={t("token.rotateTitle")}
                            disabled={!principal.is_active || busy}
                            onClick={() => {
                              setBusyId(principal.id);
                              rotate.mutate(principal);
                            }}
                            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                          >
                            {busy && rotate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                          </button>
                          <button
                            title={t("actions.editCapabilities")}
                            onClick={() => {
                              setEditing(principal);
                              setEditSelected(new Set(principal.capabilities));
                            }}
                            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            title={principal.is_active ? t("actions.deactivate") : t("actions.activate")}
                            disabled={busy}
                            onClick={() => {
                              setBusyId(principal.id);
                              update.mutate({ id: principal.id, data: { is_active: !principal.is_active } });
                            }}
                            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            <Power className="h-4 w-4" />
                          </button>
                          <button
                            title={t("actions.removeTitle")}
                            onClick={() => setConfirmRemove(principal.id)}
                            className="rounded p-1.5 text-muted-foreground hover:bg-red-400/10 hover:text-red-400"
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
          </div>
        </SettingsSection>
      )}
    </SettingsPage>
  );
}
