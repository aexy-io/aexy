"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  User,
  Users,
  Mail,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  Send,
  Lock,
  ExternalLink,
  Link2,
  Zap,
  UserCircle,
  Plus,
  X,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import { useTicket, useTicketResponses } from "@/hooks/useTicketing";
import { useTeams } from "@/hooks/useTeams";
import { useProjects } from "@/hooks/useProjects";
import { TicketStatus, TicketPriority, TicketSeverity, ticketsApi } from "@/lib/api";

const STATUS_OPTIONS: { value: TicketStatus; label: string; color: string }[] = [
  { value: "new", label: "New", color: "text-blue-400" },
  { value: "acknowledged", label: "Acknowledged", color: "text-purple-400" },
  { value: "in_progress", label: "In Progress", color: "text-yellow-400" },
  { value: "waiting_on_submitter", label: "Waiting on Submitter", color: "text-orange-400" },
  { value: "resolved", label: "Resolved", color: "text-green-400" },
  { value: "closed", label: "Closed", color: "text-slate-400" },
];

const PRIORITY_OPTIONS: { value: TicketPriority; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "text-slate-400" },
  { value: "medium", label: "Medium", color: "text-blue-400" },
  { value: "high", label: "High", color: "text-orange-400" },
  { value: "urgent", label: "Urgent", color: "text-red-400" },
];

const SEVERITY_OPTIONS: { value: TicketSeverity; label: string; color: string; description: string }[] = [
  { value: "low", label: "Low", color: "text-slate-400", description: "Minor impact" },
  { value: "medium", label: "Medium", color: "text-blue-400", description: "Moderate impact" },
  { value: "high", label: "High", color: "text-orange-400", description: "Significant impact" },
  { value: "critical", label: "Critical", color: "text-red-400", description: "System down" },
];

