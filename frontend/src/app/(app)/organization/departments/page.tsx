"use client";

import { useState } from "react";
import { Building2, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { DepartmentMembersDialog } from "./DepartmentMembersDialog";

import {
  FunctionPicker,
  UnclaimedFunctionsNotice,
} from "@/components/organization/FunctionPicker";

import {
  useDepartments,
  useFunctionCatalog,
  useOrganizationMutations,
  useOrganizationPermissions,
} from "@/hooks/useOrganization";
import { Department, DepartmentUpdate } from "@/lib/organization-api";
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
  const { createDepartment, updateDepartment, deleteDepartment } = useOrganizationMutations();
  // Editing needs can_manage_org. The API enforces it (403); hiding the controls
  // keeps us from offering actions that cannot succeed. Read-only until known.
  const perms = useOrganizationPermissions();
  const functionLabel = useFunctionLabel();
  const canManage = perms.data?.can_manage === true;

  const [open, setOpen] = useState(false);
  // Which department's roster is open. Read-only callers can open it too — they
  // just get the list without the add/remove controls.
  const [managing, setManaging] = useState<{ id: string; name: string } | null>(null);
  // Which department is being edited. `updateDepartment` existed in the API and
  // the hooks with no caller at all, so a department's name and — the one that
  // matters — its function key were create-only: a department made before the
  // function registry, or made without one, could never be pointed at anything.
  const [editing, setEditing] = useState<Department | null>(null);
  const [name, setName] = useState("");
  const [functionKey, setFunctionKey] = useState<string | null>(null);
  const [parentId, setParentId] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [plannedHeadcount, setPlannedHeadcount] = useState("");

  const resetForm = () => {
    setName("");
    setFunctionKey(null);
    setParentId("");
    setCostCenter("");
    setPlannedHeadcount("");
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    await createDepartment.mutateAsync({
      name: name.trim(),
      function_key: functionKey,
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

      {/* The one failure in this mapping with no natural symptom: a desk queue
          routing to a function nobody claims shows its people an empty list. */}
      <UnclaimedFunctionsNotice />

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
                        {functionLabel(d.function_key)}
                      </Badge>
                    ) : (
                      // Not merely blank: a department with no function is invisible
                      // to every desk queue, digest and auto-assignment, so it says
                      // so and offers the fix.
                      <button
                        onClick={() => canManage && setEditing(d)}
                        disabled={!canManage}
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline disabled:hover:no-underline"
                      >
                        {canManage ? t("functions.setOne") : "—"}
                      </button>
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
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditing(d)}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={t("departments.edit")}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(d.id)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
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

      {editing && canManage && (
        <EditDepartmentDialog
          department={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await updateDepartment.mutateAsync({ id: editing.id, data });
            setEditing(null);
          }}
          saving={updateDepartment.isPending}
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
              {/* A picker, not a text box: the value routes Service Desk queues,
                  digests and auto-assignment, and a typo produced an empty queue
                  with no error rather than a validation message. */}
              <FunctionPicker value={functionKey} onChange={setFunctionKey} />
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

/** Registry label for a stored key, falling back to the key itself.
 *
 *  Custom keys deliberately show the raw key. The catalogue labels them with the
 *  department that defined them — right for the dropdown, where "Underwriting"
 *  beats "x_underwriting" — but in this table that would print the department's
 *  own name back at it in the column beside its name, saying nothing. A
 *  pre-registry value falls through here too, which is the same answer. */
function useFunctionLabel() {
  const { data: catalog } = useFunctionCatalog();
  return (key: string) => {
    const option = catalog?.options.find((o) => o.key === key);
    return option && !option.is_custom ? option.label : key;
  };
}

interface EditProps {
  department: Department;
  onClose: () => void;
  onSave: (data: DepartmentUpdate) => Promise<void>;
  saving: boolean;
}

/**
 * Edit a department's name, function and org attributes.
 *
 * Deliberately does not offer the parent: re-parenting rewrites the materialised
 * paths of a whole subtree through its own endpoint, and mixing it into a
 * general-purpose save would make an accidental drag as cheap as a typo.
 */
function EditDepartmentDialog({ department, onClose, onSave, saving }: EditProps) {
  const t = useTranslations("organization");
  const tc = useTranslations("common");
  const [name, setName] = useState(department.name);
  const [functionKey, setFunctionKey] = useState<string | null>(department.function_key);
  const [costCenter, setCostCenter] = useState(department.cost_center ?? "");
  const [planned, setPlanned] = useState(String(department.headcount_planned || ""));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("departments.editTitle", { department: department.name })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t("departments.name")}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t("departments.function")}</label>
            <FunctionPicker
              value={functionKey}
              onChange={setFunctionKey}
              currentDepartmentId={department.id}
            />
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
                value={planned}
                onChange={(e) => setPlanned(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={() =>
              onSave({
                name: name.trim(),
                function_key: functionKey,
                cost_center: costCenter.trim() || null,
                headcount_planned: planned ? Number(planned) : 0,
              })
            }
            disabled={!name.trim() || saving}
          >
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
