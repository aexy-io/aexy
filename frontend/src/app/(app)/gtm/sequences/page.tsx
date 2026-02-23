"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Play,
  Pause,
  Trash2,
  Plus,
  Loader2,
  RefreshCw,
  Mail,
  Linkedin,
  MessageSquare,
  Clock,
  Users,
  CheckCircle2,
  Reply,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useOutreachSequences, useSequenceMutations } from "@/hooks/useGTM";
import { OutreachSequence } from "@/lib/api";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  paused: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  archived: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  email: <Mail className="w-3.5 h-3.5" />,
  linkedin: <Linkedin className="w-3.5 h-3.5" />,
  sms: <MessageSquare className="w-3.5 h-3.5" />,
  wait: <Clock className="w-3.5 h-3.5" />,
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_STYLES[status] || STATUS_STYLES.draft}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function SequenceCard({
  sequence,
  onActivate,
  onPause,
  onDelete,
}: {
  sequence: OutreachSequence;
  onActivate: () => void;
  onPause: () => void;
  onDelete: () => void;
}) {
  const channels = [...new Set(sequence.steps.map((s) => s.channel))];
  const totalSteps = sequence.steps.length;
  const replyRate =
    sequence.enrolled_count > 0
      ? ((sequence.replied_count / sequence.enrolled_count) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-white/20 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <Link
            href={`/gtm/sequences/${sequence.id}`}
            className="text-white font-semibold hover:text-indigo-400 transition-colors"
          >
            {sequence.name}
          </Link>
          {sequence.description && (
            <p className="text-sm text-zinc-400 mt-1 line-clamp-1">
              {sequence.description}
            </p>
          )}
        </div>
        <StatusBadge status={sequence.status} />
      </div>

      {/* Channel badges */}
      <div className="flex items-center gap-2 mb-4">
        {channels.map((ch) => (
          <span
            key={ch}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/5 border border-white/10 rounded text-xs text-zinc-400"
          >
            {CHANNEL_ICONS[ch]}
            {ch}
          </span>
        ))}
        <span className="text-xs text-zinc-500">
          {totalSteps} step{totalSteps !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="text-center">
          <div className="text-lg font-semibold text-white">
            {sequence.enrolled_count}
          </div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide">
            Enrolled
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-blue-400">
            {sequence.active_count}
          </div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide">
            Active
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-emerald-400">
            {sequence.completed_count}
          </div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide">
            Done
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-indigo-400">
            {replyRate}%
          </div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide">
            Reply
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-white/10 pt-3">
        {sequence.status === "draft" || sequence.status === "paused" ? (
          <button
            onClick={onActivate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg text-xs font-medium transition-colors"
          >
            <Play className="w-3 h-3" />
            Activate
          </button>
        ) : sequence.status === "active" ? (
          <button
            onClick={onPause}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded-lg text-xs font-medium transition-colors"
          >
            <Pause className="w-3 h-3" />
            Pause
          </button>
        ) : null}
        <Link
          href={`/gtm/sequences/${sequence.id}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/5 text-zinc-300 hover:bg-white/10 rounded-lg text-xs font-medium transition-colors"
        >
          Edit
        </Link>
        {(sequence.status === "draft" || sequence.status === "archived") && (
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-red-400 hover:bg-red-500/10 rounded-lg text-xs font-medium transition-colors ml-auto"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function SequencesPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const { sequences, total, isLoading, refetch } = useOutreachSequences(
    workspaceId,
    { status: statusFilter, page, per_page: 12 }
  );
  const { createSequence, activateSequence, pauseSequence, deleteSequence } =
    useSequenceMutations(workspaceId);

  const totalPages = Math.ceil(total / 12);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createSequence.mutateAsync({ name: newName, description: newDescription || undefined });
    setShowCreateModal(false);
    setNewName("");
    setNewDescription("");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Outreach Sequences</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Multi-channel sequences for email, LinkedIn, and SMS outreach
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Sequence
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2">
        {["all", "draft", "active", "paused", "archived"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s === "all" ? undefined : s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              (s === "all" && !statusFilter) || statusFilter === s
                ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                : "bg-white/5 text-zinc-400 border border-white/10 hover:bg-white/10"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
        </div>
      ) : sequences.length === 0 ? (
        /* Empty state */
        <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
          <Mail className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">
            No sequences yet
          </h3>
          <p className="text-sm text-zinc-400 mb-6 max-w-md mx-auto">
            Create a multi-channel outreach sequence to automate your email,
            LinkedIn, and SMS outreach.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create First Sequence
          </button>
        </div>
      ) : (
        <>
          {/* Sequence grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sequences.map((seq) => (
              <SequenceCard
                key={seq.id}
                sequence={seq}
                onActivate={() => activateSequence.mutate(seq.id)}
                onPause={() => pauseSequence.mutate(seq.id)}
                onDelete={() => {
                  if (confirm("Delete this sequence?")) {
                    deleteSequence.mutate(seq.id);
                  }
                }}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">
                {total} sequence{total !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg bg-white/5 text-zinc-400 hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-zinc-400">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg bg-white/5 text-zinc-400 hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-zinc-900 border border-white/10 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                New Sequence
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Cold Outreach - SaaS CTOs"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Description
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Optional description..."
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || createSequence.isPending}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {createSequence.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Create"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
