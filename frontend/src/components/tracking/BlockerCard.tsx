"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Clock,
  User,
  ArrowUp,
  CheckCircle2,
  MessageSquare,
  MoreVertical,
} from "lucide-react";
import { Blocker } from "@/lib/api";

interface BlockerCardProps {
  blocker: Blocker;
  onResolve?: (notes?: string) => Promise<void>;
  onEscalate?: (escalateToId: string, notes?: string) => Promise<void>;
  teamMembers?: Array<{ id: string; name: string }>;
  isResolving?: boolean;
  isEscalating?: boolean;
}

const severityConfig = {
  low: { color: "text-blue-400", bgColor: "bg-blue-900/20", borderColor: "border-blue-700/50" },
  medium: { color: "text-yellow-400", bgColor: "bg-yellow-900/20", borderColor: "border-yellow-700/50" },
  high: { color: "text-orange-400", bgColor: "bg-orange-900/20", borderColor: "border-orange-700/50" },
  critical: { color: "text-red-400", bgColor: "bg-red-900/20", borderColor: "border-red-700/50" },
};

const categoryConfig = {
  technical: { label: "Technical", color: "text-purple-400" },
  dependency: { label: "Dependency", color: "text-blue-400" },
  resource: { label: "Resource", color: "text-green-400" },
  external: { label: "External", color: "text-orange-400" },
};

export function BlockerCard({
  blocker,
  onResolve,
  onEscalate,
  teamMembers = [],
  isResolving = false,
  isEscalating = false,
}: BlockerCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [resolveNotes, setResolveNotes] = useState("");
  const [escalateNotes, setEscalateNotes] = useState("");
  const [escalateToId, setEscalateToId] = useState("");

  const severity = severityConfig[blocker.severity as keyof typeof severityConfig] || severityConfig.medium;
  const category = categoryConfig[blocker.category as keyof typeof categoryConfig] || categoryConfig.technical;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const handleResolve = async () => {
    if (onResolve) {
      await onResolve(resolveNotes || undefined);
      setShowResolveModal(false);
      setResolveNotes("");
    }
  };

  const handleEscalate = async () => {
    if (onEscalate && escalateToId) {
      await onEscalate(escalateToId, escalateNotes || undefined);
      setShowEscalateModal(false);
      setEscalateNotes("");
      setEscalateToId("");
    }
  };

  return (
    <>
      <div className={`bg-slate-800 rounded-xl border ${severity.borderColor} overflow-hidden`}>
        {/* Header */}
        <div className={`px-4 py-3 ${severity.bgColor} border-b ${severity.borderColor}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${severity.color}`} />
              <span className={`text-sm font-medium ${severity.color} capitalize`}>
                {blocker.severity} Severity
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs ${category.color}`}>{category.label}</span>
              {blocker.status !== "active" && (
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    blocker.status === "resolved"
                      ? "bg-green-900/30 text-green-400"
                      : "bg-purple-900/30 text-purple-400"
                  }`}
                >
                  {blocker.status}
                </span>
              )}
              {blocker.status === "active" && (
                <div className="relative">
                  <button
                    onClick={() => setShowMenu(!showMenu)}
                    className="p-1 hover:bg-slate-700 rounded transition"
                  >
                    <MoreVertical className="h-4 w-4 text-slate-400" />
                  </button>
                  {showMenu && (
                    <div className="absolute right-0 top-8 w-40 bg-slate-700 border border-slate-600 rounded-lg shadow-xl z-10">
                      {onResolve && (
                        <button
                          onClick={() => {
                            setShowMenu(false);
                            setShowResolveModal(true);
                          }}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-600 w-full text-left"
                        >
                          <CheckCircle2 className="h-4 w-4 text-green-400" />
                          Resolve
                        </button>
                      )}
                      {onEscalate && teamMembers.length > 0 && (
                        <button
                          onClick={() => {
                            setShowMenu(false);
                            setShowEscalateModal(true);
                          }}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-600 w-full text-left"
                        >
                          <ArrowUp className="h-4 w-4 text-purple-400" />
                          Escalate
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-white mb-3">{blocker.description}</p>

          {/* Task reference */}
          {blocker.task && (
            <div className="text-sm text-slate-400 mb-3">
              Task: <span className="text-slate-300">{blocker.task.title}</span>
            </div>
          )}

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
            {blocker.developer && (
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                <span>{blocker.developer.name || blocker.developer.email}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>{formatDate(blocker.created_at)}</span>
            </div>
          </div>

          {/* Resolution info */}
          {blocker.status === "resolved" && blocker.resolution_notes && (
            <div className="mt-3 p-3 bg-green-900/20 border border-green-700/50 rounded-lg">
              <div className="flex items-center gap-1.5 text-xs text-green-400 mb-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Resolution
              </div>
              <p className="text-sm text-green-200">{blocker.resolution_notes}</p>
            </div>
          )}

          {/* Escalation info */}
          {blocker.status === "escalated" && blocker.escalated_to && (
            <div className="mt-3 p-3 bg-purple-900/20 border border-purple-700/50 rounded-lg">
              <div className="flex items-center gap-1.5 text-xs text-purple-400 mb-1">
                <ArrowUp className="h-3.5 w-3.5" />
                Escalated to
              </div>
              <p className="text-sm text-purple-200">
                {blocker.escalated_to.name || blocker.escalated_to.email}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Resolve Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md mx-4 border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-4">Resolve Blocker</h3>
            <textarea
              value={resolveNotes}
              onChange={(e) => setResolveNotes(e.target.value)}
              placeholder="How was this resolved? (optional)"
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              rows={3}
            />
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => setShowResolveModal(false)}
                className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleResolve}
                disabled={isResolving}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
              >
                {isResolving ? "Resolving..." : "Resolve"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Escalate Modal */}
      {showEscalateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md mx-4 border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-4">Escalate Blocker</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Escalate to</label>
                <select
                  value={escalateToId}
                  onChange={(e) => setEscalateToId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Select a person...</option>
                  {teamMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Notes (optional)</label>
                <textarea
                  value={escalateNotes}
                  onChange={(e) => setEscalateNotes(e.target.value)}
                  placeholder="Why are you escalating?"
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => setShowEscalateModal(false)}
                className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleEscalate}
                disabled={isEscalating || !escalateToId}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
              >
                {isEscalating ? "Escalating..." : "Escalate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
