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
      <div className="flex min-w-0 items-center gap-2.5 rounded-md py-1.5 pr-1 transition-colors hover:bg-muted/60">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            isLead ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          )}
        >
          {(member.name || member.email || "?").trim().charAt(0).toUpperCase() || (
            <UserRound className="h-3.5 w-3.5" />
          )}
        </span>
        {/* min-w-0 on the name, not on the badges: a truncated name is still a
            name, a truncated "MANAGER" is noise. */}
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
          {member.name || member.email}
        </span>
        {member.allocation_percent < 100 && (
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {member.allocation_percent}%
          </span>
        )}
        {isLead && (
          <Badge variant="secondary" className="shrink-0 text-[10px] uppercase tracking-wide">
            {/* Reuses the role labels the members dialog already ships. */}
            {t(`members.roles.${member.role_in_department}`)}
          </Badge>
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

  const isEmpty = people.length === 0;

  return (
    <div>
      {/*
        An empty department is drawn quieter than a staffed one. Three of the
        six here have nobody in them, and as full-weight cards they took the
        same visual space as Tech's eight people while carrying one line of
        grey text — half the chart reading as placeholder.
      */}
      <div
        className={cn(
          "overflow-hidden rounded-lg border",
          isEmpty ? "border-dashed border-border/70 bg-transparent" : "border-border bg-card"
        )}
      >
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate font-medium">{node.name}</span>
          {node.function_key && (
            <Badge variant="secondary" className="shrink-0 text-[10px] uppercase tracking-wide">
              {node.function_key}
            </Badge>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
            <Users className="h-3 w-3" />
            {t("chart.members", { count: node.member_count })}
          </span>
        </div>

        {/* The people, nested by reporting line. A department with members but no
            reporting lines yet renders them as one flat level, which is honest —
            it is what the data says. */}
        {!isEmpty && (
          <ul className="border-t border-border px-3 py-1.5">
            {people.map((person) => (
              <PersonRow key={person.member.developer_id} node={person} />
            ))}
          </ul>
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
    /*
      max-w-7xl, not 5xl. This is a directory, not a form: at 1024px the six
      departments stacked into one column down the middle of a 1344px content
      area, so the page was a long scroll with a third of the viewport empty on
      either side. The grid below is what actually uses the width.
    */
    <div className="mx-auto max-w-7xl space-y-6 p-6">
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

      <section>
        {/* A plain heading, not a Card. Wrapping a list of bordered cards in
            another bordered card drew a box around boxes and bought nothing. */}
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t("chart.title")}</h2>
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : !chart || chart.length === 0 ? (
          <Card className="p-4">
            <EmptyState icon={Network} title={t("chart.title")} description={t("chart.empty")} />
          </Card>
        ) : (
          /*
            Columns, not one stack. `items-start` so a two-person department
            keeps its own height instead of being stretched to match an
            eight-person one — the same rule the dashboard widgets now follow.
            Each cell holds a whole top-level department, so a sub-department
            still nests under its parent rather than being split across columns.
          */
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            {chart.map((node) => (
              <DeptNode key={node.id} node={node} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
