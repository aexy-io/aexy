"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Package,
  Grid3X3,
  List,
  X,
  Calendar,
  AlertTriangle,
  Lock,
  Rocket,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useReleases, useRelease, useReleaseReadiness } from "@/hooks/useReleases";
import { ReleaseCard } from "@/components/releases/ReleaseCard";
import { ReadinessChecklist } from "@/components/releases/ReadinessChecklist";
import { Release, ReleaseStatus, ReleaseRiskLevel, ReleaseCreate, ReadinessChecklistItem } from "@/lib/api";

const STATUS_OPTIONS: { value: ReleaseStatus | "all"; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "planning", label: "Planning" },
  { value: "in_progress", label: "In Progress" },
  { value: "code_freeze", label: "Code Freeze" },
  { value: "testing", label: "Testing" },
  { value: "released", label: "Released" },
  { value: "cancelled", label: "Cancelled" },
];

const RISK_OPTIONS: { value: ReleaseRiskLevel | "all"; label: string }[] = [
  { value: "all", label: "All Risk Levels" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

interface ReleaseFormData {
  name: string;
  version: string;
  description: string;
  target_date: string;
  risk_level: ReleaseRiskLevel;
}

export default function ReleasesPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReleaseStatus | "all">("all");
  const [riskFilter, setRiskFilter] = useState<ReleaseRiskLevel | "all">("all");

  const [formData, setFormData] = useState<ReleaseFormData>({
    name: "",
    version: "",
    description: "",
    target_date: "",
    risk_level: "low",
  });

  const {
    releases,
    total,
    isLoading,
    createRelease,
    deleteRelease,
    isCreating,
  } = useReleases(workspaceId, {
    project_id: projectId,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  // Filter by risk level and search on client side
  const filteredReleases = releases.filter((release) => {
    const matchesRisk = riskFilter === "all" || release.risk_level === riskFilter;
    const matchesSearch =
      searchQuery === "" ||
      release.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (release.version?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      (release.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    return matchesRisk && matchesSearch;
  });

  const handleCreateRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    const data: ReleaseCreate = {
      project_id: projectId,
      name: formData.name,
      version: formData.version || undefined,
      description: formData.description || undefined,
      target_date: formData.target_date || undefined,
      risk_level: formData.risk_level,
      readiness_checklist: [
        { id: crypto.randomUUID(), item: "Code complete", completed: false, required: true },
        { id: crypto.randomUUID(), item: "Unit tests passing", completed: false, required: true },
        { id: crypto.randomUUID(), item: "Integration tests passing", completed: false, required: true },
        { id: crypto.randomUUID(), item: "QA approved", completed: false, required: true },
        { id: crypto.randomUUID(), item: "Documentation updated", completed: false, required: false },
        { id: crypto.randomUUID(), item: "Release notes prepared", completed: false, required: false },
      ],
    };
    await createRelease(data);
    setShowCreateModal(false);
    setFormData({
      name: "",
      version: "",
      description: "",
      target_date: "",
      risk_level: "low",
    });
  };

  const handleReleaseClick = (release: Release) => {
    setSelectedRelease(release);
  };

  const handleDeleteRelease = async (releaseId: string) => {
    if (confirm("Are you sure you want to delete this release?")) {
      await deleteRelease(releaseId);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">Please log in to view releases.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Package className="h-6 w-6 text-green-400" />
            Releases
          </h1>
          <p className="text-slate-400 mt-1">
            {total} {total === 1 ? "release" : "releases"} in this project
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Release
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search releases..."
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500/50"
          />
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ReleaseStatus | "all")}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500/50"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Risk Filter */}
        <select
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value as ReleaseRiskLevel | "all")}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500/50"
        >
          {RISK_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* View Toggle */}
        <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-1">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 rounded ${viewMode === "grid" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-2 rounded ${viewMode === "list" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Releases Grid/List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-2 border-green-500 border-t-transparent rounded-full" />
        </div>
      ) : filteredReleases.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Package className="h-12 w-12 text-slate-600 mb-4" />
          <p className="text-slate-400 mb-2">No releases found</p>
          <p className="text-slate-500 text-sm">
            {searchQuery || statusFilter !== "all" || riskFilter !== "all"
              ? "Try adjusting your filters"
              : "Create your first release to get started"}
          </p>
        </div>
      ) : (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              : "space-y-3"
          }
        >
          {filteredReleases.map((release) => (
            <ReleaseCard
              key={release.id}
              release={release}
              onClick={handleReleaseClick}
              onDelete={handleDeleteRelease}
            />
          ))}
        </div>
      )}

      {/* Create Release Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto m-4">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Create Release</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-slate-400 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateRelease} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Release Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Q1 2024 Release"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500/50"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Version
                </label>
                <input
                  type="text"
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  placeholder="e.g., 2.0.0"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this release..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Target Date
                </label>
                <input
                  type="date"
                  value={formData.target_date}
                  onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Risk Level
                </label>
                <select
                  value={formData.risk_level}
                  onChange={(e) => setFormData({ ...formData, risk_level: e.target.value as ReleaseRiskLevel })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500/50"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !formData.name}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreating ? "Creating..." : "Create Release"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Release Detail Modal */}
      {selectedRelease && (
        <ReleaseDetailModal
          release={selectedRelease}
          workspaceId={workspaceId}
          onClose={() => setSelectedRelease(null)}
        />
      )}
    </div>
  );
}

