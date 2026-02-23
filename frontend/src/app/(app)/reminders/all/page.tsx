"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useReminders } from "@/hooks/useReminders";
import { ReminderCard } from "@/components/reminders/shared";
import { ReminderStatus, ReminderCategory, ReminderPriority } from "@/lib/api";

const STATUS_TABS: { label: string; value: ReminderStatus | undefined }[] = [
  { label: "All", value: undefined },
  { label: "Active", value: "active" },
  { label: "Paused", value: "paused" },
  { label: "Archived", value: "archived" },
];

const CATEGORIES: { label: string; value: ReminderCategory }[] = [
  { label: "Compliance", value: "compliance" },
  { label: "Security", value: "security" },
  { label: "Audit", value: "audit" },
  { label: "Review", value: "review" },
  { label: "Training", value: "training" },
  { label: "Maintenance", value: "maintenance" },
  { label: "Reporting", value: "reporting" },
  { label: "Custom", value: "custom" },
];

const PRIORITIES: { label: string; value: ReminderPriority }[] = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Critical", value: "critical" },
];

export default function AllRemindersPage() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const [status, setStatus] = useState<ReminderStatus | undefined>(undefined);
  const [category, setCategory] = useState<ReminderCategory | undefined>(undefined);
  const [priority, setPriority] = useState<ReminderPriority | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { reminders, total, isLoading, deleteReminder, updateReminder } = useReminders(
    workspaceId,
    { status, category, priority, search, page, pageSize }
  );

  const totalPages = Math.ceil(total / pageSize);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }, [searchInput]);

  const clearFilters = () => {
    setStatus(undefined);
    setCategory(undefined);
    setPriority(undefined);
    setSearch("");
    setSearchInput("");
    setPage(1);
  };

  const hasFilters = status !== undefined || category !== undefined || priority !== undefined || search !== "";

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/reminders"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Reminders
          </Link>
          <span className="text-border">/</span>
          <h1 className="text-xl font-bold text-foreground">All Reminders</h1>
        </div>
        <Link
          href="/reminders/new"
          className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New Reminder
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-lg border border-border p-4 mb-6 space-y-4">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search reminders..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90"
          >
            Search
          </button>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <X className="h-4 w-4" />
              Clear
            </button>
          )}
        </form>

        {/* Category & Priority */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Filter:</span>
          </div>
          <select
            value={category ?? ""}
            onChange={(e) => { setCategory(e.target.value as ReminderCategory || undefined); setPage(1); }}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <select
            value={priority ?? ""}
            onChange={(e) => { setPriority(e.target.value as ReminderPriority || undefined); setPage(1); }}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.label}
            onClick={() => { setStatus(tab.value); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              status === tab.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Loading..." : `${total} reminder${total !== 1 ? "s" : ""} found`}
        </p>
        {totalPages > 1 && (
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : reminders.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-16 text-center">
          <Bell className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            No reminders found
          </h3>
          <p className="text-muted-foreground mb-6">
            {hasFilters
              ? "Try adjusting your filters or search query."
              : "Create your first reminder to start tracking compliance tasks."}
          </p>
          {!hasFilters && (
            <Link
              href="/reminders/new"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Create Reminder
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {reminders.map((reminder) => (
            <ReminderCard
              key={reminder.id}
              reminder={reminder}
              showActions={true}
              onClick={() => router.push(`/reminders/${reminder.id}`)}
              onEdit={() => router.push(`/reminders/${reminder.id}`)}
              onDelete={() => deleteReminder(reminder.id)}
              onPause={() => updateReminder({ reminderId: reminder.id, data: { status: "paused" } })}
              onResume={() => updateReminder({ reminderId: reminder.id, data: { status: "active" } })}
              onArchive={() => updateReminder({ reminderId: reminder.id, data: { status: "archived" } })}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <div className="flex gap-1">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const pageNum =
                totalPages <= 7
                  ? i + 1
                  : page <= 4
                  ? i + 1
                  : page >= totalPages - 3
                  ? totalPages - 6 + i
                  : page - 3 + i;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-9 h-9 text-sm rounded-lg ${
                    pageNum === page
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-foreground bg-card border border-border hover:bg-accent"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
