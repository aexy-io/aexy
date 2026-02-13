"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSubscription } from "@/hooks/useSubscription";
import { useMemberAppAccess, useAppAccessTemplates } from "@/hooks/useAppAccess";
import { MemberAppAccessModal } from "@/components/members/MemberAppAccessModal";
import { getAllApps } from "@/config/appDefinitions";

export default function AccessControlPage() {
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

  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [editingMember, setEditingMember] = useState<{
    developerId: string;
    developerName: string;
  } | null>(null);

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

  const isLoading = isLoadingMatrix || templatesLoading;

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link
                href="/settings"
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-700 rounded-lg">
                  <Shield className="h-5 w-5 text-violet-400" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-white">
                    Access Control
                  </h1>
                  <p className="text-slate-400 text-sm">
                    Manage app access for workspace members
                  </p>
                </div>
              </div>
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
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Bulk Actions */}
        {selectedMembers.length > 0 && (
          <div className="mb-4 p-4 bg-slate-800 border border-slate-700 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <span className="text-sm text-slate-300">
              {selectedMembers.length} member(s) selected
            </span>
            <div className="flex items-center gap-3">
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-white"
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
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : matrixError ? (
          <div className="text-center py-20 text-red-400">
            Failed to load access matrix. Please try again.
          </div>
        ) : (
          <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="sticky left-0 bg-slate-800 z-10 px-4 py-3 text-left">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={
                            selectedMembers.length === members.length &&
                            members.length > 0
                          }
                          onChange={toggleAllMembers}
                          className="h-4 w-4 rounded border-slate-600"
                        />
                        <span className="text-sm font-medium text-slate-300">
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
                            <Icon className="h-4 w-4 text-slate-400" />
                            <span className="text-xs font-medium text-slate-400">
                              {app.name}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                    <th className="px-4 py-3 text-center">
                      <span className="text-xs font-medium text-slate-400">
                        Actions
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr
                      key={member.developer_id}
                      className="border-b border-slate-700/50 hover:bg-slate-700/30"
                    >
                      <td className="sticky left-0 bg-slate-800 z-10 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedMembers.includes(
                              member.developer_id
                            )}
                            onChange={() =>
                              toggleMemberSelection(member.developer_id)
                            }
                            className="h-4 w-4 rounded border-slate-600"
                          />
                          <div>
                            <p className="text-sm font-medium text-white">
                              {member.developer_name || "Unknown"}
                            </p>
                            <p className="text-xs text-slate-400">
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
              <div className="text-center py-12 text-slate-400">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No members found in this workspace</p>
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 flex items-center gap-6 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Check className="h-3 w-3 text-green-500" />
            Full Access
          </div>
          <div className="flex items-center gap-2">
            <Minus className="h-3 w-3 text-amber-500" />
            Partial Access
          </div>
          <div className="flex items-center gap-2">
            <X className="h-3 w-3 text-slate-500" />
            No Access
          </div>
        </div>
      </main>

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
