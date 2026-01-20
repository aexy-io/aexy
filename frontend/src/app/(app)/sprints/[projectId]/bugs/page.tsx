"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Bug as BugIcon,
  Grid3X3,
  List,
  X,
  AlertTriangle,
  AlertCircle,
  AlertOctagon,
  Info,
  CheckCircle2,
  Clock,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useBugs, useBug, useBugStats } from "@/hooks/useBugs";
import { BugCard } from "@/components/bugs/BugCard";
import { SeverityBadge } from "@/components/bugs/SeverityBadge";
import { BugActionDialog } from "@/components/bugs/BugActionDialog";
import { BugTimeline } from "@/components/bugs/BugTimeline";
import {
  Bug,
  BugStatus,
  BugSeverity,
  BugPriority,
  BugType,
  BugCreate,
  ReproductionStep,
} from "@/lib/api";

const STATUS_OPTIONS: { value: BugStatus | "all"; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "new", label: "New" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In Progress" },
  { value: "fixed", label: "Fixed" },
  { value: "verified", label: "Verified" },
  { value: "closed", label: "Closed" },
  { value: "wont_fix", label: "Won't Fix" },
  { value: "duplicate", label: "Duplicate" },
  { value: "cannot_reproduce", label: "Cannot Reproduce" },
];

const SEVERITY_OPTIONS: { value: BugSeverity | "all"; label: string }[] = [
  { value: "all", label: "All Severities" },
  { value: "blocker", label: "Blocker" },
  { value: "critical", label: "Critical" },
  { value: "major", label: "Major" },
  { value: "minor", label: "Minor" },
  { value: "trivial", label: "Trivial" },
];

