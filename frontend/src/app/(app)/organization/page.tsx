"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Building2, Network, Users, ChevronRight, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { useOrgChart } from "@/hooks/useOrganization";
import { DepartmentMemberSummary, DepartmentNode } from "@/lib/organization-api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";

function flatten(nodes: DepartmentNode[]): DepartmentNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}

const ROLE_ORDER: Record<DepartmentMemberSummary["role_in_department"], number> = {
  head: 0,
  manager: 1,
  member: 2,
};

interface PersonNode {
  member: DepartmentMemberSummary;
  reports: PersonNode[];
}

/**
 * Turn a department's flat member list into the reporting tree it describes.
 *
 * A person hangs off their manager when that manager is in the same department;
 * otherwise they sit at the top level. Two reasons that fallback matters: a
 * manager can sit in a different department (a KAM reporting to the COO), and
 * `manager_id` is nullable, so most workspaces start with no lines at all — a
 * chart that only rendered nested people would show nothing for them.
 *
 * Guards against a reporting cycle even though `set_manager` rejects them, since
 * this would otherwise recurse until the stack ran out.
 */
function buildPeopleTree(members: DepartmentMemberSummary[]): PersonNode[] {
  const byDeveloper = new Map(members.map((m) => [m.developer_id, m]));
  const nodes = new Map<string, PersonNode>(
    members.map((m) => [m.developer_id, { member: m, reports: [] }])
  );

  const hasCycle = (id: string): boolean => {
    const seen = new Set<string>();
    let cursor: string | null | undefined = id;
    while (cursor) {
      if (seen.has(cursor)) return true;
      seen.add(cursor);
      cursor = byDeveloper.get(cursor)?.manager_id;
    }
    return false;
  };

  const roots: PersonNode[] = [];
  for (const member of members) {
    const node = nodes.get(member.developer_id)!;
    const parent =
      member.manager_id && member.manager_id !== member.developer_id && !hasCycle(member.developer_id)
        ? nodes.get(member.manager_id)
        : undefined;
    if (parent) parent.reports.push(node);
    else roots.push(node);
  }

  const sort = (list: PersonNode[]) => {
    list.sort(
      (a, b) =>
        ROLE_ORDER[a.member.role_in_department] - ROLE_ORDER[b.member.role_in_department] ||
        (a.member.name || a.member.email || "").localeCompare(b.member.name || b.member.email || "")
    );
    list.forEach((n) => sort(n.reports));
  };
  sort(roots);

  return roots;
}

function PersonRow({ node, depth = 0 }: { node: PersonNode; depth?: number }) {
  const t = useTranslations("organization");
  const { member } = node;
  const isLead = member.role_in_department !== "member";

  return (
    <li>
      <div className="flex items-center gap-2 py-1">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium",
            isLead ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          )}
        >
          {(member.name || member.email || "?").trim().charAt(0).toUpperCase() || (
            <UserRound className="h-3 w-3" />
          )}
        </span>
        <span className="truncate text-sm text-foreground">{member.name || member.email}</span>
        {isLead && (
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
            {/* Reuses the role labels the members dialog already ships. */}
            {t(`members.roles.${member.role_in_department}`)}
          </Badge>
        )}
        {member.allocation_percent < 100 && (
          <span className="text-[10px] text-muted-foreground">{member.allocation_percent}%</span>
        )}
      </div>
      {node.reports.length > 0 && (
        <ul className="ml-3 border-l border-border pl-3">
          {node.reports.map((child) => (
            <PersonRow key={child.member.developer_id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function DeptNode({ node }: { node: DepartmentNode }) {
  const t = useTranslations("organization");
  const people = useMemo(() => buildPeopleTree(node.members ?? []), [node.members]);

  return (
    <div className="ml-0">
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 px-3 py-2">
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium">{node.name}</span>
          {node.function_key && (
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              {node.function_key}
            </Badge>
          )}
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {t("chart.members", { count: node.member_count })}
          </span>
        </div>

        {/* The people, nested by reporting line. A department with members but no
            reporting lines yet renders them as one flat level, which is honest —
            it is what the data says. */}
        {people.length > 0 ? (
          <ul className="border-t border-border px-3 py-2">
            {people.map((person) => (
              <PersonRow key={person.member.developer_id} node={person} />
            ))}
          </ul>
        ) : (
          <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            {t("chart.noMembers")}
          </p>
        )}
      </div>

      {node.children.length > 0 && (
        <div className="ml-4 mt-2 space-y-2 border-l border-border pl-4">
          {node.children.map((child) => (
            <DeptNode key={child.id} node={child} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300">
        {icon}
      </div>
      <div>
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export default function OrganizationPage() {
  const t = useTranslations("organization");
  const { data: chart, isLoading } = useOrgChart();

  const stats = useMemo(() => {
    const all = flatten(chart ?? []);
    return {
      departments: all.length,
      people: all.reduce((s, d) => s + d.member_count, 0),
      planned: all.reduce((s, d) => s + (d.headcount_planned ?? 0), 0),
    };
  }, [chart]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link
          href="/organization/departments"
          className="text-sm font-medium text-primary hover:underline"
        >
          {t("tabs.departments")} <ChevronRight className="inline h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile icon={<Building2 className="h-5 w-5" />} value={stats.departments} label={t("stats.departments")} />
        <StatTile icon={<Users className="h-5 w-5" />} value={stats.people} label={t("stats.people")} />
        <StatTile icon={<Network className="h-5 w-5" />} value={stats.planned} label={t("stats.plannedHeadcount")} />
      </div>

      <Card className="p-4">
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground">{t("chart.title")}</h2>
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : !chart || chart.length === 0 ? (
          <EmptyState icon={Network} title={t("chart.title")} description={t("chart.empty")} />
        ) : (
          <div className="space-y-2">
            {chart.map((node) => (
              <DeptNode key={node.id} node={node} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
