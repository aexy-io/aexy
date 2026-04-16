"use client";

import { useParams } from "next/navigation";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  useAgentWorkspace,
  useBlockTree,
  usePauseWorkspace,
  useResumeWorkspace,
} from "@/hooks/useAgentWorkspaces";
import { useWorkspaceStream } from "@/hooks/useWorkspaceStream";
import { WorkspaceHeader } from "@/components/agent-workspaces/WorkspaceHeader";
import { BlockTree } from "@/components/agent-workspaces/BlockTree";
import { RunTaskDialog } from "@/components/agent-workspaces/RunTaskDialog";
import { useState } from "react";

export default function AgentWorkspaceDetailPage() {
  const { workspaceId: agentWorkspaceId } = useParams<{ workspaceId: string }>();
  const { currentWorkspaceId } = useWorkspace();
  const wid = currentWorkspaceId ?? undefined;

  const { data: workspace, isLoading } = useAgentWorkspace(wid, agentWorkspaceId);
  const { data: blockTree } = useBlockTree(wid, agentWorkspaceId);
  const pauseMutation = usePauseWorkspace(wid, agentWorkspaceId);
  const resumeMutation = useResumeWorkspace(wid, agentWorkspaceId);
  const [showRunDialog, setShowRunDialog] = useState(false);

  // Subscribe to real-time updates
  const isRunning = workspace?.status === "active" && !!workspace?.temporal_workflow_id;
  useWorkspaceStream(wid, agentWorkspaceId, isRunning);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Workspace not found
      </div>
    );
  }

  // Calculate progress
  const totalBlocks = blockTree?.length ?? 0;
  const completedBlocks = countCompleted(blockTree ?? []);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <WorkspaceHeader
        workspace={workspace}
        totalBlocks={totalBlocks}
        completedBlocks={completedBlocks}
        onRun={() => setShowRunDialog(true)}
        onPause={() => pauseMutation.mutate()}
        onResume={() => resumeMutation.mutate()}
      />

      {/* Progress bar */}
      {totalBlocks > 0 && (
        <div className="mt-4 mb-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Progress</span>
            <span>{completedBlocks}/{totalBlocks} blocks</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${totalBlocks > 0 ? (completedBlocks / totalBlocks) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Block tree */}
      <BlockTree
        blocks={blockTree ?? []}
        workspaceId={wid!}
        agentWorkspaceId={agentWorkspaceId}
      />

      {/* Run task dialog */}
      {showRunDialog && (
        <RunTaskDialog
          workspaceId={wid!}
          agentWorkspaceId={agentWorkspaceId}
          onClose={() => setShowRunDialog(false)}
        />
      )}
    </div>
  );
}

function countCompleted(blocks: Array<{ status: string; children?: Array<{ status: string; children?: unknown[] }> }>): number {
  let count = 0;
  for (const block of blocks) {
    if (block.status === "completed") count++;
    if (block.children) count += countCompleted(block.children as typeof blocks);
  }
  return count;
}
