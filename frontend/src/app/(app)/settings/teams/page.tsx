"use client";

/**
 * Teams management.
 *
 * The backend for this has existed all along — `models/team.py`,
 * `api/workspace_teams.py`, `teamApi`, and `useTeams`/`useTeam`/`useTeamMembers`
 * with full CRUD — and ten places *read* teams: escalation routing, on-call
 * rotations, standups, insights, tickets, forms. There was simply nowhere to
 * create one. A workspace could only get a team by calling the API by hand, which
 * meant the features that route work to teams quietly had nothing to route to.
 */

import { useState } from "react";
import { Plus, Loader2, Trash2, RefreshCw, GitBranch, Users, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import { usePermissions } from "@/hooks/usePermissions";
import { useTeams, useTeam, useTeamMembers } from "@/hooks/useTeams";
import type { TeamListItem } from "@/lib/api";
import {
  SettingsPage,
  SettingsSection,
  SettingsSkeleton,
  SettingsEmptyState,
} from "@/components/settings/SettingsPrimitives";

function TeamDetail({
  workspaceId,
  teamId,
  canDelete,
  onClose,
  onDeleted,
}: {
  workspaceId: string;
  teamId: string;
  canDelete: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("settingsTeams");
  const { team, updateTeam, syncTeam, isSyncing } = useTeam(workspaceId, teamId);
  const { members, addMember, removeMember, isAdding } = useTeamMembers(workspaceId, teamId);
  const { members: workspaceMembers } = useWorkspaceMembers(workspaceId);
  const { deleteTeam, isDeleting } = useTeams(workspaceId);

  const [addId, setAddId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Only people not already on the team, so the picker can't produce a no-op.
  const inTeam = new Set(members.map((m) => m.developer_id));
  const candidates = workspaceMembers.filter((m) => !inTeam.has(m.developer_id));

  if (!team) return <SettingsSkeleton rows={1} />;

  return (
    <SettingsSection
      title={team.name}
      description={team.description ?? undefined}
      actions={
        <div className="flex items-center gap-2">
          {team.type === "repo_based" && (
            <button
              onClick={() => syncTeam()}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {isSyncing ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-3 w-3" aria-hidden />
              )}
              {t("detail.sync")}
            </button>
          )}
          <button
            onClick={onClose}
            aria-label={t("detail.close")}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {team.type === "repo_based" && (
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={team.auto_sync_enabled}
              onChange={(e) => updateTeam({ auto_sync_enabled: e.target.checked })}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-foreground">{t("detail.autoSync")}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t("detail.autoSyncHint")}
              </span>
            </span>
          </label>
        )}

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("detail.members", { count: members.length })}
          </h3>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("detail.noMembers")}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">
                      {m.developer_name || m.developer_email}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t(`roles.${m.role}`)}
                      {/* Where the membership came from: a repo-synced member is
                          replaced on the next sync, so removing them by hand is
                          temporary and worth flagging. */}
                      {m.source === "repo_contributor" && ` · ${t("detail.fromRepo")}`}
                    </span>
                  </span>
                  <button
                    onClick={() => removeMember(m.developer_id)}
                    aria-label={t("detail.remove")}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={addId}
              onChange={(e) => setAddId(e.target.value)}
              className="min-w-48 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">{t("detail.addPlaceholder")}</option>
              {candidates.map((m) => (
                <option key={m.developer_id} value={m.developer_id}>
                  {m.developer_name || m.developer_email}
                </option>
              ))}
            </select>
            <button
              onClick={async () => {
                if (!addId) return;
                await addMember({ developerId: addId });
                setAddId("");
              }}
              disabled={!addId || isAdding}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isAdding && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
              {t("detail.add")}
            </button>
            {candidates.length === 0 && (
              <span className="text-xs text-muted-foreground">{t("detail.everyoneAdded")}</span>
            )}
          </div>
        </div>

        {canDelete && (
          <div className="border-t border-border pt-4">
            {confirmDelete ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {t("detail.confirmDelete", { name: team.name })}
                </span>
                <button
                  onClick={async () => {
                    await deleteTeam(teamId);
                    onDeleted();
                  }}
                  disabled={isDeleting}
                  className="rounded-md bg-destructive px-2.5 py-1 text-xs font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {t("detail.deleteConfirm")}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {t("detail.cancel")}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 text-xs text-destructive transition-colors hover:underline"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("detail.delete")}
              </button>
            )}
          </div>
        )}
      </div>
    </SettingsSection>
  );
}

export default function TeamsSettingsPage() {
  const t = useTranslations("settingsTeams");
  const { currentWorkspaceId } = useWorkspace();
  const { teams, isLoading, createTeam, isCreating } = useTeams(currentWorkspaceId);
  // Deleting a team is owner-only by default (OWNER_ONLY_PERMISSIONS), so hide
  // the control rather than offering a button that 403s.
  const { hasPermission, isWorkspaceOwner } = usePermissions(currentWorkspaceId);
  const canDelete = isWorkspaceOwner || hasPermission("can_delete_teams");

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) return;
    try {
      const team = await createTeam({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setName("");
      setDescription("");
      setShowCreate(false);
      setSelectedId(team.id);
    } catch {
      // useTeams surfaces the error as a toast
    }
  };

  return (
    <SettingsPage
      title={t("title")}
      description={t("description")}
      actions={
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("create")}
        </button>
      }
    >
      {showCreate && (
        <SettingsSection title={t("form.heading")}>
          <div className="space-y-3">
            <div>
              <label htmlFor="team-name" className="mb-1 block text-xs text-muted-foreground">
                {t("form.name")}
              </label>
              <input
                id="team-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                placeholder={t("form.namePlaceholder")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label htmlFor="team-desc" className="mb-1 block text-xs text-muted-foreground">
                {t("form.description")}
              </label>
              <input
                id="team-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={create}
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
                {t("detail.cancel")}
              </button>
            </div>
          </div>
        </SettingsSection>
      )}

      {isLoading ? (
        <SettingsSkeleton rows={2} />
      ) : teams.length === 0 ? (
        <SettingsSection flush>
          <SettingsEmptyState
            icon={<Users className="h-8 w-8" />}
            title={t("empty.title")}
            description={t("empty.description")}
          />
        </SettingsSection>
      ) : (
        <SettingsSection title={t("list.heading", { count: teams.length })} flush>
          <ul className="divide-y divide-border">
            {teams.map((team: TeamListItem) => (
              <li key={team.id}>
                <button
                  onClick={() => setSelectedId(selectedId === team.id ? null : team.id)}
                  aria-expanded={selectedId === team.id}
                  className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-accent/30"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {team.name}
                      </span>
                      {team.type === "repo_based" && (
                        <GitBranch
                          className="h-3 w-3 shrink-0 text-muted-foreground"
                          aria-label={t("list.repoBased")}
                        />
                      )}
                      {!team.is_active && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {t("list.inactive")}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("list.memberCount", { count: team.member_count })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </SettingsSection>
      )}

      {selectedId && currentWorkspaceId && (
        <TeamDetail
          workspaceId={currentWorkspaceId}
          teamId={selectedId}
          canDelete={canDelete}
          onClose={() => setSelectedId(null)}
          onDeleted={() => {
            setSelectedId(null);
            toast.success(t("detail.deleted"));
          }}
        />
      )}
    </SettingsPage>
  );
}
