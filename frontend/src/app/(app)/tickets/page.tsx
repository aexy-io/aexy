"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Ticket,
  Filter,
  Search,
  AlertTriangle,
  Clock,
  CheckCircle2,
  User,
  ChevronRight,
  FileText,
  Settings,
  ListTodo,
  Layers,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTickets, useTicketStats, useTicketForms } from "@/hooks/useTicketing";
import { TicketStatus, TicketPriority, developerApi } from "@/lib/api";

const STATUS_COLORS: Record<TicketStatus, { bg: string; text: string; label: string }> = {
  new: { bg: "bg-blue-900/30", text: "text-blue-400", label: "New" },
  acknowledged: { bg: "bg-purple-900/30", text: "text-purple-400", label: "Acknowledged" },
  in_progress: { bg: "bg-yellow-900/30", text: "text-yellow-400", label: "In Progress" },
  waiting_on_submitter: { bg: "bg-orange-900/30", text: "text-orange-400", label: "Waiting" },
  resolved: { bg: "bg-green-900/30", text: "text-green-400", label: "Resolved" },
  closed: { bg: "bg-slate-700/50", text: "text-slate-400", label: "Closed" },
};

const PRIORITY_COLORS: Record<TicketPriority, { bg: string; text: string }> = {
  low: { bg: "bg-slate-700", text: "text-slate-300" },
  medium: { bg: "bg-blue-900/30", text: "text-blue-400" },
  high: { bg: "bg-orange-900/30", text: "text-orange-400" },
  urgent: { bg: "bg-red-900/30", text: "text-red-400" },
};

const TASK_STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  backlog: { bg: "bg-slate-700/50", text: "text-slate-400", label: "Backlog" },
  todo: { bg: "bg-blue-900/30", text: "text-blue-400", label: "To Do" },
  in_progress: { bg: "bg-yellow-900/30", text: "text-yellow-400", label: "In Progress" },
  review: { bg: "bg-purple-900/30", text: "text-purple-400", label: "Review" },
  done: { bg: "bg-green-900/30", text: "text-green-400", label: "Done" },
};

type TabType = "tickets" | "my-tasks";