export default function TicketDetailPage() {
  const router = useRouter();
  const params = useParams();
  const ticketId = params.ticketId as string;

  useAuth();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const { ticket, isLoading, updateTicket, assignTicket, isUpdating, isAssigning } = useTicket(workspaceId, ticketId);
  const { responses, addResponse, isAddingResponse } = useTicketResponses(workspaceId, ticketId);
  const { members } = useWorkspaceMembers(workspaceId);
  const { teams } = useTeams(workspaceId);

  const [newResponse, setNewResponse] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [newStatus, setNewStatus] = useState<TicketStatus | undefined>();

  // Create task modal state
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState("medium");
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [createTaskError, setCreateTaskError] = useState<string | null>(null);

  const { projects } = useProjects(workspaceId);

  const handleCreateTask = async () => {
    if (!workspaceId || !ticketId || !selectedProjectId) return;

    setIsCreatingTask(true);
    setCreateTaskError(null);

    try {
      await ticketsApi.createTaskFromTicket(workspaceId, ticketId, {
        project_id: selectedProjectId,
        title: taskTitle || undefined,
        priority: taskPriority,
      });

      // Refresh ticket data to show linked task
      window.location.reload();
    } catch (err: any) {
      setCreateTaskError(err?.response?.data?.detail || "Failed to create task");
    } finally {
      setIsCreatingTask(false);
    }
  };

  const handleSubmitResponse = async () => {
    if (!newResponse.trim()) return;

    await addResponse({
      content: newResponse,
      is_internal: isInternal,
      new_status: newStatus,
    });

    setNewResponse("");
    setIsInternal(false);
    setNewStatus(undefined);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const formatDuration = (startDate: string, endDate?: string) => {
    const start = new Date(startDate).getTime();
    const end = endDate ? new Date(endDate).getTime() : Date.now();
    const diff = end - start;

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h`;
    return "< 1h";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950">
<main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-slate-400">Loading ticket...</div>
        </main>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="min-h-screen bg-slate-950">
<main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-slate-400">Ticket not found</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
<main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <button
          onClick={() => router.push("/tickets")}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Tickets
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Ticket Header */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <span className="text-sm font-mono text-purple-400">
                    TKT-{ticket.ticket_number}
                  </span>
                  <h1 className="text-2xl font-bold text-white mt-1">
                    {ticket.form_name || "Ticket"}
                  </h1>
                </div>
                {ticket.sla_breached && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-red-900/30 text-red-400 rounded-lg text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    SLA Breached
                  </div>
                )}
              </div>

              {/* Submitter Info */}
              <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                {ticket.submitter_name && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {ticket.submitter_name}
                  </div>
                )}
                {ticket.submitter_email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    {ticket.submitter_email}
                    {ticket.email_verified && (
                      <CheckCircle2 className="h-3 w-3 text-green-400" />
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {formatDate(ticket.created_at)}
                </div>
              </div>
            </div>

            {/* Field Values */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Submission Details</h2>
              <div className="space-y-4">
                {Object.entries(ticket.field_values).map(([key, value]) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-slate-400 mb-1 capitalize">
                      {key.replace(/_/g, " ")}
                    </label>
                    <div className="text-white bg-slate-900 rounded-lg p-3">
                      {typeof value === "string" ? (
                        <p className="whitespace-pre-wrap">{value}</p>
                      ) : Array.isArray(value) ? (
                        <div className="flex flex-wrap gap-2">
                          {value.map((v, i) => (
                            <span
                              key={i}
                              className="px-2 py-1 bg-slate-700 rounded text-sm"
                            >
                              {String(v)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p>{JSON.stringify(value)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Responses Timeline */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Activity & Responses
              </h2>

              <div className="space-y-4 mb-6">
                {responses.length === 0 ? (
                  <p className="text-slate-400 text-center py-4">No responses yet</p>
                ) : (
                  responses.map((response) => (
                    <div
                      key={response.id}
                      className={`p-4 rounded-lg ${
                        response.is_internal
                          ? "bg-yellow-900/20 border border-yellow-800/50"
                          : "bg-slate-900"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">
                            {response.author_name || response.author_email || "System"}
                          </span>
                          {response.is_internal && (
                            <span className="flex items-center gap-1 text-xs text-yellow-400">
                              <Lock className="h-3 w-3" />
                              Internal
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-500">
                          {formatDate(response.created_at)}
                        </span>
                      </div>
                      <p className="text-slate-300 whitespace-pre-wrap">{response.content}</p>
                      {response.new_status && (
                        <div className="mt-2 text-sm text-slate-400">
                          Status changed: {response.old_status} → {response.new_status}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Add Response */}
              <div className="border-t border-slate-700 pt-4">
                <textarea
                  value={newResponse}
                  onChange={(e) => setNewResponse(e.target.value)}
                  placeholder="Add a response..."
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isInternal}
                        onChange={(e) => setIsInternal(e.target.checked)}
                        className="rounded border-slate-600 bg-slate-700 text-purple-500 focus:ring-purple-500"
                      />
                      <Lock className="h-4 w-4" />
                      Internal note
                    </label>
                    <select
                      value={newStatus || ""}
                      onChange={(e) => setNewStatus(e.target.value as TicketStatus || undefined)}
                      className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">No status change</option>
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          Change to: {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleSubmitResponse}
                    disabled={!newResponse.trim() || isAddingResponse}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="h-4 w-4" />
                    {isAddingResponse ? "Sending..." : "Send"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Status & Priority & Severity */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <h3 className="text-sm font-medium text-slate-400 mb-3">Status</h3>
              <select
                value={ticket.status}
                onChange={(e) => updateTicket({ status: e.target.value as TicketStatus })}
                disabled={isUpdating}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <h3 className="text-sm font-medium text-slate-400 mb-3 mt-4">Priority</h3>
              <select
                value={ticket.priority || ""}
                onChange={(e) => updateTicket({ priority: e.target.value as TicketPriority })}
                disabled={isUpdating}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">No priority</option>
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <h3 className="text-sm font-medium text-slate-400 mb-3 mt-4 flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Severity
              </h3>
              <select
                value={ticket.severity || ""}
                onChange={(e) => updateTicket({ severity: e.target.value as TicketSeverity })}
                disabled={isUpdating}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">No severity</option>
                {SEVERITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} - {opt.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Assignment */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                <UserCircle className="h-4 w-4" />
                Assignee
              </h3>
              <select
                value={ticket.assignee_id || ""}
                onChange={(e) => assignTicket({ assignee_id: e.target.value || undefined })}
                disabled={isAssigning}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.id} value={member.developer_id}>
                    {member.developer_name || member.developer_email}
                  </option>
                ))}
              </select>
              {ticket.assignee_name && (
                <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
                  <User className="h-4 w-4" />
                  Currently: {ticket.assignee_name}
                </div>
              )}

              <h3 className="text-sm font-medium text-slate-400 mb-3 mt-4 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Team
              </h3>
              <select
                value={ticket.team_id || ""}
                onChange={(e) => assignTicket({ team_id: e.target.value || undefined })}
                disabled={isAssigning}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">No team</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              {ticket.team_name && (
                <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
                  <Users className="h-4 w-4" />
                  Currently: {ticket.team_name}
                </div>
              )}
            </div>

            {/* SLA Info */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <h3 className="text-sm font-medium text-slate-400 mb-3">SLA Metrics</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-slate-400">Time open</span>
                  <span className="text-white font-mono">
                    {formatDuration(ticket.created_at, ticket.resolved_at)}
                  </span>
                </div>
                {ticket.first_response_at && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">First response</span>
                    <span className="text-white font-mono">
                      {formatDuration(ticket.created_at, ticket.first_response_at)}
                    </span>
                  </div>
                )}
                {ticket.sla_due_at && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">SLA Due</span>
                    <span className={`font-mono ${ticket.sla_breached ? "text-red-400" : "text-white"}`}>
                      {formatDate(ticket.sla_due_at)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* External Links */}
            {ticket.external_issues.length > 0 && (
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
                <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  External Issues
                </h3>
                <div className="space-y-2">
                  {ticket.external_issues.map((issue, i) => (
                    <a
                      key={i}
                      href={issue.issue_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2 bg-slate-900 rounded-lg hover:bg-slate-700 transition"
                    >
                      <span className="text-white capitalize">{issue.platform}</span>
                      <ExternalLink className="h-4 w-4 text-slate-400" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Linked Task */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Linked Task
              </h3>
              {ticket.linked_task_id ? (
                <button
                  onClick={() => router.push(`/sprints?task=${ticket.linked_task_id}`)}
                  className="w-full flex items-center justify-between p-2 bg-slate-900 rounded-lg hover:bg-slate-700 transition"
                >
                  <span className="text-white">View Sprint Task</span>
                  <ExternalLink className="h-4 w-4 text-slate-400" />
                </button>
              ) : (
                <button
                  onClick={() => setShowCreateTaskModal(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition"
                >
                  <Plus className="h-4 w-4" />
                  Create Task
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Create Task Modal */}
        {showCreateTaskModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-md mx-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Create Sprint Task</h2>
                <button
                  onClick={() => setShowCreateTaskModal(false)}
                  className="text-slate-400 hover:text-white transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {createTaskError && (
                <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
                  {createTaskError}
                </div>
              )}

              <div className="space-y-4">
                {/* Project Selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Project <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Select a project...</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Task Title (optional override) */}
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Task Title
                    <span className="text-slate-500 ml-1">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="Auto-generated from ticket"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Priority
                  </label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowCreateTaskModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateTask}
                  disabled={!selectedProjectId || isCreatingTask}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingTask ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Create Task
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
