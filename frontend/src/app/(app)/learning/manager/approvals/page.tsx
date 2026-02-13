"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  learningManagementApi,
  ApprovalQueue,
  ApprovalQueueItem,
  CourseApprovalRequestWithDetails,
  ApprovalStatus,
} from "@/lib/api";

function formatCurrency(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function getStatusColor(status: ApprovalStatus): string {
  switch (status) {
    case "approved":
      return "bg-green-500/20 text-green-400";
    case "rejected":
      return "bg-red-500/20 text-red-400";
    case "cancelled":
      return "bg-gray-500/20 text-gray-400";
    default:
      return "bg-yellow-500/20 text-yellow-400";
  }
}

export default function ApprovalsPage() {
  const [activeTab, setActiveTab] = useState<"pending" | "all">("pending");
  const [selectedRequest, setSelectedRequest] = useState<CourseApprovalRequestWithDetails | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const queryClient = useQueryClient();

  // Fetch approval queue
  const { data: queue, isLoading: queueLoading } = useQuery({
    queryKey: ["approval-queue"],
    queryFn: () => learningManagementApi.approvals.getQueue(),
    enabled: activeTab === "pending",
  });

  // Fetch all approval requests
  const { data: allRequests, isLoading: allLoading } = useQuery({
    queryKey: ["approval-requests"],
    queryFn: () => learningManagementApi.approvals.list({ page_size: 50 }),
    enabled: activeTab === "all",
  });

  // Decision mutation
  const decideMutation = useMutation({
    mutationFn: ({ requestId, approved }: { requestId: string; approved: boolean }) =>
      learningManagementApi.approvals.decide(requestId, {
        approved,
        reason: decisionReason || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval-queue"] });
      queryClient.invalidateQueries({ queryKey: ["approval-requests"] });
      queryClient.invalidateQueries({ queryKey: ["manager-dashboard"] });
      setSelectedRequest(null);
      setDecisionReason("");
    },
  });

  const handleDecision = (approved: boolean) => {
    if (!selectedRequest) return;
    decideMutation.mutate({ requestId: selectedRequest.id, approved });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/learning/manager"
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Approval Queue</h1>
            <p className="text-slate-400 mt-1">
              Review and manage course approval requests
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-slate-900 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab("pending")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "pending"
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            Pending
            {queue && queue.total > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-orange-500 text-white text-xs rounded-full">
                {queue.total}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "all"
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            All Requests
          </button>
        </div>

        {/* Pending Tab */}
        {activeTab === "pending" && (
          <div className="space-y-4">
            {queueLoading ? (
              <div className="text-center py-12 text-slate-400">
                Loading approval queue...
              </div>
            ) : queue && queue.items.length > 0 ? (
              <>
                {/* Summary */}
                <div className="bg-slate-900 rounded-lg p-4 mb-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <span className="text-slate-400">
                        {queue.total} pending request{queue.total !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400">Total requested:</span>
                      <span className="ml-2 font-semibold">
                        {formatCurrency(queue.total_pending_cost_cents)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Request List */}
                {queue.items.map((item) => (
                  <ApprovalRequestCard
                    key={item.request.id}
                    item={item}
                    onSelect={() => setSelectedRequest(item.request)}
                  />
                ))}
              </>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <svg
                  className="w-16 h-16 mx-auto mb-4 text-slate-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-lg">No pending approvals</p>
                <p className="text-sm mt-2">All caught up!</p>
              </div>
            )}
          </div>
        )}

        {/* All Requests Tab */}
        {activeTab === "all" && (
          <div className="space-y-4">
            {allLoading ? (
              <div className="text-center py-12 text-slate-400">
                Loading requests...
              </div>
            ) : allRequests && allRequests.items.length > 0 ? (
              <div className="bg-slate-900 rounded-lg overflow-hidden overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">
                        Course
                      </th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">
                        Requester
                      </th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">
                        Cost
                      </th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">
                        Status
                      </th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {allRequests.items.map((request) => (
                      <tr
                        key={request.id}
                        className="border-b border-slate-800 hover:bg-slate-800/50 cursor-pointer"
                        onClick={() => setSelectedRequest(request)}
                      >
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium">{request.course_title}</p>
                            {request.course_provider && (
                              <p className="text-sm text-slate-400">
                                {request.course_provider}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p>{request.requester_name}</p>
                        </td>
                        <td className="px-4 py-3">
                          {formatCurrency(request.estimated_cost_cents, request.currency)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 rounded text-xs ${getStatusColor(
                              request.status
                            )}`}
                          >
                            {request.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-sm">
                          {new Date(request.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                No approval requests found
              </div>
            )}
          </div>
        )}
      </div>

      {/* Request Detail Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-bold">{selectedRequest.course_title}</h2>
                  {selectedRequest.course_provider && (
                    <p className="text-slate-400">{selectedRequest.course_provider}</p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Status */}
                <div className="flex items-center gap-3">
                  <span
                    className={`px-3 py-1 rounded-full text-sm ${getStatusColor(
                      selectedRequest.status
                    )}`}
                  >
                    {selectedRequest.status}
                  </span>
                  {selectedRequest.days_pending !== null && selectedRequest.status === "pending" && (
                    <span className="text-slate-400 text-sm">
                      Pending for {selectedRequest.days_pending} day
                      {selectedRequest.days_pending !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-4 bg-slate-800 rounded-lg p-4">
                  <div>
                    <p className="text-sm text-slate-400">Requester</p>
                    <p className="font-medium">{selectedRequest.requester_name}</p>
                    <p className="text-sm text-slate-400">{selectedRequest.requester_email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Estimated Cost</p>
                    <p className="font-medium text-lg">
                      {formatCurrency(selectedRequest.estimated_cost_cents, selectedRequest.currency)}
                    </p>
                  </div>
                  {selectedRequest.estimated_hours && (
                    <div>
                      <p className="text-sm text-slate-400">Estimated Hours</p>
                      <p className="font-medium">{selectedRequest.estimated_hours} hours</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-slate-400">Request Type</p>
                    <p className="font-medium capitalize">{selectedRequest.request_type}</p>
                  </div>
                </div>

                {/* URL */}
                {selectedRequest.course_url && (
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Course URL</p>
                    <a
                      href={selectedRequest.course_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline break-all"
                    >
                      {selectedRequest.course_url}
                    </a>
                  </div>
                )}

                {/* Description */}
                {selectedRequest.course_description && (
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Description</p>
                    <p className="text-slate-300">{selectedRequest.course_description}</p>
                  </div>
                )}

                {/* Justification */}
                {selectedRequest.justification && (
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Business Justification</p>
                    <p className="text-slate-300">{selectedRequest.justification}</p>
                  </div>
                )}

                {/* Skills */}
                {selectedRequest.skills_to_gain.length > 0 && (
                  <div>
                    <p className="text-sm text-slate-400 mb-2">Skills to Gain</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedRequest.skills_to_gain.map((skill, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 bg-slate-800 rounded text-sm"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Linked Goal */}
                {selectedRequest.linked_goal_title && (
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Linked Learning Goal</p>
                    <p className="text-slate-300">{selectedRequest.linked_goal_title}</p>
                  </div>
                )}

                {/* Decision Info (if already decided) */}
                {selectedRequest.status !== "pending" && selectedRequest.decision_reason && (
                  <div className="bg-slate-800 rounded-lg p-4">
                    <p className="text-sm text-slate-400 mb-1">Decision Reason</p>
                    <p className="text-slate-300">{selectedRequest.decision_reason}</p>
                    {selectedRequest.decided_by_name && (
                      <p className="text-sm text-slate-400 mt-2">
                        Decided by {selectedRequest.decided_by_name}
                      </p>
                    )}
                  </div>
                )}

                {/* Decision Actions (if pending) */}
                {selectedRequest.status === "pending" && (
                  <div className="border-t border-slate-800 pt-4 mt-6">
                    <div className="mb-4">
                      <label className="block text-sm text-slate-400 mb-1">
                        Decision Reason (optional)
                      </label>
                      <textarea
                        value={decisionReason}
                        onChange={(e) => setDecisionReason(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-800 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                        rows={2}
                        placeholder="Add a note about your decision..."
                      />
                    </div>
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => handleDecision(false)}
                        disabled={decideMutation.isPending}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {decideMutation.isPending ? "Processing..." : "Reject"}
                      </button>
                      <button
                        onClick={() => handleDecision(true)}
                        disabled={decideMutation.isPending}
                        className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {decideMutation.isPending ? "Processing..." : "Approve"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalRequestCard({
  item,
  onSelect,
}: {
  item: ApprovalQueueItem;
  onSelect: () => void;
}) {
  const { request, budget_available, budget_remaining_cents, auto_approve_eligible } = item;

  return (
    <div
      className="bg-slate-900 rounded-lg p-5 hover:bg-slate-800/50 cursor-pointer transition-colors"
      onClick={onSelect}
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-semibold">{request.course_title}</h3>
          <p className="text-sm text-slate-400">
            {request.requester_name}
            {request.course_provider && ` • ${request.course_provider}`}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-lg">
            {formatCurrency(request.estimated_cost_cents, request.currency)}
          </p>
          {request.estimated_hours && (
            <p className="text-sm text-slate-400">{request.estimated_hours} hours</p>
          )}
        </div>
      </div>

      {request.justification && (
        <p className="text-sm text-slate-400 mb-3 line-clamp-2">
          {request.justification}
        </p>
      )}

      <div className="flex items-center gap-3 text-sm">
        {request.days_pending !== null && (
          <span className="text-slate-400">
            Pending {request.days_pending} day{request.days_pending !== 1 ? "s" : ""}
          </span>
        )}
        {!budget_available && (
          <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs">
            Budget Exceeded
          </span>
        )}
        {auto_approve_eligible && (
          <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
            Auto-approve Eligible
          </span>
        )}
        {budget_remaining_cents !== null && (
          <span className="text-slate-400">
            Budget remaining: {formatCurrency(budget_remaining_cents)}
          </span>
        )}
      </div>
    </div>
  );
}
