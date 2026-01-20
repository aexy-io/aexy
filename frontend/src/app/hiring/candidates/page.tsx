"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { redirect } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  Users,
  Plus,
  Search,
  Filter,
  LayoutGrid,
  List,
  MoreVertical,
  Mail,
  Phone,
  Calendar,
  Clock,
  ArrowRight,
  ChevronDown,
  GripVertical,
  User,
  X,
  FileText,
  Send,
  Trash2,
  ExternalLink,
  Star,
  Tag,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hiringApi, HiringCandidate, HiringCandidateStage } from "@/lib/api";

// Candidate stages
type CandidateStage = HiringCandidateStage;

interface Candidate {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  stage: CandidateStage;
  source: string | null;
  score?: number | null;
  appliedAt: string;
  tags: string[];
  avatarUrl?: string;
}

const STAGE_CONFIG: Record<CandidateStage, { label: string; color: string; bgColor: string; borderColor: string }> = {
  applied: { label: "Applied", color: "text-blue-400", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/30" },
  screening: { label: "Screening", color: "text-cyan-400", bgColor: "bg-cyan-500/10", borderColor: "border-cyan-500/30" },
  assessment: { label: "Assessment", color: "text-primary-400", bgColor: "bg-primary-500/10", borderColor: "border-primary-500/30" },
  interview: { label: "Interview", color: "text-purple-400", bgColor: "bg-purple-500/10", borderColor: "border-purple-500/30" },
  offer: { label: "Offer", color: "text-orange-400", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/30" },
  hired: { label: "Hired", color: "text-green-400", bgColor: "bg-green-500/10", borderColor: "border-green-500/30" },
  rejected: { label: "Rejected", color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/30" },
};

const STAGES_ORDER: CandidateStage[] = ["applied", "screening", "assessment", "interview", "offer", "hired"];

// Helper to convert API response to local Candidate format
const toCandidate = (c: HiringCandidate): Candidate => ({
  id: c.id,
  name: c.name,
  email: c.email,
  phone: c.phone,
  role: c.role,
  stage: c.stage,
  source: c.source,
  score: c.score,
  appliedAt: c.applied_at,
  tags: c.tags || [],
});

function CandidateCard({ candidate, onDragStart, onDragEnd }: { candidate: Candidate; onDragStart?: () => void; onDragEnd?: () => void }) {
  const [showMenu, setShowMenu] = useState(false);
  const stageConfig = STAGE_CONFIG[candidate.stage];

  const getTimeAgo = (dateStr: string) => {
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    return `${days} days ago`;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative bg-slate-800/80 border rounded-lg p-4 cursor-grab active:cursor-grabbing",
        "hover:border-slate-600 hover:bg-slate-800 transition-all duration-200",
        stageConfig.borderColor
      )}
    >
      {/* Drag indicator */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="h-4 w-4 text-slate-500" />
      </div>

      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-blue-500 flex items-center justify-center text-white font-medium">
          {candidate.name.split(" ").map(n => n[0]).join("")}
        </div>
        <div className="flex-1 min-w-0">
          <Link
            href={`/hiring/candidates/${candidate.id}`}
            className="text-sm font-medium text-white hover:text-primary-400 transition truncate block"
          >
            {candidate.name}
          </Link>
          <p className="text-xs text-slate-400 truncate">{candidate.role}</p>
        </div>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition opacity-0 group-hover:opacity-100"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>

      {/* Score */}
      {candidate.score && (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full",
                candidate.score >= 80 ? "bg-green-500" : candidate.score >= 60 ? "bg-yellow-500" : "bg-red-500"
              )}
              style={{ width: `${candidate.score}%` }}
            />
          </div>
          <span className={cn(
            "text-xs font-medium",
            candidate.score >= 80 ? "text-green-400" : candidate.score >= 60 ? "text-yellow-400" : "text-red-400"
          )}>
            {candidate.score}%
          </span>
        </div>
      )}

      {/* Tags */}
      {candidate.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {candidate.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="text-xs px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded">
              {tag}
            </span>
          ))}
          {candidate.tags.length > 2 && (
            <span className="text-xs text-slate-500">+{candidate.tags.length - 2}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {getTimeAgo(candidate.appliedAt)}
        </span>
        <span className="px-1.5 py-0.5 bg-slate-700/50 rounded">{candidate.source}</span>
      </div>

      {/* Quick menu */}
      {showMenu && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute top-10 right-2 z-10 w-44 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1"
        >
          <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition">
            <ExternalLink className="h-4 w-4" />
            View Profile
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition">
            <Mail className="h-4 w-4" />
            Send Email
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition">
            <FileText className="h-4 w-4" />
            Send Assessment
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition">
            <Calendar className="h-4 w-4" />
            Schedule Interview
          </button>
          <hr className="my-1 border-slate-700" />
          <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-slate-700 transition">
            <Trash2 className="h-4 w-4" />
            Reject
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}

function StageColumn({
  stage,
  candidates,
  onDrop
}: {
  stage: CandidateStage;
  candidates: Candidate[];
  onDrop: (stage: CandidateStage, candidateId: string) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const config = STAGE_CONFIG[stage];

  return (
    <div
      className={cn(
        "flex flex-col min-w-[280px] w-[280px] bg-slate-900/50 rounded-xl border transition-colors",
        isDragOver ? "border-primary-500/50 bg-primary-500/5" : "border-slate-800"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const candidateId = e.dataTransfer.getData("candidateId");
        if (candidateId) {
          onDrop(stage, candidateId);
        }
      }}
    >
      {/* Column Header */}
      <div className={cn("p-4 border-b", config.borderColor)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full", config.bgColor.replace("/10", ""))} />
            <span className={cn("font-medium", config.color)}>{config.label}</span>
            <span className="text-xs text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
              {candidates.length}
            </span>
          </div>
          <button className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-280px)]">
        <AnimatePresence>
          {candidates.map((candidate) => (
            <div
              key={candidate.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("candidateId", candidate.id);
              }}
            >
              <CandidateCard candidate={candidate} />
            </div>
          ))}
        </AnimatePresence>

        {candidates.length === 0 && (
          <div className="py-8 text-center">
            <User className="h-8 w-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No candidates</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CandidatesPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId, currentWorkspace, workspacesLoading, hasWorkspaces } = useWorkspace();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStage, setFilterStage] = useState<CandidateStage | "all">("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [showAddModal, setShowAddModal] = useState(false);

  // Fetch candidates from API
  useEffect(() => {
    const fetchCandidates = async () => {
      if (!currentWorkspaceId) return;

      setLoading(true);
      setError(null);
      try {
        const data = await hiringApi.listCandidates(currentWorkspaceId);
        setCandidates(data.map(toCandidate));
      } catch (err) {
        console.error("Failed to fetch candidates:", err);
        setError("Failed to load candidates");
      } finally {
        setLoading(false);
      }
    };

    fetchCandidates();
  }, [currentWorkspaceId]);

  // Filter candidates
  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      if (filterStage !== "all" && c.stage !== filterStage) return false;
      if (filterSource !== "all" && c.source !== filterSource) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          c.name.toLowerCase().includes(query) ||
          c.email.toLowerCase().includes(query) ||
          c.role.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [candidates, filterStage, filterSource, searchQuery]);

  // Group by stage for kanban
  const candidatesByStage = useMemo(() => {
    const grouped: Record<CandidateStage, Candidate[]> = {
      applied: [],
      screening: [],
      assessment: [],
      interview: [],
      offer: [],
      hired: [],
      rejected: [],
    };
    filteredCandidates.forEach((c) => {
      grouped[c.stage].push(c);
    });
    return grouped;
  }, [filteredCandidates]);

  // Handle drag and drop
  const handleDrop = useCallback(async (stage: CandidateStage, candidateId: string) => {
    // Optimistic update
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, stage } : c))
    );

    try {
      await hiringApi.updateCandidateStage(candidateId, stage);
    } catch (err) {
      console.error("Failed to update candidate stage:", err);
      // Revert on error - refetch candidates
      if (currentWorkspaceId) {
        const data = await hiringApi.listCandidates(currentWorkspaceId);
        setCandidates(data.map(toCandidate));
      }
    }
  }, [currentWorkspaceId]);

  // Get unique sources
  const sources = useMemo(() => {
    return Array.from(new Set(candidates.map((c) => c.source)));
  }, [candidates]);

  if (isLoading || workspacesLoading || (loading && currentWorkspaceId)) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-slate-400 text-sm">Loading candidates...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <X className="h-10 w-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Error Loading Candidates</h2>
          <p className="text-slate-400 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition font-medium"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  if (!hasWorkspaces) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Building2 className="h-10 w-10 text-slate-600" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Workspace Required</h2>
          <p className="text-slate-400 mb-6">
            Create a workspace first to manage candidates.
          </p>
          <Link
            href="/settings/organization"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition font-medium shadow-lg shadow-primary-500/20"
          >
            <Building2 className="h-5 w-5" />
            Create Workspace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-[1800px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl">
              <Users className="h-7 w-7 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Candidate Pipeline</h1>
              <p className="text-slate-400 text-sm">
                {filteredCandidates.length} candidates in pipeline
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg font-medium transition shadow-lg shadow-primary-500/20"
          >
            <Plus className="h-4 w-4" />
            Add Candidate
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search candidates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800 text-white rounded-lg pl-10 pr-4 py-2 border border-slate-700 focus:border-primary-500 focus:outline-none text-sm"
            />
          </div>

          {/* Stage Filter */}
          <select
            value={filterStage}
            onChange={(e) => setFilterStage(e.target.value as CandidateStage | "all")}
            className="bg-slate-800 text-white rounded-lg px-3 py-2 border border-slate-700 focus:border-primary-500 focus:outline-none text-sm"
          >
            <option value="all">All Stages</option>
            {STAGES_ORDER.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_CONFIG[stage].label}
              </option>
            ))}
            <option value="rejected">Rejected</option>
          </select>

          {/* Source Filter */}
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="bg-slate-800 text-white rounded-lg px-3 py-2 border border-slate-700 focus:border-primary-500 focus:outline-none text-sm"
          >
            <option value="all">All Sources</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>

          {/* View Toggle */}
          <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
            <button
              onClick={() => setViewMode("kanban")}
              className={cn(
                "p-2 rounded transition",
                viewMode === "kanban" ? "bg-primary-500 text-white" : "text-slate-400 hover:text-white"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-2 rounded transition",
                viewMode === "list" ? "bg-primary-500 text-white" : "text-slate-400 hover:text-white"
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Kanban Board */}
        {viewMode === "kanban" && (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES_ORDER.map((stage) => (
              <StageColumn
                key={stage}
                stage={stage}
                candidates={candidatesByStage[stage]}
                onDrop={handleDrop}
              />
            ))}
          </div>
        )}

        {/* List View */}
        {viewMode === "list" && (
          <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Candidate</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Role</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Stage</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Score</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Source</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3">Applied</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wide px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredCandidates.map((candidate) => {
                  const stageConfig = STAGE_CONFIG[candidate.stage];
                  return (
                    <tr key={candidate.id} className="hover:bg-slate-800/50 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-blue-500 flex items-center justify-center text-white text-xs font-medium">
                            {candidate.name.split(" ").map(n => n[0]).join("")}
                          </div>
                          <div>
                            <Link
                              href={`/hiring/candidates/${candidate.id}`}
                              className="text-sm font-medium text-white hover:text-primary-400 transition"
                            >
                              {candidate.name}
                            </Link>
                            <p className="text-xs text-slate-400">{candidate.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">{candidate.role}</td>
                      <td className="px-4 py-3">
                        <span className={cn("text-xs px-2 py-1 rounded", stageConfig.bgColor, stageConfig.color)}>
                          {stageConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {candidate.score ? (
                          <span className={cn(
                            "text-sm font-medium",
                            candidate.score >= 80 ? "text-green-400" : candidate.score >= 60 ? "text-yellow-400" : "text-red-400"
                          )}>
                            {candidate.score}%
                          </span>
                        ) : (
                          <span className="text-slate-500 text-sm">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">{candidate.source}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{candidate.appliedAt}</td>
                      <td className="px-4 py-3">
                        <button className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredCandidates.length === 0 && (
              <div className="py-12 text-center">
                <Users className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No candidates found</p>
              </div>
            )}
          </div>
        )}

        {/* Add Candidate Modal */}
        <AnimatePresence>
          {showAddModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={() => setShowAddModal(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-white">Add Candidate</h2>
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
                    <input
                      type="text"
                      placeholder="Enter candidate name"
                      className="w-full bg-slate-800 text-white rounded-lg px-4 py-2 border border-slate-700 focus:border-primary-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                    <input
                      type="email"
                      placeholder="candidate@example.com"
                      className="w-full bg-slate-800 text-white rounded-lg px-4 py-2 border border-slate-700 focus:border-primary-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
                    <input
                      type="text"
                      placeholder="e.g., Senior Frontend Engineer"
                      className="w-full bg-slate-800 text-white rounded-lg px-4 py-2 border border-slate-700 focus:border-primary-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Source</label>
                    <select className="w-full bg-slate-800 text-white rounded-lg px-4 py-2 border border-slate-700 focus:border-primary-500 focus:outline-none">
                      <option value="linkedin">LinkedIn</option>
                      <option value="referral">Referral</option>
                      <option value="direct">Direct</option>
                      <option value="jobboard">Job Board</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg font-medium hover:bg-slate-700 transition"
                  >
                    Cancel
                  </button>
                  <button className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-500 transition">
                    Add Candidate
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
    </main>
  );
}
