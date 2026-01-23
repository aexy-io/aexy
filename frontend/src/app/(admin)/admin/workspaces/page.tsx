"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Building2,
  Loader2,
  AlertCircle,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Users,
  Crown,
} from "lucide-react";
import { useAdminWorkspaces } from "@/hooks/useAdmin";
import { formatDistanceToNow } from "date-fns";
import { AdminWorkspace } from "@/lib/api";

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) {
    return <span className="text-slate-500 text-xs">-</span>;
  }

  const config: Record<string, string> = {
    free: "bg-slate-600 text-slate-300",
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

function WorkspaceRow({ workspace }: { workspace: AdminWorkspace }) {
  return (
    <tr className="border-b border-slate-700 hover:bg-slate-800/50">
      <td className="px-4 py-3">
        <div>
          <p className="text-white font-medium">{workspace.name}</p>
          <p className="text-slate-500 text-xs">/{workspace.slug}</p>
        </div>
      </td>
      <td className="px-4 py-3">
        <TierBadge tier={workspace.plan_tier} />
      </td>
      <td className="px-4 py-3">
        <div>
          <p className="text-slate-300">{workspace.owner_name || workspace.owner_email}</p>
          {workspace.owner_name && (
            <p className="text-slate-500 text-xs">{workspace.owner_email}</p>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-slate-300 flex items-center gap-1">
          <Users className="h-4 w-4 text-slate-500" />
          {workspace.member_count}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="text-slate-400 text-xs px-2 py-0.5 bg-slate-700 rounded">
          {workspace.type}
        </span>
      </td>
      <td className="px-4 py-3">
        {workspace.is_active ? (
          <span className="text-emerald-400 text-xs">Active</span>
        ) : (
          <span className="text-red-400 text-xs">Inactive</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-slate-400 text-sm" title={workspace.created_at}>
          {formatDistanceToNow(new Date(workspace.created_at), { addSuffix: true })}
        </span>
      </td>
    </tr>
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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Building2 className="h-7 w-7 text-emerald-400" />
            Workspaces
          </h1>
          <p className="text-slate-400 mt-1">View all platform workspaces</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition"
        >
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <form onSubmit={handleSearch} className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or slug..."
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </form>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={planTier}
            onChange={(e) => handleTierChange(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
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
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64 text-red-400">
            <AlertCircle className="h-5 w-5 mr-2" />
            Failed to load workspaces
          </div>
        ) : data?.items?.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <Building2 className="h-12 w-12 mb-3 text-slate-600" />
            <p>No workspaces found</p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-slate-900/50">
                <tr className="text-left text-slate-400 text-sm">
                  <th className="px-4 py-3 font-medium">Workspace</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Members</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {data?.items?.map((workspace) => (
                  <WorkspaceRow key={workspace.id} workspace={workspace} />
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {data && data.total > 25 && (
              <div className="px-4 py-3 border-t border-slate-700 flex items-center justify-between">
                <span className="text-slate-400 text-sm">
                  Showing {(page - 1) * 25 + 1} - {Math.min(page * 25, data.total)} of{" "}
                  {data.total} workspaces
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 rounded-lg bg-slate-700 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-slate-300 px-3">Page {page}</span>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!data.has_next}
                    className="p-2 rounded-lg bg-slate-700 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