interface ReleaseDetailModalProps {
  release: Release;
  workspaceId: string | null;
  onClose: () => void;
}

function ReleaseDetailModal({ release, workspaceId, onClose }: ReleaseDetailModalProps) {
  const {
    release: releaseDetails,
    isLoading,
    freeze,
    publish,
    updateChecklistItem,
    isFreezing,
    isPublishing,
  } = useRelease(workspaceId, release.id);

  const { readiness } = useReleaseReadiness(workspaceId, release.id);

  const currentRelease = releaseDetails || release;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "Not set";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleChecklistToggle = async (itemId: string, completed: boolean) => {
    await updateChecklistItem({ itemId, completed: !completed });
  };

  const handleFreeze = async () => {
    if (confirm("Are you sure you want to initiate code freeze? No more features can be added.")) {
      await freeze();
    }
  };

  const handlePublish = async () => {
    const notes = prompt("Enter release notes (optional):");
    await publish(notes || undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto m-4">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div>
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-green-400" />
              <h2 className="text-lg font-semibold text-white">{currentRelease.name}</h2>
              {currentRelease.version && (
                <span className="text-sm font-mono text-slate-400">v{currentRelease.version}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Status and Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="px-2 py-1 rounded text-sm font-medium bg-slate-700 text-white capitalize">
                {currentRelease.status.replace("_", " ")}
              </span>
              <span className={`text-sm ${
                currentRelease.risk_level === "critical" ? "text-red-400" :
                currentRelease.risk_level === "high" ? "text-orange-400" :
                currentRelease.risk_level === "medium" ? "text-amber-400" :
                "text-green-400"
              }`}>
                <AlertTriangle className="h-4 w-4 inline mr-1" />
                {currentRelease.risk_level} risk
              </span>
            </div>
            <div className="flex items-center gap-2">
              {currentRelease.status === "in_progress" && (
                <button
                  onClick={handleFreeze}
                  disabled={isFreezing}
                  className="flex items-center gap-1 px-3 py-1.5 bg-cyan-600 text-white rounded-lg text-sm hover:bg-cyan-500 transition-colors disabled:opacity-50"
                >
                  <Lock className="h-4 w-4" />
                  {isFreezing ? "Freezing..." : "Code Freeze"}
                </button>
              )}
              {(currentRelease.status === "code_freeze" || currentRelease.status === "testing") && (
                <button
                  onClick={handlePublish}
                  disabled={isPublishing}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-500 transition-colors disabled:opacity-50"
                >
                  <Rocket className="h-4 w-4" />
                  {isPublishing ? "Publishing..." : "Publish Release"}
                </button>
              )}
            </div>
          </div>

          {/* Description */}
          {currentRelease.description && (
            <div>
              <h4 className="text-sm font-medium text-white mb-2">Description</h4>
              <p className="text-slate-400 text-sm">{currentRelease.description}</p>
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Calendar className="h-4 w-4" />
                <span className="text-xs uppercase">Target Date</span>
              </div>
              <p className="text-white">{formatDate(currentRelease.target_date)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Rocket className="h-4 w-4" />
                <span className="text-xs uppercase">Released Date</span>
              </div>
              <p className="text-white">
                {currentRelease.actual_release_date
                  ? formatDate(currentRelease.actual_release_date)
                  : "Not released yet"}
              </p>
            </div>
          </div>

          {/* Readiness */}
          {readiness && (
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-white">Release Readiness</h4>
                <span className={`text-sm font-medium ${readiness.is_ready ? "text-green-400" : "text-amber-400"}`}>
                  {readiness.readiness_percentage.toFixed(0)}% ready
                </span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full transition-all ${readiness.is_ready ? "bg-green-500" : "bg-amber-500"}`}
                  style={{ width: `${readiness.readiness_percentage}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Required: {readiness.required_completed}/{readiness.required_items}</span>
                <span>Total: {readiness.completed_items}/{readiness.total_items}</span>
              </div>
            </div>
          )}

          {/* Checklist */}
          <div>
            <h4 className="text-sm font-medium text-white mb-3">Readiness Checklist</h4>
            <ReadinessChecklist
              items={currentRelease.readiness_checklist}
              onToggle={handleChecklistToggle}
              readOnly={currentRelease.status === "released" || currentRelease.status === "cancelled"}
            />
          </div>

          {/* Release Notes */}
          {currentRelease.release_notes && (
            <div>
              <h4 className="text-sm font-medium text-white mb-2">Release Notes</h4>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-slate-300 text-sm whitespace-pre-wrap">{currentRelease.release_notes}</p>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-700">
            <div>
              <span className="text-xs text-slate-500">Created</span>
              <p className="text-sm text-white">{formatDate(currentRelease.created_at)}</p>
            </div>
            <div>
              <span className="text-xs text-slate-500">Last Updated</span>
              <p className="text-sm text-white">{formatDate(currentRelease.updated_at)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
