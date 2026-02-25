"use client";

import { useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Building2,
  Search,
  Filter,
  Users,
  Crown,
} from "lucide-react";
import { useAdminWorkspaces } from "@/hooks/useAdmin";
import { formatDistanceToNow } from "date-fns";
import { AdminWorkspace } from "@/lib/api";
import { DataTable, DataTableColumn } from "@/components/ui/data-table";

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) {
    return <span className="text-muted-foreground text-xs">-</span>;
  }

  const config: Record<string, string> = {
    free: "bg-muted text-foreground",
    pro: "bg-blue-500/20 text-blue-400",
    enterprise: "bg-amber-500/20 text-amber-400",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
        config[tier] || config.free
      }`}
    >
      {tier === "enterprise" && <Crown className="h-3 w-3" />}
      {tier.charAt(0).toUpperCase() + tier.slice(1)}
    </span>
  );
}

const TIER_OPTIONS = [
  { value: "", label: "All Tiers" },
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "enterprise", label: "Enterprise" },
];

export default function AdminWorkspacesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [planTier, setPlanTier] = useState(searchParams.get("tier") || "");
  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1"));

  const { data, isLoading, error, refetch } = useAdminWorkspaces({
    page,
    per_page: 25,
    plan_tier: planTier || undefined,
    search: search || undefined,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (planTier) params.set("tier", planTier);
    router.push(`/admin/workspaces?${params.toString()}`);
  };

  const handleTierChange = (value: string) => {
    setPlanTier(value);
    setPage(1);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (value) params.set("tier", value);
    router.push(`/admin/workspaces?${params.toString()}`);
  };

  const columns = useMemo<DataTableColumn<AdminWorkspace>[]>(
    () => [
      {
        id: "workspace",
        header: "Workspace",
        sortable: true,
        sortValue: (row) => row.name.toLowerCase(),
        cell: (row) => (
          <div>
            <p className="text-foreground font-medium">{row.name}</p>
            <p className="text-muted-foreground text-xs">/{row.slug}</p>
          </div>
        ),
      },
      {
        id: "plan",
        header: "Plan",
        sortable: true,
        sortValue: (row) => row.plan_tier || "",
        cell: (row) => <TierBadge tier={row.plan_tier} />,
      },
      {
        id: "owner",
        header: "Owner",
        sortable: true,
        sortValue: (row) =>
          (row.owner_name || row.owner_email || "").toLowerCase(),
        cell: (row) => (
          <div>
            <p className="text-foreground">
              {row.owner_name || row.owner_email}
            </p>
            {row.owner_name && (
              <p className="text-muted-foreground text-xs">
                {row.owner_email}
              </p>
            )}
          </div>
        ),
      },
      {
        id: "members",
        header: "Members",
        sortable: true,
        sortValue: (row) => row.member_count,
        cell: (row) => (
          <span className="text-foreground flex items-center gap-1">
            <Users className="h-4 w-4 text-muted-foreground" />
            {row.member_count}
          </span>
        ),
      },
      {
        id: "type",
        header: "Type",
        sortable: true,
        sortValue: (row) => row.type,
        cell: (row) => (
          <span className="text-muted-foreground text-xs px-2 py-0.5 bg-accent rounded">
            {row.type}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        sortable: true,
        sortValue: (row) => (row.is_active ? 1 : 0),
        cell: (row) =>
          row.is_active ? (
            <span className="text-emerald-400 text-xs">Active</span>
          ) : (
            <span className="text-red-400 text-xs">Inactive</span>
          ),
      },
      {
        id: "created",
        header: "Created",
        sortable: true,
        sortValue: (row) => new Date(row.created_at).getTime(),
        cell: (row) => (
          <span
            className="text-muted-foreground text-sm"
            title={row.created_at}
          >
            {formatDistanceToNow(new Date(row.created_at), {
              addSuffix: true,
            })}
          </span>
        ),
      },
    ],
    []
  );

  const totalPages = data ? Math.ceil(data.total / 25) : undefined;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <Building2 className="h-7 w-7 text-emerald-400" />
            Workspaces
          </h1>
          <p className="text-muted-foreground mt-1">View all platform workspaces</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-2 bg-muted border border-border rounded-lg text-foreground hover:text-foreground hover:bg-accent transition"
        >
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <form onSubmit={handleSearch} className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or slug..."
              className="w-full pl-10 pr-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
            />
          </div>
        </form>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={planTier}
            onChange={(e) => handleTierChange(e.target.value)}
            className="bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-blue-500"
          >
            {TIER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {error ? (
        <div className="bg-muted rounded-xl border border-border flex items-center justify-center h-64 text-red-400">
          <Building2 className="h-5 w-5 mr-2" />
          Failed to load workspaces
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          skeletonRows={8}
          emptyIcon={<Building2 className="h-12 w-12" />}
          emptyTitle="No workspaces found"
          currentPage={page}
          totalPages={totalPages}
          totalItems={data?.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
