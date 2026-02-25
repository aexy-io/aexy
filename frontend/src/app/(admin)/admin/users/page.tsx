"use client";

import { useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Users,
  AlertCircle,
  Search,
  Building2,
  Github,
  Chrome,
} from "lucide-react";
import { useAdminUsers } from "@/hooks/useAdmin";
import { formatDistanceToNow } from "date-fns";
import { AdminUser } from "@/lib/api";
import { DataTable, DataTableColumn } from "@/components/ui/data-table";

const PER_PAGE = 25;

export default function AdminUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1"));

  const { data, isLoading, error, refetch } = useAdminUsers({
    page,
    per_page: PER_PAGE,
    search: search || undefined,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    router.push(`/admin/users?${params.toString()}`);
  };

  const columns = useMemo<DataTableColumn<AdminUser>[]>(
    () => [
      {
        id: "user",
        header: "User",
        sortable: true,
        sortValue: (user) => (user.name || user.email).toLowerCase(),
        cell: (user) => (
          <div className="flex items-center gap-3">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.name || user.email}
                className="h-8 w-8 rounded-full"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center">
                <span className="text-muted-foreground text-sm">
                  {(user.name || user.email).charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <p className="text-foreground">{user.name || "-"}</p>
              <p className="text-muted-foreground text-xs">{user.email}</p>
            </div>
          </div>
        ),
      },
      {
        id: "connections",
        header: "Connections",
        cell: (user) => (
          <div className="flex items-center gap-2">
            {user.has_github && (
              <span className="text-foreground" title="GitHub connected">
                <Github className="h-4 w-4" />
              </span>
            )}
            {user.has_google && (
              <span className="text-foreground" title="Google connected">
                <Chrome className="h-4 w-4" />
              </span>
            )}
            {!user.has_github && !user.has_google && (
              <span className="text-muted-foreground text-xs">-</span>
            )}
          </div>
        ),
      },
      {
        id: "workspaces",
        header: "Workspaces",
        sortable: true,
        sortValue: (user) => user.workspace_count,
        cell: (user) => (
          <span className="text-foreground flex items-center gap-1">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            {user.workspace_count}
          </span>
        ),
      },
      {
        id: "joined",
        header: "Joined",
        sortable: true,
        sortValue: (user) => new Date(user.created_at).getTime(),
        cell: (user) => (
          <span className="text-muted-foreground text-sm" title={user.created_at}>
            {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
          </span>
        ),
      },
    ],
    []
  );

  const totalPages = data ? Math.ceil(data.total / PER_PAGE) : undefined;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <Users className="h-7 w-7 text-amber-400" />
            Users
          </h1>
          <p className="text-muted-foreground mt-1">View all platform users</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-2 bg-muted border border-border rounded-lg text-foreground hover:text-foreground hover:bg-accent transition"
        >
          Refresh
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email or name..."
            className="w-full pl-10 pr-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
          />
        </div>
      </form>

      {/* Error state */}
      {error ? (
        <div className="bg-muted rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-center h-64 text-red-400">
            <AlertCircle className="h-5 w-5 mr-2" />
            Failed to load users
          </div>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          rowKey={(user) => user.id}
          isLoading={isLoading}
          skeletonRows={8}
          emptyIcon={<Users className="h-12 w-12" />}
          emptyTitle="No users found"
          currentPage={page}
          totalPages={totalPages}
          totalItems={data?.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
