"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Shield,
  ChevronRight,
  Loader2,
  Check,
  Minus,
  X,
  Package,
  Users,
  Settings2,
  FileText,
  Crown,
  Clock,
  CheckCircle,
  XCircle,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSubscription } from "@/hooks/useSubscription";
import { useMemberAppAccess, useAppAccessTemplates } from "@/hooks/useAppAccess";
import { useAdminAccessRequests } from "@/hooks/useAccessRequests";
import { MemberAppAccessModal } from "@/components/members/MemberAppAccessModal";
import { getAllApps } from "@/config/appDefinitions";

export default function AccessControlPage() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "requests" ? "requests" : "matrix";

  const { currentWorkspaceId, currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspaceId || "";
  const { isEnterprise } = useSubscription(currentWorkspaceId);

  const {
    members,
    apps: matrixApps,
    isLoadingMatrix,
    matrixError,
    bulkApplyTemplate,
    isBulkApplying,
  } = useMemberAppAccess(workspaceId);

  const { templates, isLoading: templatesLoading } = useAppAccessTemplates(workspaceId);

  const [activeTab, setActiveTab] = useState<"matrix" | "requests">(initialTab);

  const {
    requests,
    pendingCount,
    isLoadingRequests,
    approveRequest,
    isApproving,
    rejectRequest,
    isRejecting,
  } = useAdminAccessRequests(workspaceId);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [editingMember, setEditingMember] = useState<{
    developerId: string;
    developerName: string;
  } | null>(null);
  const [reviewingRequest, setReviewingRequest] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  // Get display apps (use frontend config as source of truth for icons)
  const displayApps = getAllApps().filter(app => app.id !== "dashboard");

  const toggleMemberSelection = (developerId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(developerId)
        ? prev.filter((id) => id !== developerId)
        : [...prev, developerId]
    );
  };

  const toggleAllMembers = () => {
    if (selectedMembers.length === members.length) {
      setSelectedMembers([]);
    } else {
      setSelectedMembers(members.map((m) => m.developer_id));
    }
  };

  const handleBulkApply = async () => {
    if (!selectedTemplateId || selectedMembers.length === 0) return;
    try {
      await bulkApplyTemplate({
        developerIds: selectedMembers,
        templateId: selectedTemplateId,
      });
      setSelectedMembers([]);
      setSelectedTemplateId("");
    } catch (error) {
      console.error("Bulk apply failed:", error);
    }
  };

  const handleApprove = async (requestId: string) => {
    try {
      await approveRequest({
        requestId,
        notes: reviewNotes.trim() || undefined,
      });
      setReviewingRequest(null);
      setReviewNotes("");
    } catch (error) {
      console.error("Approve failed:", error);
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      await rejectRequest({
        requestId,
        notes: reviewNotes.trim() || undefined,
      });
      setReviewingRequest(null);
      setReviewNotes("");
    } catch (error) {
      console.error("Reject failed:", error);
    }
  };

  const getAccessIcon = (status: "full" | "partial" | "none") => {
    switch (status) {
      case "full":
        return <Check className="h-4 w-4 text-green-500" />;
      case "partial":
        return <Minus className="h-4 w-4 text-amber-500" />;
      case "none":
        return <X className="h-4 w-4 text-muted-foreground/50" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500">
            <Clock className="h-3 w-3" />
            Pending
          </span>
        );
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500">
            <CheckCircle className="h-3 w-3" />
            Approved
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400">
            <XCircle className="h-3 w-3" />
            Rejected
          </span>
        );
      case "withdrawn":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
            Withdrawn
          </span>
        );
      default:
        return null;
    }
  };

  const isLoading = isLoadingMatrix || templatesLoading;

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const reviewedRequests = requests.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Access Control</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage app access for workspace members</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/settings/access/logs">
            <Button variant="outline" className="gap-2">
              <FileText className="h-4 w-4" />
              Access Logs
              {!isEnterprise && (
                <Crown className="h-3 w-3 text-amber-400" />
              )}
            </Button>
          </Link>
          <Link href="/settings/access/templates">
            <Button variant="outline" className="gap-2">
              <Package className="h-4 w-4" />
              Manage Templates
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab("matrix")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "matrix"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Access Matrix
        </button>
        <button
          onClick={() => setActiveTab("requests")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "requests"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Requests
          {pendingCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-amber-500/20 text-amber-500 text-xs font-medium">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {activeTab === "matrix" ? (
        <div>
          {/* Bulk Actions */}
          {selectedMembers.length > 0 && (
            <div className="mb-4 p-4 bg-card border border-border rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <span className="text-sm text-foreground">
                {selectedMembers.length} member(s) selected
              </span>
              <div className="flex items-center gap-3">
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="rounded-md border border-border bg-muted px-3 py-1.5 text-sm text-foreground"
                >
                  <option value="">Select template...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={handleBulkApply}
                  disabled={!selectedTemplateId || isBulkApplying}
                >
                  {isBulkApplying && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Apply to Selected
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedMembers([])}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* Matrix Table */}
          {isLoading ? (
            <div className="bg-card border border-border rounded-lg overflow-hidden animate-pulse">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-left">
                        <div className="h-4 w-20 bg-accent rounded" />
                      </th>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <th key={i} className="px-3 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <div className="h-4 w-4 bg-accent rounded" />
                            <div className="h-3 w-12 bg-accent rounded" />
                          </div>
                        </th>
                      ))}
                      <th className="px-4 py-3"><div className="h-3 w-12 bg-accent rounded mx-auto" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4].map((i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <div className="h-4 w-28 bg-accent rounded" />
                            <div className="h-3 w-16 bg-accent rounded" />
                          </div>
                        </td>
                        {[1, 2, 3, 4, 5].map((j) => (
                          <td key={j} className="px-3 py-3 text-center">
                            <div className="h-4 w-4 bg-accent rounded mx-auto" />
                          </td>
                        ))}
                        <td className="px-4 py-3">
                          <div className="h-7 w-12 bg-accent rounded mx-auto" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : matrixError ? (
            <div className="text-center py-20 text-red-400">
              Failed to load access matrix. Please try again.
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="sticky left-0 bg-card z-10 px-4 py-3 text-left">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={
                              selectedMembers.length === members.length &&
                              members.length > 0
                            }
                            onChange={toggleAllMembers}
                            className="h-4 w-4 rounded border-border"
                          />
                          <span className="text-sm font-medium text-foreground">
                            Member
                          </span>
                        </div>
                      </th>
                      {displayApps.map((app) => {
                        const Icon = app.icon;
                        return (
                          <th
                            key={app.id}
                            className="px-3 py-3 text-center min-w-[100px]"
                          >
                            <div className="flex flex-col items-center gap-1">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <span className="text-xs font-medium text-muted-foreground">
                                {app.name}
                              </span>
                            </div>
                          </th>
                        );
                      })}
                      <th className="px-4 py-3 text-center">
                        <span className="text-xs font-medium text-muted-foreground">
                          Actions
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr
                        key={member.developer_id}
                        className="border-b border-border/50 hover:bg-accent/30"
                      >
                        <td className="sticky left-0 bg-card z-10 px-4 py-3">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={selectedMembers.includes(
                                member.developer_id
                              )}
                              onChange={() =>
                                toggleMemberSelection(member.developer_id)
                              }
                              className="h-4 w-4 rounded border-border"
                            />
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {member.developer_name || "Unknown"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {member.role_name}
                                {member.is_admin && (
                                  <span className="ml-1 text-violet-400">
                                    (Admin)
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </td>
                        {displayApps.map((app) => (
                          <td key={app.id} className="px-3 py-3 text-center">
                            <div className="flex justify-center">
                              {getAccessIcon(
                                member.apps[app.id] || "none"
                              )}
                            </div>
                          </td>
                        ))}
                        <td className="px-4 py-3 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setEditingMember({
                                developerId: member.developer_id,
                                developerName: member.developer_name || "",
                              })
                            }
                            className="gap-1"
                          >
                            <Settings2 className="h-3 w-3" />
                            Edit
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {members.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No members found in this workspace</p>
                </div>
              )}
            </div>
          )}

          {/* Legend */}
          <div className="mt-4 flex items-center gap-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Check className="h-3 w-3 text-green-500" />
              Full Access
            </div>
            <div className="flex items-center gap-2">
              <Minus className="h-3 w-3 text-amber-500" />
              Partial Access
            </div>
            <div className="flex items-center gap-2">
              <X className="h-3 w-3 text-muted-foreground" />
              No Access
            </div>
          </div>
        </div>
      ) : (
        /* Requests Tab */
        <div className="space-y-6">
          {isLoadingRequests ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Pending Requests */}
              {pendingRequests.length > 0 && (
                <div>
                  <h2 className="text-sm font-medium text-foreground mb-3">
                    Pending Requests ({pendingRequests.length})
                  </h2>
                  <div className="space-y-3">
                    {pendingRequests.map((req) => (
                      <div
                        key={req.id}
                        className="bg-card border border-border rounded-lg p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-foreground">
                                {req.requester_name || "Unknown"}
                              </span>
                              {getStatusBadge(req.status)}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Requesting access to{" "}
                              <span className="font-medium text-foreground">
                                {req.app_name || req.app_id}
                              </span>
                            </p>
                            {req.reason && (
                              <p className="text-sm text-muted-foreground mt-1.5 italic">
                                &ldquo;{req.reason}&rdquo;
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground/60 mt-1.5">
                              {new Date(req.created_at).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {reviewingRequest === req.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={reviewNotes}
                                  onChange={(e) => setReviewNotes(e.target.value)}
                                  placeholder="Add a note (optional)"
                                  className="rounded-md border border-border bg-muted px-2.5 py-1 text-sm text-foreground w-48"
                                />
                                <Button
                                  size="sm"
                                  onClick={() => handleApprove(req.id)}
                                  disabled={isApproving}
                                  className="gap-1"
                                >
                                  {isApproving ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Check className="h-3 w-3" />
                                  )}
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleReject(req.id)}
                                  disabled={isRejecting}
                                  className="gap-1"
                                >
                                  {isRejecting ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <X className="h-3 w-3" />
                                  )}
                                  Reject
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setReviewingRequest(null);
                                    setReviewNotes("");
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => setReviewingRequest(req.id)}
                                  className="gap-1"
                                >
                                  <Check className="h-3 w-3" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setReviewingRequest(req.id)}
                                  className="gap-1"
                                >
                                  <X className="h-3 w-3" />
                                  Reject
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reviewed Requests */}
              {reviewedRequests.length > 0 && (
                <div>
                  <h2 className="text-sm font-medium text-muted-foreground mb-3">
                    Previous Requests
                  </h2>
                  <div className="space-y-2">
                    {reviewedRequests.map((req) => (
                      <div
                        key={req.id}
                        className="bg-card border border-border/50 rounded-lg p-3 flex items-center justify-between gap-4"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-foreground">
                              {req.requester_name || "Unknown"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              requested{" "}
                              <span className="font-medium">{req.app_name || req.app_id}</span>
                            </span>
                            {getStatusBadge(req.status)}
                          </div>
                          {req.review_notes && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Note: {req.review_notes}
                            </p>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground/60 shrink-0">
                          {req.reviewed_at
                            ? new Date(req.reviewed_at).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })
                            : new Date(req.created_at).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {requests.length === 0 && (
                <div className="text-center py-20 text-muted-foreground">
                  <Send className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No access requests yet</p>
                  <p className="text-sm mt-1">
                    When members request access to apps, they&apos;ll appear here.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Edit Member Modal */}
      {editingMember && (
        <MemberAppAccessModal
          open={!!editingMember}
          onOpenChange={(open) => !open && setEditingMember(null)}
          workspaceId={workspaceId}
          developerId={editingMember.developerId}
          developerName={editingMember.developerName}
        />
      )}
    </div>
  );
}