export default function TicketsPage() {
  const router = useRouter();
  useAuth(); // Ensure user is authenticated
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const [activeTab, setActiveTab] = useState<TabType>("my-tasks");
  const [statusFilter, setStatusFilter] = useState<TicketStatus[]>([]);
  const [priorityFilter] = useState<TicketPriority[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const { tickets, total, isLoading } = useTickets(workspaceId, {
    status: statusFilter.length > 0 ? statusFilter : undefined,
    priority: priorityFilter.length > 0 ? priorityFilter : undefined,
  });

  const { stats } = useTicketStats(workspaceId);
  const { forms } = useTicketForms(workspaceId);

  // Fetch my assigned sprint tasks
  const { data: myTasks = [], isLoading: isLoadingTasks } = useQuery({
    queryKey: ["myAssignedTasks"],
    queryFn: () => developerApi.getMyAssignedTasks(),
  });

  const filteredTickets = tickets.filter((ticket) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      ticket.submitter_email?.toLowerCase().includes(query) ||
      ticket.submitter_name?.toLowerCase().includes(query) ||
      ticket.form_name?.toLowerCase().includes(query) ||
      `TKT-${ticket.ticket_number}`.toLowerCase().includes(query)
    );
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-slate-950">
<main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <Ticket className="h-8 w-8 text-purple-400" />
                My Work
              </h1>
              <p className="text-slate-400 mt-2">
                Track your assigned tasks and incoming tickets
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push("/settings/ticket-forms")}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition border border-slate-700"
              >
                <Settings className="h-4 w-4" />
                Manage Forms
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("my-tasks")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
              activeTab === "my-tasks"
                ? "bg-purple-600 text-white"
                : "bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700"
            }`}
          >
            <ListTodo className="h-4 w-4" />
            My Assigned Tasks
            {myTasks.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === "my-tasks" ? "bg-purple-500" : "bg-slate-700"
              }`}>
                {myTasks.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("tickets")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
              activeTab === "tickets"
                ? "bg-purple-600 text-white"
                : "bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700"
            }`}
          >
            <Ticket className="h-4 w-4" />
            Form Tickets
            {(stats?.open_tickets || 0) > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === "tickets" ? "bg-purple-500" : "bg-slate-700"
              }`}>
                {stats?.open_tickets}
              </span>
            )}
          </button>
        </div>

        {/* My Assigned Tasks Tab */}
        {activeTab === "my-tasks" && (
          <>
            {/* Tasks Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-900/30">
                    <ListTodo className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">{myTasks.length}</p>
                    <p className="text-sm text-slate-400">Assigned Tasks</p>
                  </div>
                </div>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-yellow-900/30">
                    <Clock className="h-5 w-5 text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">
                      {myTasks.filter(t => t.status === "in_progress").length}
                    </p>
                    <p className="text-sm text-slate-400">In Progress</p>
                  </div>
                </div>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-900/30">
                    <Layers className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">
                      {myTasks.filter(t => t.status === "backlog" || t.status === "todo").length}
                    </p>
                    <p className="text-sm text-slate-400">To Do</p>
                  </div>
                </div>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-900/30">
                    <CheckCircle2 className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">
                      {myTasks.filter(t => t.status === "review").length}
                    </p>
                    <p className="text-sm text-slate-400">In Review</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tasks List */}
            <div className="bg-slate-800 rounded-xl border border-slate-700">
              {isLoadingTasks ? (
                <div className="p-8 text-center text-slate-400">Loading tasks...</div>
              ) : myTasks.length === 0 ? (
                <div className="p-8 text-center">
                  <ListTodo className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">No tasks assigned to you</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Tasks assigned to you from sprints will appear here
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-700">
                  {myTasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => {
                        if (task.sprint_id) {
                          // Navigate to the sprint board - we need to find the project ID
                          // For now, just show task details in a simple way
                          router.push(`/sprints`);
                        }
                      }}
                      className="w-full p-4 hover:bg-slate-700/50 transition flex items-center gap-4 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              TASK_STATUS_COLORS[task.status]?.bg || "bg-slate-700"
                            } ${TASK_STATUS_COLORS[task.status]?.text || "text-slate-300"}`}
                          >
                            {TASK_STATUS_COLORS[task.status]?.label || task.status}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              PRIORITY_COLORS[task.priority as TicketPriority]?.bg || "bg-slate-700"
                            } ${PRIORITY_COLORS[task.priority as TicketPriority]?.text || "text-slate-300"}`}
                          >
                            {task.priority}
                          </span>
                          {task.story_points && (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-300">
                              {task.story_points} pts
                            </span>
                          )}
                        </div>
                        <p className="text-white font-medium truncate">{task.title}</p>
                        <p className="text-sm text-slate-400">
                          {task.sprint_name || "No Sprint"} • {formatDate(task.created_at)}
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-slate-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Form Tickets Tab */}
        {activeTab === "tickets" && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-900/30">
                    <Ticket className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">{stats?.total_tickets || 0}</p>
                    <p className="text-sm text-slate-400">Total Tickets</p>
                  </div>
                </div>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-900/30">
                    <Clock className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">{stats?.open_tickets || 0}</p>
                    <p className="text-sm text-slate-400">Open Tickets</p>
                  </div>
                </div>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-900/30">
                    <AlertTriangle className="h-5 w-5 text-red-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">{stats?.sla_breached || 0}</p>
                    <p className="text-sm text-slate-400">SLA Breached</p>
                  </div>
                </div>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-900/30">
                    <FileText className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">{forms.length}</p>
                    <p className="text-sm text-slate-400">Active Forms</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 mb-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search tickets..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-slate-400" />
                  <span className="text-sm text-slate-400">Status:</span>
                  <div className="flex gap-1">
                    {(["new", "in_progress", "waiting_on_submitter", "resolved"] as TicketStatus[]).map((status) => (
                      <button
                        key={status}
                        onClick={() => {
                          setStatusFilter((prev) =>
                            prev.includes(status)
                              ? prev.filter((s) => s !== status)
                              : [...prev, status]
                          );
                        }}
                        className={`px-2 py-1 rounded text-xs font-medium transition ${
                          statusFilter.includes(status)
                            ? `${STATUS_COLORS[status].bg} ${STATUS_COLORS[status].text}`
                            : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                        }`}
                      >
                        {STATUS_COLORS[status].label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Tickets List */}
            <div className="bg-slate-800 rounded-xl border border-slate-700">
              {isLoading ? (
                <div className="p-8 text-center text-slate-400">Loading tickets...</div>
              ) : filteredTickets.length === 0 ? (
                <div className="p-8 text-center">
                  <Ticket className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">No tickets found</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Create a form to start receiving tickets
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-700">
                  {filteredTickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      onClick={() => router.push(`/tickets/${ticket.id}`)}
                      className="w-full p-4 hover:bg-slate-700/50 transition flex items-center gap-4 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-mono text-purple-400">
                            TKT-{ticket.ticket_number}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              STATUS_COLORS[ticket.status].bg
                            } ${STATUS_COLORS[ticket.status].text}`}
                          >
                            {STATUS_COLORS[ticket.status].label}
                          </span>
                          {ticket.priority && (
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                PRIORITY_COLORS[ticket.priority].bg
                              } ${PRIORITY_COLORS[ticket.priority].text}`}
                            >
                              {ticket.priority}
                            </span>
                          )}
                          {ticket.sla_breached && (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-900/30 text-red-400">
                              SLA Breached
                            </span>
                          )}
                        </div>
                        <p className="text-white font-medium truncate">
                          {ticket.submitter_name || ticket.submitter_email || "Anonymous"}
                        </p>
                        <p className="text-sm text-slate-400">
                          {ticket.form_name} • {formatDate(ticket.created_at)}
                        </p>
                      </div>
                      {ticket.assignee_name && (
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                          <User className="h-4 w-4" />
                          {ticket.assignee_name}
                        </div>
                      )}
                      <ChevronRight className="h-5 w-5 text-slate-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Pagination */}
            {total > 50 && (
              <div className="mt-4 flex justify-center">
                <p className="text-sm text-slate-400">
                  Showing {filteredTickets.length} of {total} tickets
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
