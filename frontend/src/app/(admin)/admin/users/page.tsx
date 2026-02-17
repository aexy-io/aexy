"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Users,
  Loader2,
  AlertCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  Building2,
  Github,
  Chrome,
} from "lucide-react";
import { useAdminUsers } from "@/hooks/useAdmin";
import { formatDistanceToNow } from "date-fns";
import { AdminUser } from "@/lib/api";

function UserRow({ user }: { user: AdminUser }) {
  return (
    <tr className="border-b border-border hover:bg-muted/50">
      <td className="px-4 py-3">
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
      </td>
      <td className="px-4 py-3">
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
      </td>
      <td className="px-4 py-3">
        <span className="text-foreground flex items-center gap-1">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          {user.workspace_count}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="text-muted-foreground text-sm" title={user.created_at}>
          {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
        </span>
      </td>
    </tr>
  );
}

export default function AdminUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1"));

  const { data, isLoading, error, refetch } = useAdminUsers({
    page,
    per_page: 25,
    search: search || undefined,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    router.push(`/admin/users?${params.toString()}`);
  };

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

      {/* Table */}
      <div className="bg-muted rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64 text-red-400">
            <AlertCircle className="h-5 w-5 mr-2" />
            Failed to load users
          </div>
        ) : data?.items?.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Users className="h-12 w-12 mb-3 text-muted-foreground" />
            <p>No users found</p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-background/50">
                <tr className="text-left text-muted-foreground text-sm">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Connections</th>
                  <th className="px-4 py-3 font-medium">Workspaces</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {data?.items?.map((user) => (
                  <UserRow key={user.id} user={user} />
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {data && data.total > 25 && (
              <div className="px-4 py-3 border-t border-border flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  Showing {(page - 1) * 25 + 1} - {Math.min(page * 25, data.total)} of{" "}
                  {data.total} users
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 rounded-lg bg-accent text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-foreground px-3">Page {page}</span>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!data.has_next}
                    className="p-2 rounded-lg bg-accent text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted"
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
