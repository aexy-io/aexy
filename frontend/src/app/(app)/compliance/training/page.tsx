"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import {
  GraduationCap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
  RefreshCw,
  BookOpen,
  Plus,
  X,
  Loader2,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  complianceApi,
  workspaceApi,
  MandatoryTrainingWithStats,
  TrainingAssignmentWithDetails,
  WorkspaceMember,
  AppliesTo,
} from "@/lib/api";

// ---- Create Training Modal ----
function CreateTrainingModal({
  workspaceId,
  developerId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  developerId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dueDays, setDueDays] = useState(30);
  const [recurringMonths, setRecurringMonths] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await complianceApi.training.create(workspaceId, developerId, {
        name: name.trim(),
        description: description.trim() || undefined,
        due_days_after_assignment: dueDays,
        recurring_months: recurringMonths ? Number(recurringMonths) : undefined,
        applies_to_type: "all" as AppliesTo,
      });
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create training");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              New Training Program
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Training Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Security Awareness Training"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Brief description of this training..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Due Days After Assignment
              </label>
              <input
                type="number"
                value={dueDays}
                onChange={(e) => setDueDays(Number(e.target.value))}
                min={1}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Recurring (months) <span className="text-gray-400">(opt)</span>
              </label>
              <input
                type="number"
                value={recurringMonths}
                onChange={(e) => setRecurringMonths(e.target.value ? Number(e.target.value) : "")}
                min={1}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="—"
              />
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Training
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Assign Training Modal ----
function AssignTrainingModal({
  workspaceId,
  developerId,
  training,
  members,
  onClose,
  onAssigned,
}: {
  workspaceId: string;
  developerId: string;
  training: MandatoryTrainingWithStats;
  members: WorkspaceMember[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleMember = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await complianceApi.assignments.bulkCreate(workspaceId, developerId, {
        mandatory_training_id: training.id,
        developer_ids: selectedIds,
      });
      onAssigned();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to assign training");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Assign: {training.name}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Select members to assign this training to:
          </p>
          <div className="max-h-60 overflow-y-auto space-y-2 border border-gray-200 dark:border-gray-700 rounded-lg p-2">
            {members.filter((m) => m.status === "active").map((member) => (
              <label
                key={member.developer_id}
                className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(member.developer_id)}
                  onChange={() => toggleMember(member.developer_id)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {member.developer_name || "Unknown"}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {member.developer_email}
                  </p>
                </div>
              </label>
            ))}
          </div>

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={selectedIds.length === 0 || submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Assign ({selectedIds.length})
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Main Page ----
export default function ComplianceTrainingPage() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId } = useWorkspace();

  const [loading, setLoading] = useState(true);
  const [trainings, setTrainings] = useState<MandatoryTrainingWithStats[]>([]);
  const [myAssignments, setMyAssignments] = useState<TrainingAssignmentWithDetails[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [assignTraining, setAssignTraining] = useState<MandatoryTrainingWithStats | null>(null);

  const fetchData = useCallback(async () => {
    if (!currentWorkspaceId) return;
    setLoading(true);
    try {
      const [trainingsRes, assignmentsRes, membersRes] = await Promise.all([
        complianceApi.training.list(currentWorkspaceId),
        complianceApi.assignments.list(currentWorkspaceId, {
          developer_id: user?.id,
        }),
        workspaceApi.getMembers(currentWorkspaceId),
      ]);
      setTrainings(trainingsRes.items || []);
      setMyAssignments(assignmentsRes.items || []);
      setMembers(membersRes || []);
    } catch (err) {
      console.error("Failed to load training data:", err);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspaceId, user?.id]);

  useEffect(() => {
    if (isAuthenticated && currentWorkspaceId) {
      fetchData();
    }
  }, [isAuthenticated, currentWorkspaceId, fetchData]);

  const handleDeleteTraining = async (trainingId: string) => {
    if (!currentWorkspaceId || !user?.id) return;
    if (!window.confirm("Delete this training program?")) return;
    try {
      await complianceApi.training.delete(trainingId, currentWorkspaceId, user.id);
      fetchData();
    } catch (err) {
      console.error("Failed to delete training:", err);
      alert("Failed to delete training. Please try again.");
    }
  };

  const handleAcknowledge = async (assignmentId: string) => {
    if (!currentWorkspaceId || !user?.id) return;
    try {
      await complianceApi.assignments.acknowledge(assignmentId, currentWorkspaceId, user.id);
      fetchData();
    } catch (err) {
      console.error("Failed to acknowledge assignment:", err);
    }
  };

  const handleStart = async (assignmentId: string) => {
    if (!currentWorkspaceId || !user?.id) return;
    try {
      await complianceApi.assignments.start(assignmentId, currentWorkspaceId, user.id);
      fetchData();
    } catch (err) {
      console.error("Failed to start assignment:", err);
    }
  };

  const handleComplete = async (assignmentId: string) => {
    if (!currentWorkspaceId || !user?.id) return;
    try {
      await complianceApi.assignments.complete(assignmentId, currentWorkspaceId, user.id);
      fetchData();
    } catch (err) {
      console.error("Failed to complete assignment:", err);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Training</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Mandatory training programs and your assignments
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchData}
            className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            New Training
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* My Assignments */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              My Assignments
            </h2>
            {myAssignments.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">No training assignments</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {myAssignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <BookOpen className="h-5 w-5 text-blue-500" />
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">
                          {assignment.training_name || "Training"}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Status: {assignment.status}
                          {assignment.due_date && (
                            <> &middot; Due: {new Date(assignment.due_date).toLocaleDateString()}</>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {assignment.status === "completed" ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : assignment.status === "overdue" ? (
                        <>
                          <AlertTriangle className="h-5 w-5 text-red-500" />
                          <button
                            onClick={() => handleComplete(assignment.id)}
                            className="px-3 py-1 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700"
                          >
                            Complete
                          </button>
                        </>
                      ) : assignment.status === "pending" ? (
                        <button
                          onClick={() => handleAcknowledge(assignment.id)}
                          className="px-3 py-1 text-xs font-medium text-blue-600 border border-blue-300 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        >
                          Acknowledge
                        </button>
                      ) : assignment.status === "in_progress" ? (
                        <button
                          onClick={() => handleComplete(assignment.id)}
                          className="px-3 py-1 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700"
                        >
                          Complete
                        </button>
                      ) : (
                        <Clock className="h-5 w-5 text-amber-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* All Trainings */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              All Training Programs
            </h2>
            {trainings.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
                <GraduationCap className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400 mb-4">No training programs configured</p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  Create Training
                </button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {trainings.map((training) => (
                  <div
                    key={training.id}
                    className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <GraduationCap className="h-5 w-5 text-blue-500" />
                        <h3 className="font-medium text-gray-900 dark:text-white">{training.name}</h3>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setAssignTraining(training)}
                          title="Assign to members"
                          className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <UserPlus className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTraining(training.id)}
                          title="Delete training"
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {training.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{training.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {training.total_assignments || 0} assigned
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        {training.completed_assignments || 0} completed
                      </span>
                      {(training.overdue_assignments || 0) > 0 && (
                        <span className="flex items-center gap-1 text-red-500">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {training.overdue_assignments} overdue
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreate && currentWorkspaceId && user?.id && (
        <CreateTrainingModal
          workspaceId={currentWorkspaceId}
          developerId={user.id}
          onClose={() => setShowCreate(false)}
          onCreated={fetchData}
        />
      )}

      {assignTraining && currentWorkspaceId && user?.id && (
        <AssignTrainingModal
          workspaceId={currentWorkspaceId}
          developerId={user.id}
          training={assignTraining}
          members={members}
          onClose={() => setAssignTraining(null)}
          onAssigned={fetchData}
        />
      )}
    </div>
  );
}
