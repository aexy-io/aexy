"use client";

import { BlockStatusBadge } from "./blocks/BlockStatusBadge";
import { Play, Pause, PlayCircle, Archive } from "lucide-react";
import type { AgentWorkspace } from "@/hooks/useAgentWorkspaces";

interface WorkspaceHeaderProps {
  workspace: AgentWorkspace;
  totalBlocks: number;
  completedBlocks: number;
  onRun: () => void;
  onPause: () => void;
  onResume: () => void;
}

export function WorkspaceHeader({
  workspace,
  totalBlocks,
  completedBlocks,
  onRun,
  onPause,
  onResume,
}: WorkspaceHeaderProps) {
  const isPaused = workspace.status === "paused";
  const isActive = workspace.status === "active";
  const hasWorkflow = !!workspace.temporal_workflow_id;

  return (
    <div className="border-b pb-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{workspace.title}</h1>
            <BlockStatusBadge status={workspace.status} />
          </div>
          {workspace.description && (
            <p className="text-sm text-muted-foreground mt-1">{workspace.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!hasWorkflow && (
            <button
              onClick={onRun}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium"
            >
              <Play className="w-3.5 h-3.5" />
              Run Task
            </button>
          )}
          {hasWorkflow && isActive && (
            <button
              onClick={onPause}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md hover:bg-muted text-sm"
            >
              <Pause className="w-3.5 h-3.5" />
              Pause
            </button>
          )}
          {isPaused && (
            <button
              onClick={onResume}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              Resume
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
