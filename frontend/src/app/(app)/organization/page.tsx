"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Building2, Network, Users, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { useOrgChart } from "@/hooks/useOrganization";
import { DepartmentNode } from "@/lib/organization-api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/EmptyState";

function flatten(nodes: DepartmentNode[]): DepartmentNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}

function DeptNode({ node }: { node: DepartmentNode }) {
  const t = useTranslations("organization");
  return (
    <div className="ml-0">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
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
