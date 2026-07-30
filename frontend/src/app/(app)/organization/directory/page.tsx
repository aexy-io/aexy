"use client";

import { useMemo } from "react";
import { Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  useDepartments,
  useOrganizationMutations,
  useOrganizationPermissions,
  usePeople,
} from "@/hooks/useOrganization";
import { PersonSummary } from "@/lib/organization-api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/EmptyState";

function PersonRow({
  person,
  departmentId,
  people,
  canManage,
}: {
  person: PersonSummary;
  /** When set, show the person's role in that specific department. */
  departmentId?: string;
  people: PersonSummary[];
  canManage: boolean;
}) {
  const t = useTranslations("organization");
  const { setManager } = useOrganizationMutations();

  const membership = departmentId
    ? person.departments.find((d) => d.id === departmentId)
    : undefined;

  const handleManagerChange = async (managerId: string) => {
    try {
      await setManager.mutateAsync({
        developerId: person.developer_id,
        managerId: managerId || null,
      });
    } catch (err: unknown) {
      // The API refuses reporting cycles (400); say so rather than silently
      // reverting the select and leaving the user guessing.
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        t("reportsTo.failed");
      toast.error(detail);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 py-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {(person.name || person.email || "?").slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">
          {person.name || person.email || person.developer_id}
        </div>
        {person.email && (
          <div className="truncate text-xs text-muted-foreground">{person.email}</div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{t("reportsTo.label")}</span>
        {canManage ? (
          <select
            value={person.manager_id ?? ""}
            disabled={setManager.isPending}
            onChange={(e) => handleManagerChange(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs disabled:opacity-60"
            aria-label={t("reportsTo.label")}
          >
            <option value="">{t("reportsTo.none")}</option>
            {people
              .filter((p) => p.developer_id !== person.developer_id)
              .map((p) => (
                <option key={p.developer_id} value={p.developer_id}>
                  {p.name || p.email}
                </option>
              ))}
          </select>
        ) : (
          <span className="text-xs">{person.manager_name || t("reportsTo.none")}</span>
        )}

        {membership && (
          <span className="text-xs capitalize text-muted-foreground">
            {membership.role_in_department}
          </span>
        )}
        {membership?.is_primary && (
          <Badge variant="outline" className="text-[10px]">
            {t("directory.primary")}
          </Badge>
        )}
      </div>
    </div>
  );
}

export default function DirectoryPage() {
  const t = useTranslations("organization");
  // Driven by /people rather than by per-department reads: it is one request
  // instead of one per department, and it is the only read that can surface
  // someone who belongs to no department at all.
  const { data: people, isLoading } = usePeople();
  const { data: departments } = useDepartments();
  const perms = useOrganizationPermissions();
  const canManage = perms.data?.can_manage === true;

  const groups = useMemo(() => {
    const all = people ?? [];
    return (departments ?? [])
      .map((d) => ({
        department: d,
        members: all.filter((p) => p.departments.some((pd) => pd.id === d.id)),
      }))
      .filter((g) => g.members.length > 0);
  }, [departments, people]);

  const unassigned = useMemo(
    () => (people ?? []).filter((p) => p.departments.length === 0),
    [people],
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("directory.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (people ?? []).length === 0 ? (
        <EmptyState icon={Users} title={t("directory.title")} description={t("directory.empty")} />
      ) : (
        <div className="space-y-4">
          {groups.map(({ department, members }) => (
            <Card key={department.id} className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-sm font-semibold">{department.name}</h2>
                {department.function_key && (
                  <Badge variant="secondary" className="text-[10px] uppercase">
                    {department.function_key}
                  </Badge>
                )}
              </div>
              <div className="divide-y divide-border">
                {members.map((p) => (
                  <PersonRow
                    key={p.developer_id}
                    person={p}
                    departmentId={department.id}
                    people={people ?? []}
                    canManage={canManage}
                  />
                ))}
              </div>
            </Card>
          ))}

          {unassigned.length > 0 && (
            <Card className="border-amber-500/40 bg-amber-500/5 p-4">
              <div className="mb-1 flex items-center gap-2">
                <h2 className="text-sm font-semibold">{t("unassignedTitle")}</h2>
                <Badge variant="secondary" className="text-[10px]">
                  {unassigned.length}
                </Badge>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">{t("unassignedHint")}</p>
              <div className="divide-y divide-border">
                {unassigned.map((p) => (
                  <PersonRow
                    key={p.developer_id}
                    person={p}
                    people={people ?? []}
                    canManage={canManage}
                  />
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
