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
    <tr className="border-b border-slate-700 hover:bg-slate-800/50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.name || user.email}
              className="h-8 w-8 rounded-full"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center">
              <span className="text-slate-400 text-sm">
                {(user.name || user.email).charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div>
            <p className="text-white">{user.name || "-"}</p>
            <p className="text-slate-500 text-xs">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {user.has_github && (
            <span className="text-slate-300" title="GitHub connected">
              <Github className="h-4 w-4" />
            </span>
          )}
          {user.has_google && (
            <span className="text-slate-300" title="Google connected">
              <Chrome className="h-4 w-4" />
            </span>
          )}
          {!user.has_github && !user.has_google && (
            <span className="text-slate-600 text-xs">-</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-slate-300 flex items-center gap-1">
          <Building2 className="h-4 w-4 text-slate-500" />
          {user.workspace_count}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="text-slate-400 text-sm" title={user.created_at}>
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
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Users className="h-7 w-7 text-amber-400" />
            Users
          </h1>
          <p className="text-slate-400 mt-1">View all platform users</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition"
        >
          Refresh
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email or name..."
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </form>

      {/* Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
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
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <Users className="h-12 w-12 mb-3 text-slate-600" />
            <p>No users found</p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-slate-900/50">
                <tr className="text-left text-slate-400 text-sm">
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
              <div className="px-4 py-3 border-t border-slate-700 flex items-center justify-between">
                <span className="text-slate-400 text-sm">
                  Showing {(page - 1) * 25 + 1} - {Math.min(page * 25, data.total)} of{" "}
                  {data.total} users
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
