"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAgentWorkspaces, useDeleteAgentWorkspace } from "@/hooks/useAgentWorkspaces";
import { WorkspaceList } from "@/components/agent-workspaces/WorkspaceList";
import { Plus } from "lucide-react";

export default function AgentWorkspacesPage() {
  const router = useRouter();
  const { currentWorkspaceId } = useWorkspace();
  const { data: workspaces, isLoading } = useAgentWorkspaces(currentWorkspaceId ?? undefined);
  const deleteMutation = useDeleteAgentWorkspace(currentWorkspaceId ?? undefined);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filteredWorkspaces = statusFilter
    ? workspaces?.filter((w) => w.status === statusFilter)
    : workspaces;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Agent Workspaces</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Multi-agent orchestration workspaces with block-based output
          </p>
        </div>
        <button
          onClick={() => router.push("/agent-workspaces/new")}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New Workspace
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-4">
        {[null, "active", "completed", "failed", "archived"].map((status) => (
          <button
            key={status ?? "all"}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1 text-xs rounded-full border ${
              statusFilter === status
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-muted"
            }`}
          >
            {status ?? "All"}
          </button>
        ))}
      </div>

      <WorkspaceList
        workspaces={filteredWorkspaces ?? []}
        isLoading={isLoading}
        onDelete={(id) => deleteMutation.mutate(id)}
        onSelect={(id) => router.push(`/agent-workspaces/${id}`)}
      />
    </div>
  );
}