const PRIORITY_OPTIONS: { value: BugPriority | "all"; label: string }[] = [
  { value: "all", label: "All Priorities" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

interface BugFormData {
  title: string;
  description: string;
  severity: BugSeverity;
  priority: BugPriority;
  bug_type: BugType;
  expected_behavior: string;
  actual_behavior: string;
  environment: string;
  affected_version: string;
  is_regression: boolean;
  steps: string[];
}

export default function BugsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedBug, setSelectedBug] = useState<Bug | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<BugStatus | "all">("all");
  const [severityFilter, setSeverityFilter] = useState<BugSeverity | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<BugPriority | "all">("all");

  const [formData, setFormData] = useState<BugFormData>({
    title: "",
    description: "",
    severity: "major",
    priority: "medium",
    bug_type: "functional",
    expected_behavior: "",
    actual_behavior: "",
    environment: "production",
    affected_version: "",
    is_regression: false,
    steps: [""],
  });

  const {
    bugs,
    total,
    isLoading,
    createBug,
    deleteBug,
    isCreating,
  } = useBugs(workspaceId, {
    project_id: projectId,
    status: statusFilter === "all" ? undefined : statusFilter,
    severity: severityFilter === "all" ? undefined : severityFilter,
    priority: priorityFilter === "all" ? undefined : priorityFilter,
    include_closed: statusFilter === "all" || statusFilter === "closed" || statusFilter === "wont_fix",
  });

  const { stats } = useBugStats(workspaceId, projectId);

  // Filter by search on client side
  const filteredBugs = bugs.filter((bug) => {
    const matchesSearch =
      searchQuery === "" ||
      bug.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bug.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (bug.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    return matchesSearch;
  });

  const handleCreateBug = async (e: React.FormEvent) => {
    e.preventDefault();
    const steps: ReproductionStep[] = formData.steps
      .filter((s) => s.trim())
      .map((description, index) => ({
        step_number: index + 1,
        description,
      }));

    const data: BugCreate = {
      project_id: projectId,
      title: formData.title,
      description: formData.description || undefined,
      severity: formData.severity,
      priority: formData.priority,
      bug_type: formData.bug_type,
      expected_behavior: formData.expected_behavior || undefined,
      actual_behavior: formData.actual_behavior || undefined,
      environment: formData.environment || undefined,
      affected_version: formData.affected_version || undefined,
      is_regression: formData.is_regression,
      steps_to_reproduce: steps.length > 0 ? steps : undefined,
    };
    await createBug(data);
    setShowCreateModal(false);
    setFormData({
      title: "",
      description: "",
      severity: "major",
      priority: "medium",
      bug_type: "functional",
      expected_behavior: "",
      actual_behavior: "",
      environment: "production",
      affected_version: "",
      is_regression: false,
      steps: [""],
    });
  };

  const handleBugClick = (bug: Bug) => {
    setSelectedBug(bug);
  };

  const handleDeleteBug = async (bugId: string) => {
    if (confirm("Are you sure you want to delete this bug?")) {
      await deleteBug(bugId);
    }
  };

  const addStep = () => {
    setFormData({ ...formData, steps: [...formData.steps, ""] });
  };

  const updateStep = (index: number, value: string) => {
    const newSteps = [...formData.steps];
    newSteps[index] = value;
    setFormData({ ...formData, steps: newSteps });
  };

  const removeStep = (index: number) => {
    const newSteps = formData.steps.filter((_, i) => i !== index);
    setFormData({ ...formData, steps: newSteps.length > 0 ? newSteps : [""] });
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">Please log in to view bugs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BugIcon className="h-6 w-6 text-red-400" />
            Bug Tracker
          </h1>
          <p className="text-slate-400 mt-1">
            {total} {total === 1 ? "bug" : "bugs"} in this project
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Report Bug
        </button>
      </div>

      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <div className="text-sm text-slate-400">Total</div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-400">{stats.by_status?.new || 0}</div>
            <div className="text-sm text-slate-400">New</div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
            <div className="text-2xl font-bold text-amber-400">{stats.by_status?.in_progress || 0}</div>
            <div className="text-sm text-slate-400">In Progress</div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
            <div className="text-2xl font-bold text-cyan-400">{stats.by_status?.fixed || 0}</div>
            <div className="text-sm text-slate-400">Fixed</div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-400">{stats.by_severity?.blocker || 0}</div>
            <div className="text-sm text-slate-400">Blockers</div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
            <div className="text-2xl font-bold text-orange-400">{stats.regressions || 0}</div>
            <div className="text-sm text-slate-400">Regressions</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search bugs..."
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
          />
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as BugStatus | "all")}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Severity Filter */}
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as BugSeverity | "all")}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
        >
          {SEVERITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Priority Filter */}
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as BugPriority | "all")}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
        >
          {PRIORITY_OPTIONS.map((option) => (
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

      {/* Bugs Grid/List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-2 border-red-500 border-t-transparent rounded-full" />
        </div>
      ) : filteredBugs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <BugIcon className="h-12 w-12 text-slate-600 mb-4" />
          <p className="text-slate-400 mb-2">No bugs found</p>
          <p className="text-slate-500 text-sm">
            {searchQuery || statusFilter !== "all" || severityFilter !== "all"
              ? "Try adjusting your filters"
              : "Report a bug when you find one"}
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
          {filteredBugs.map((bug) => (
            <BugCard
              key={bug.id}
              bug={bug}
              onClick={handleBugClick}
              onDelete={handleDeleteBug}
            />
          ))}
        </div>
      )}

      {/* Create Bug Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Report Bug</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-slate-400 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateBug} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Brief summary of the bug"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Severity
                  </label>
                  <select
                    value={formData.severity}
                    onChange={(e) => setFormData({ ...formData, severity: e.target.value as BugSeverity })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  >
                    <option value="blocker">Blocker</option>
                    <option value="critical">Critical</option>
                    <option value="major">Major</option>
                    <option value="minor">Minor</option>
                    <option value="trivial">Trivial</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Priority
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as BugPriority })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Type
                  </label>
                  <select
                    value={formData.bug_type}
                    onChange={(e) => setFormData({ ...formData, bug_type: e.target.value as BugType })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  >
                    <option value="functional">Functional</option>
                    <option value="performance">Performance</option>
                    <option value="security">Security</option>
                    <option value="ui">UI</option>
                    <option value="data">Data</option>
                    <option value="integration">Integration</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Detailed description of the bug..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Expected Behavior
                  </label>
                  <textarea
                    value={formData.expected_behavior}
                    onChange={(e) => setFormData({ ...formData, expected_behavior: e.target.value })}
                    placeholder="What should happen?"
                    rows={2}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Actual Behavior
                  </label>
                  <textarea
                    value={formData.actual_behavior}
                    onChange={(e) => setFormData({ ...formData, actual_behavior: e.target.value })}
                    placeholder="What actually happens?"
                    rows={2}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 resize-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Steps to Reproduce
                </label>
                <div className="space-y-2">
                  {formData.steps.map((step, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-sm text-slate-500 w-6">{index + 1}.</span>
                      <input
                        type="text"
                        value={step}
                        onChange={(e) => updateStep(index, e.target.value)}
                        placeholder={`Step ${index + 1}`}
                        className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                      />
                      {formData.steps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeStep(index)}
                          className="p-2 text-slate-400 hover:text-red-400"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addStep}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    + Add step
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Environment
                  </label>
                  <select
                    value={formData.environment}
                    onChange={(e) => setFormData({ ...formData, environment: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  >
                    <option value="production">Production</option>
                    <option value="staging">Staging</option>
                    <option value="development">Development</option>
                    <option value="local">Local</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Affected Version
                  </label>
                  <input
                    type="text"
                    value={formData.affected_version}
                    onChange={(e) => setFormData({ ...formData, affected_version: e.target.value })}
                    placeholder="e.g., 1.2.3"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_regression"
                  checked={formData.is_regression}
                  onChange={(e) => setFormData({ ...formData, is_regression: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-red-500 focus:ring-red-500/50"
                />
                <label htmlFor="is_regression" className="text-sm text-slate-300">
                  This is a regression (was working before)
                </label>
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
                  disabled={isCreating || !formData.title}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreating ? "Reporting..." : "Report Bug"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bug Detail Modal */}
      {selectedBug && (
        <BugDetailModal
          bug={selectedBug}
          workspaceId={workspaceId}
          onClose={() => setSelectedBug(null)}
        />
      )}
    </div>
  );
}

interface BugDetailModalProps {
  bug: Bug;
  workspaceId: string | null;
  onClose: () => void;
}

function BugDetailModal({ bug, workspaceId, onClose }: BugDetailModalProps) {
  const [activeDialog, setActiveDialog] = useState<"fix" | "close" | "reopen" | null>(null);

  const {
    bug: bugDetails,
    isLoading,
    confirm,
    fix,
    verify,
    close,
    reopen,
    isConfirming,
    isFixing,
    isVerifying,
    isClosing,
    isReopening,
  } = useBug(workspaceId, bug.id);

  const currentBug = bugDetails || bug;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "Not set";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleConfirm = async () => {
    await confirm();
  };

  const handleFix = async (data: Record<string, string>) => {
    await fix({
      fixed_in_version: data.fixed_version || undefined,
      root_cause: data.root_cause || undefined,
      resolution_notes: data.resolution_notes || undefined,
    });
    setActiveDialog(null);
  };

  const handleVerify = async () => {
    await verify();
  };

  const handleClose = async (data: Record<string, string>) => {
    await close({
      resolution: (data.resolution as "fixed" | "wont_fix" | "duplicate" | "cannot_reproduce") || "fixed",
      notes: data.notes || undefined,
    });
    setActiveDialog(null);
  };

  const handleReopen = async (data: Record<string, string>) => {
    if (data.reason) {
      await reopen(data.reason);
      setActiveDialog(null);
    }
  };

  const getSeverityColor = (severity: BugSeverity) => {
    switch (severity) {
      case "blocker": return "bg-red-600 text-white";
      case "critical": return "bg-red-500 text-white";
      case "major": return "bg-orange-500 text-white";
      case "minor": return "bg-yellow-500 text-black";
      default: return "bg-slate-500 text-white";
    }
  };

  const getStatusColor = (status: BugStatus) => {
    switch (status) {
      case "new": return "bg-blue-500";
      case "confirmed": return "bg-purple-500";
      case "in_progress": return "bg-amber-500";
      case "fixed": return "bg-cyan-500";
      case "verified": return "bg-green-500";
      case "closed": return "bg-slate-500";
      default: return "bg-slate-600";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto m-4">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BugIcon className="h-5 w-5 text-red-400" />
              <span className="text-sm font-mono text-slate-400">{currentBug.key}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityColor(currentBug.severity)}`}>
                {currentBug.severity}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-white">{currentBug.title}</h2>
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
              <span className={`px-2 py-1 rounded text-sm font-medium text-white ${getStatusColor(currentBug.status)}`}>
                {currentBug.status.replace("_", " ")}
              </span>
              {currentBug.is_regression && (
                <span className="px-2 py-1 rounded text-sm bg-red-500/20 text-red-400">
                  Regression
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {currentBug.status === "new" && (
                <button
                  onClick={handleConfirm}
                  disabled={isConfirming}
                  className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-500 transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {isConfirming ? "..." : "Confirm"}
                </button>
              )}
              {(currentBug.status === "confirmed" || currentBug.status === "in_progress") && (
                <button
                  onClick={() => setActiveDialog("fix")}
                  disabled={isFixing}
                  className="flex items-center gap-1 px-3 py-1.5 bg-cyan-600 text-white rounded-lg text-sm hover:bg-cyan-500 transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {isFixing ? "..." : "Mark Fixed"}
                </button>
              )}
              {currentBug.status === "fixed" && (
                <button
                  onClick={handleVerify}
                  disabled={isVerifying}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-500 transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {isVerifying ? "..." : "Verify"}
                </button>
              )}
              {currentBug.status === "verified" && (
                <button
                  onClick={() => setActiveDialog("close")}
                  disabled={isClosing}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-600 text-white rounded-lg text-sm hover:bg-slate-500 transition-colors disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" />
                  {isClosing ? "..." : "Close"}
                </button>
              )}
              {(currentBug.status === "closed" || currentBug.status === "wont_fix") && (
                <button
                  onClick={() => setActiveDialog("reopen")}
                  disabled={isReopening}
                  className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-500 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  {isReopening ? "..." : "Reopen"}
                </button>
              )}
            </div>
          </div>

          {/* Description */}
          {currentBug.description && (
            <div>
              <h4 className="text-sm font-medium text-white mb-2">Description</h4>
              <p className="text-slate-400 text-sm">{currentBug.description}</p>
            </div>
          )}

          {/* Expected vs Actual */}
          {(currentBug.expected_behavior || currentBug.actual_behavior) && (
            <div className="grid grid-cols-2 gap-4">
              {currentBug.expected_behavior && (
                <div className="bg-green-500/10 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-green-400 mb-2">Expected Behavior</h4>
                  <p className="text-slate-300 text-sm">{currentBug.expected_behavior}</p>
                </div>
              )}
              {currentBug.actual_behavior && (
                <div className="bg-red-500/10 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-red-400 mb-2">Actual Behavior</h4>
                  <p className="text-slate-300 text-sm">{currentBug.actual_behavior}</p>
                </div>
              )}
            </div>
          )}

          {/* Steps to Reproduce */}
          {currentBug.steps_to_reproduce && currentBug.steps_to_reproduce.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-white mb-3">Steps to Reproduce</h4>
              <ol className="space-y-2">
                {currentBug.steps_to_reproduce.map((step) => (
                  <li key={step.step_number} className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-slate-700 rounded-full flex items-center justify-center text-xs text-white">
                      {step.step_number}
                    </span>
                    <span className="text-slate-300 text-sm">{step.description}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Environment Info */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-xs text-slate-500 uppercase mb-1">Environment</div>
              <p className="text-white text-sm">{currentBug.environment || "Not specified"}</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-xs text-slate-500 uppercase mb-1">Affected Version</div>
              <p className="text-white text-sm">{currentBug.affected_version || "Not specified"}</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-xs text-slate-500 uppercase mb-1">Fixed Version</div>
              <p className="text-white text-sm">{currentBug.fixed_version || "Not fixed yet"}</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-xs text-slate-500 uppercase mb-1">Bug Type</div>
              <p className="text-white text-sm capitalize">{currentBug.bug_type || "Not specified"}</p>
            </div>
          </div>

          {/* Resolution */}
          {currentBug.resolution && (
            <div className="bg-slate-800/50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-white mb-2">Resolution</h4>
              <p className="text-slate-300 text-sm">{currentBug.resolution}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-700">
            <div>
              <span className="text-xs text-slate-500">Created</span>
              <p className="text-sm text-white">{formatDate(currentBug.created_at)}</p>
            </div>
            <div>
              <span className="text-xs text-slate-500">Last Updated</span>
              <p className="text-sm text-white">{formatDate(currentBug.updated_at)}</p>
            </div>
            <div>
              <span className="text-xs text-slate-500">Priority</span>
              <p className="text-sm text-white capitalize">{currentBug.priority}</p>
            </div>
          </div>

          {/* Activity Timeline */}
          {workspaceId && (
            <div className="pt-4 border-t border-slate-700">
              <BugTimeline workspaceId={workspaceId} bugId={currentBug.id} />
            </div>
          )}
        </div>
      </div>

      {/* Fix Bug Dialog */}
      <BugActionDialog
        isOpen={activeDialog === "fix"}
        onClose={() => setActiveDialog(null)}
        onConfirm={handleFix}
        title="Mark Bug as Fixed"
        description="Enter details about the fix for this bug."
        fields={[
          {
            name: "fixed_version",
            label: "Fixed in Version",
            type: "text",
            placeholder: "e.g., 1.2.3",
          },
          {
            name: "root_cause",
            label: "Root Cause",
            type: "textarea",
            placeholder: "What caused this bug?",
          },
          {
            name: "resolution_notes",
            label: "Resolution Notes",
            type: "textarea",
            placeholder: "How was this bug fixed?",
          },
        ]}
        confirmLabel="Mark as Fixed"
        confirmVariant="success"
        isLoading={isFixing}
      />

      {/* Close Bug Dialog */}
      <BugActionDialog
        isOpen={activeDialog === "close"}
        onClose={() => setActiveDialog(null)}
        onConfirm={handleClose}
        title="Close Bug"
        description="Select the resolution type for this bug."
        fields={[
          {
            name: "resolution",
            label: "Resolution",
            type: "select",
            required: true,
            defaultValue: "fixed",
            options: [
              { value: "fixed", label: "Fixed" },
              { value: "wont_fix", label: "Won't Fix" },
              { value: "duplicate", label: "Duplicate" },
              { value: "cannot_reproduce", label: "Cannot Reproduce" },
            ],
          },
          {
            name: "notes",
            label: "Notes",
            type: "textarea",
            placeholder: "Additional notes about the resolution...",
          },
        ]}
        confirmLabel="Close Bug"
        isLoading={isClosing}
      />

      {/* Reopen Bug Dialog */}
      <BugActionDialog
        isOpen={activeDialog === "reopen"}
        onClose={() => setActiveDialog(null)}
        onConfirm={handleReopen}
        title="Reopen Bug"
        description="Please provide a reason for reopening this bug."
        fields={[
          {
            name: "reason",
            label: "Reason",
            type: "textarea",
            placeholder: "Why is this bug being reopened?",
            required: true,
          },
        ]}
        confirmLabel="Reopen Bug"
        confirmVariant="danger"
        isLoading={isReopening}
      />
    </div>
  );
}
