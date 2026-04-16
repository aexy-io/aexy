"use client";

import { formatRelativeTime } from "@/lib/utils";
import { BlockStatusBadge } from "./blocks/BlockStatusBadge";
import { Trash2 } from "lucide-react";
import type { AgentWorkspace } from "@/hooks/useAgentWorkspaces";

interface WorkspaceListProps {
  workspaces: AgentWorkspace[];
  isLoading: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function WorkspaceList({ workspaces, isLoading, onSelect, onDelete }: WorkspaceListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No agent workspaces yet.</p>
        <p className="text-sm mt-1">Create one to get started with multi-agent orchestration.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {workspaces.map((ws) => (
        <div
          key={ws.id}
          onClick={() => onSelect(ws.id)}
          className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium truncate">{ws.title}</h3>
              <BlockStatusBadge status={ws.status} />
              {ws.source_module && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {ws.source_module}
                </span>
              )}
            </div>
            {ws.description && (
              <p className="text-sm text-muted-foreground truncate mt-1">
                {ws.description}
              </p>
            )}
            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
              <span>{formatRelativeTime(ws.created_at)}</span>
              {ws.block_count !== undefined && ws.block_count > 0 && (
                <span>
                  {ws.completed_blocks}/{ws.block_count} blocks
                </span>
              )}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(ws.id);
            }}
            className="p-2 text-muted-foreground hover:text-destructive rounded-md hover:bg-muted transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
