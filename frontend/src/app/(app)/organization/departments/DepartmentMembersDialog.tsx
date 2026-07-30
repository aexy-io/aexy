"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";

import { useDepartment, useOrganizationMutations, usePeople } from "@/hooks/useOrganization";
import { DepartmentMemberRole } from "@/lib/organization-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ROLES: DepartmentMemberRole[] = ["head", "manager", "member"];

const selectClass =
  "rounded-md border border-border bg-background px-2 py-1 text-xs disabled:opacity-60";

interface Props {
  departmentId: string;
  departmentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whether the caller holds can_manage_org. Read-only shows the roster only. */
  canManage: boolean;
}

/**
 * Manage who is in a department.
 *
 * This is the surface that was missing: `addMember` / `removeMember` /
 * `addPosition` existed in the API and the hooks but had no caller, so the only
 * way to place someone in a department was the seed script — leaving every
 * invited member unassigned, invisible in the directory, and out of scope for
 * Service Desk row filtering.
 */
export function DepartmentMembersDialog({
  departmentId,
  departmentName,
  open,
  onOpenChange,
  canManage,
}: Props) {
  const t = useTranslations("organization");
  const { data: detail, isLoading } = useDepartment(open ? departmentId : null);
  const { data: people } = usePeople();
  const { addMember, updateMember, removeMember, addPosition } = useOrganizationMutations();

  const [pick, setPick] = useState("");
  const [pickRole, setPickRole] = useState<DepartmentMemberRole>("member");
  const [positionTitle, setPositionTitle] = useState("");

  // Only offer people who aren't already here. The API returns 409 for a
  // duplicate, so filtering keeps the picker from presenting a dead choice.
  const candidates = useMemo(() => {
    const already = new Set((detail?.members ?? []).map((m) => m.developer_id));
    return (people ?? []).filter((p) => !already.has(p.developer_id));
  }, [people, detail?.members]);

  const handleAdd = async () => {
    if (!pick) return;
    await addMember.mutateAsync({
      departmentId,
      data: {
        developer_id: pick,
        role_in_department: pickRole,
        // Someone's first department is their primary one; after that, leave the
        // existing primary alone rather than silently moving it.
        is_primary: !(people ?? []).find((p) => p.developer_id === pick)?.departments.length,
      },
    });
    setPick("");
    setPickRole("member");
  };

  const handleAddPosition = async () => {
    if (!positionTitle.trim()) return;
    await addPosition.mutateAsync({ departmentId, data: { title: positionTitle.trim() } });
    setPositionTitle("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("members.title", { department: departmentName })}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-6">
            <section className="space-y-2">
              {(detail?.members ?? []).length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">{t("members.none")}</p>
              ) : (
                <div className="divide-y divide-border">
                  {(detail?.members ?? []).map((m) => (
                    <div key={m.id} className="flex items-center gap-3 py-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {(m.name || m.email || "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{m.name || m.email}</p>
                        {m.name && m.email && (
                          <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                        )}
                      </div>
                      {m.is_primary && (
                        <Badge variant="secondary" className="text-[10px] uppercase">
                          {t("members.primary")}
                        </Badge>
                      )}
                      <select
                        value={m.role_in_department}
                        disabled={!canManage || updateMember.isPending}
                        onChange={(e) =>
                          updateMember.mutate({
                            departmentId,
                            memberId: m.id,
                            data: { role_in_department: e.target.value as DepartmentMemberRole },
                          })
                        }
                        className={selectClass}
                        aria-label={t("members.role")}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {t(`members.roles.${r}`)}
                          </option>
                        ))}
                      </select>
                      {canManage && (
                        <button
                          onClick={() => removeMember.mutate({ departmentId, memberId: m.id })}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={t("members.remove")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {canManage && (
              <section className="space-y-2 border-t border-border pt-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  {t("members.add")}
                </p>
                {candidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("members.everyoneAdded")}</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={pick}
                      onChange={(e) => setPick(e.target.value)}
                      className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                      aria-label={t("members.add")}
                    >
                      <option value="">{t("members.choosePerson")}</option>
                      {candidates.map((p) => (
                        <option key={p.developer_id} value={p.developer_id}>
                          {p.name || p.email}
                          {p.departments.length === 0 ? ` — ${t("unassigned")}` : ""}
                        </option>
                      ))}
                    </select>
                    <select
                      value={pickRole}
                      onChange={(e) => setPickRole(e.target.value as DepartmentMemberRole)}
                      className={selectClass}
                      aria-label={t("members.role")}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`members.roles.${r}`)}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" onClick={handleAdd} disabled={!pick || addMember.isPending}>
                      <UserPlus className="mr-1 h-4 w-4" />
                      {t("members.add")}
                    </Button>
                  </div>
                )}
              </section>
            )}

            <section className="space-y-2 border-t border-border pt-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                {t("positions.title")}
              </p>
              {(detail?.positions ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("positions.none")}</p>
              ) : (
                <ul className="space-y-1">
                  {(detail?.positions ?? []).map((p) => (
                    <li key={p.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1">{p.title}</span>
                      <Badge variant={p.status === "open" ? "secondary" : "outline"} className="text-[10px] uppercase">
                        {t(`positions.status.${p.status}`)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              {canManage && (
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    value={positionTitle}
                    onChange={(e) => setPositionTitle(e.target.value)}
                    placeholder={t("positions.placeholder")}
                    className="h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAddPosition}
                    disabled={!positionTitle.trim() || addPosition.isPending}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    {t("positions.add")}
                  </Button>
                </div>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
