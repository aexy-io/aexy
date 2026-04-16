"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { BlockRenderer } from "./BlockRenderer";
import { BlockStatusBadge } from "./blocks/BlockStatusBadge";
import type { Block } from "@/hooks/useAgentWorkspaces";

interface BlockTreeProps {
  blocks: Block[];
  workspaceId: string;
  agentWorkspaceId: string;
  depth?: number;
}

export function BlockTree({ blocks, workspaceId, agentWorkspaceId, depth = 0 }: BlockTreeProps) {
  if (blocks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No blocks yet. Run a task to generate blocks.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {blocks.map((block) => (
        <BlockNode
          key={block.id}
          block={block}
          workspaceId={workspaceId}
          agentWorkspaceId={agentWorkspaceId}
          depth={depth}
        />
      ))}
    </div>
  );
}

function BlockNode({
  block,
  workspaceId,
  agentWorkspaceId,
  depth,
}: {
  block: Block;
  workspaceId: string;
  agentWorkspaceId: string;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = block.children && block.children.length > 0;

  return (
    <div className={depth > 0 ? "ml-6 border-l pl-4" : ""}>
      {/* Block header */}
      <div className="flex items-center gap-2 py-1">
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 rounded hover:bg-muted"
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        ) : (
          <div className="w-5" />
        )}
        <BlockStatusBadge status={block.status} />
        <span className="text-sm font-medium">{block.title || block.block_type}</span>
        <span className="text-xs text-muted-foreground">
          {block.block_type}
        </span>
      </div>

      {/* Block content */}
      {expanded && (
        <div className="ml-5">
          <BlockRenderer
            block={block}
            workspaceId={workspaceId}
            agentWorkspaceId={agentWorkspaceId}
          />

          {/* Children */}
          {hasChildren && (
            <BlockTree
              blocks={block.children!}
              workspaceId={workspaceId}
              agentWorkspaceId={agentWorkspaceId}
              depth={depth + 1}
            />
          )}
        </div>
      )}
    </div>
  );
}
