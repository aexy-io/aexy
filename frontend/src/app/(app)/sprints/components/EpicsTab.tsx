"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  CheckCircle,
  Flag,
  Layers,
  Plus,
  Search,
  Target,
  Users,
} from "lucide-react";
import { useEpics } from "@/hooks/useEpics";
import { EpicListItem, EpicStatus, EpicPriority } from "@/lib/api";

const STATUS_COLORS: Record<EpicStatus, { bg: string; text: string; border: string }> = {
  open: { bg: "bg-slate-700/50", text: "text-slate-300", border: "border-slate-600" },
  in_progress: { bg: "bg-blue-900/30", text: "text-blue-400", border: "border-blue-800/50" },
  done: { bg: "bg-green-900/30", text: "text-green-400", border: "border-green-800/50" },
  cancelled: { bg: "bg-red-900/30", text: "text-red-400", border: "border-red-800/50" },
};

const PRIORITY_COLORS: Record<EpicPriority, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-400",
  low: "text-slate-400",
};

function EpicCard({ epic }: { epic: EpicListItem }) {
  const statusStyle = STATUS_COLORS[epic.status];
  const progress = epic.progress_percentage;

  return (
    <Link
      href={`/sprints/epics/${epic.id}`}
      className="block bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden hover:border-slate-700 transition group"
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: epic.color }}
            />
            <span className="text-slate-400 text-sm font-mono">{epic.key}</span>
          </div>
          <div className={`px-2 py-0.5 rounded text-xs font-medium ${statusStyle.bg} ${statusStyle.text} border ${statusStyle.border}`}>
            {epic.status.replace("_", " ")}
          </div>
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-white mb-2 line-clamp-2">
          {epic.title}
        </h3>

        {/* Priority & Owner */}
        <div className="flex items-center gap-4 mb-4 text-sm">
          <div className="flex items-center gap-1.5">
            <Flag className={`h-4 w-4 ${PRIORITY_COLORS[epic.priority]}`} />
            <span className="text-slate-400 capitalize">{epic.priority}</span>
          </div>
          {epic.owner_name && (
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-slate-500" />
              <span className="text-slate-400">{epic.owner_name}</span>
            </div>
          )}
        </div>

        {/* Progress */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-slate-400">Progress</span>
            <span className="text-white font-medium">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progress}%`,
                backgroundColor: epic.color,
              }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5 text-slate-400">
            <CheckCircle className="h-4 w-4" />
            <span>
              {epic.completed_tasks}/{epic.total_tasks} tasks
            </span>
          </div>
          {epic.target_date && (
            <div className="flex items-center gap-1.5 text-slate-400">
              <Calendar className="h-4 w-4" />
              <span>
                {new Date(epic.target_date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function CreateEpicModal({
  isOpen,
  onClose,
  onCreate,
  isCreating,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: { title: string; description?: string; priority?: EpicPriority; color?: string }) => Promise<void>;
  isCreating: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<EpicPriority>("medium");
  const [color, setColor] = useState("#6366F1");

  const colors = [
    "#6366F1", "#8B5CF6", "#EC4899", "#EF4444", "#F97316",
    "#EAB308", "#22C55E", "#14B8A6", "#06B6D4", "#3B82F6",
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    await onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      color,
    });

    setTitle("");
    setDescription("");
    setPriority("medium");
    setColor("#6366F1");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg">
        <div className="p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">Create Epic</h2>
          <p className="text-slate-400 text-sm mt-1">
            Epics group related tasks across sprints and teams
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., User Authentication System"
              className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the epic's goals and scope..."
              rows={3}
              className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as EpicPriority)}
              className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Color</label>
            <div className="flex gap-2 flex-wrap">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-lg transition ${
                    color === c ? "ring-2 ring-white ring-offset-2 ring-offset-slate-800" : ""
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isCreating}
              className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition font-medium"
            >
              {isCreating ? "Creating..." : "Create Epic"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface EpicsTabProps {
  workspaceId: string | null;
  hasWorkspaces: boolean;
}

export function EpicsTab({ workspaceId, hasWorkspaces }: EpicsTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<EpicStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<EpicPriority | "">("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const {
    epics,
    isLoading: epicsLoading,
    createEpic,
    isCreating,
  } = useEpics(workspaceId, {
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    search: searchQuery || undefined,
  });

  const handleCreateEpic = async (data: { title: string; description?: string; priority?: EpicPriority; color?: string }) => {
    await createEpic(data);
  };

  // Group epics by status
  const epicsByStatus = {
    open: epics.filter((e) => e.status === "open"),
    in_progress: epics.filter((e) => e.status === "in_progress"),
    done: epics.filter((e) => e.status === "done"),
    cancelled: epics.filter((e) => e.status === "cancelled"),
  };

  if (!hasWorkspaces) {
    return (
      <div className="bg-slate-900/50 rounded-xl p-12 text-center border border-slate-800">
        <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Layers className="h-10 w-10 text-slate-600" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">No Workspace Yet</h3>
        <p className="text-slate-400 mb-6 max-w-md mx-auto">
          Create a workspace to start tracking epics.
        </p>
        <Link
          href="/settings/organization"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition font-medium shadow-lg shadow-primary-500/20"
        >
          <Plus className="h-4 w-4" />
          Create Workspace
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search epics..."
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as EpicStatus | "")}
          className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as EpicPriority | "")}
          className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Create Epic
        </button>
      </div>

      {/* Epic Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4 hover:border-slate-700 transition">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-slate-700/50 rounded-lg">
              <Target className="h-4 w-4 text-slate-400" />
            </div>
            <span className="text-slate-400 text-sm">Open</span>
          </div>
          <div className="text-2xl font-bold text-white">{epicsByStatus.open.length}</div>
        </div>
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4 hover:border-slate-700 transition">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-blue-500/10 rounded-lg">
              <ArrowRight className="h-4 w-4 text-blue-400" />
            </div>
            <span className="text-blue-400 text-sm">In Progress</span>
          </div>
          <div className="text-2xl font-bold text-white">{epicsByStatus.in_progress.length}</div>
        </div>
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4 hover:border-slate-700 transition">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-green-500/10 rounded-lg">
              <CheckCircle className="h-4 w-4 text-green-400" />
            </div>
            <span className="text-green-400 text-sm">Done</span>
          </div>
          <div className="text-2xl font-bold text-white">{epicsByStatus.done.length}</div>
        </div>
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4 hover:border-slate-700 transition">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-purple-500/10 rounded-lg">
              <Layers className="h-4 w-4 text-purple-400" />
            </div>
            <span className="text-slate-400 text-sm">Total Epics</span>
          </div>
          <div className="text-2xl font-bold text-white">{epics.length}</div>
        </div>
      </div>

      {/* Epic Grid */}
      {epicsLoading ? (
        <div className="flex justify-center py-12">
          <div className="relative">
            <div className="w-10 h-10 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
        </div>
      ) : epics.length === 0 ? (
        <div className="bg-slate-900/50 rounded-xl p-12 text-center border border-slate-800">
          <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Layers className="h-10 w-10 text-slate-600" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No Epics Yet</h3>
          <p className="text-slate-400 mb-6 max-w-md mx-auto">
            Create your first epic to start tracking large initiatives.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition font-medium shadow-lg shadow-primary-500/20"
          >
            <Plus className="h-4 w-4" />
            Create Epic
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {epics.map((epic) => (
            <EpicCard key={epic.id} epic={epic} />
          ))}
        </div>
      )}

      {/* Create Epic Modal */}
      <CreateEpicModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateEpic}
        isCreating={isCreating}
      />
    </>
  );
}
