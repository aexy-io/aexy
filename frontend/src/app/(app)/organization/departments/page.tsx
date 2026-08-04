"use client";

import { useState } from "react";
import { Building2, Plus, Trash2, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { DepartmentMembersDialog } from "./DepartmentMembersDialog";

import {
  useDepartments,
  useOrganizationMutations,
  useOrganizationPermissions,
} from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

export default function DepartmentsPage() {
  const t = useTranslations("organization");
  const { data: departments, isLoading } = useDepartments();
  const { createDepartment, deleteDepartment } = useOrganizationMutations();
  // Editing needs can_manage_org. The API enforces it (403); hiding the controls
  // keeps us from offering actions that cannot succeed. Read-only until known.
  const perms = useOrganizationPermissions();
  const canManage = perms.data?.can_manage === true;

  const [open, setOpen] = useState(false);
  // Which department's roster is open. Read-only callers can open it too — they
  // just get the list without the add/remove controls.
  const [managing, setManaging] = useState<{ id: string; name: string } | null>(null);
  const [name, setName] = useState("");
  const [functionKey, setFunctionKey] = useState("");
  const [parentId, setParentId] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [plannedHeadcount, setPlannedHeadcount] = useState("");

  const resetForm = () => {
    setName("");
    setFunctionKey("");
    setParentId("");
    setCostCenter("");
    setPlannedHeadcount("");
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    await createDepartment.mutateAsync({
      name: name.trim(),
      function_key: functionKey.trim() || null,
      parent_id: parentId || null,
      cost_center: costCenter.trim() || null,
      headcount_planned: plannedHeadcount ? Number(plannedHeadcount) : 0,
    });
    resetForm();
    setOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t("departments.deleteConfirm"))) return;
    await deleteDepartment.mutateAsync(id);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("departments.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canManage && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t("departments.new")}
          </Button>
        )}
      </div>

      {!perms.isLoading && !canManage && (
        <Card className="border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : !departments || departments.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t("departments.title")}
          description={t("departments.empty")}
          actions={
            canManage ? [{ label: t("departments.new"), onClick: () => setOpen(true), icon: Plus }] : []
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">{t("departments.name")}</th>
                <th className="px-4 py-2">{t("departments.function")}</th>
                <th className="px-4 py-2">{t("departments.members")}</th>
                <th className="px-4 py-2">{t("departments.headcount")}</th>
                <th className="px-4 py-2">{t("departments.costCenter")}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <span style={{ paddingLeft: `${d.depth * 16}px` }} className="font-medium">
                      {d.name}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {d.function_key ? (
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        {d.function_key}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => setManaging({ id: d.id, name: d.name })}
                      className="inline-flex items-center gap-1 rounded px-1 text-primary hover:underline"
                      aria-label={t("members.manage")}
                    >
                      <Users className="h-3.5 w-3.5" />
                      {d.member_count}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {d.headcount_actual} / {d.headcount_planned}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{d.cost_center || "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {canManage && (
                      <button
                        onClick={() => handleDelete(d.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {managing && (
        <DepartmentMembersDialog
          departmentId={managing.id}
          departmentName={managing.name}
          open
          onOpenChange={(o) => !o && setManaging(null)}
          canManage={canManage}
        />
      )}

      <Dialog open={open && canManage} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("departments.create")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t("departments.name")}</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t("departments.function")}</label>
              <Input
                value={functionKey}
                onChange={(e) => setFunctionKey(e.target.value)}
                placeholder="sales, finance, ops_kam…"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t("departments.parent")}</label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">{t("departments.noParent")}</option>
                {(departments ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t("departments.costCenter")}</label>
                <Input value={costCenter} onChange={(e) => setCostCenter(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  {t("departments.headcount")} ({t("departments.planned")})
                </label>
                <Input
                  type="number"
                  min={0}
                  value={plannedHeadcount}
                  onChange={(e) => setPlannedHeadcount(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || createDepartment.isPending}
            >
              {createDepartment.isPending ? t("departments.creating") : t("departments.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
