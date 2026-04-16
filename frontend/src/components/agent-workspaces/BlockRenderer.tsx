"use client";

import type { Block } from "@/hooks/useAgentWorkspaces";
import { MarkdownBlock } from "./blocks/MarkdownBlock";
import { JsonBlock } from "./blocks/JsonBlock";
import { TableBlock } from "./blocks/TableBlock";
import { ImageBlock } from "./blocks/ImageBlock";
import { PdfBlock } from "./blocks/PdfBlock";
import { CodeBlock } from "./blocks/CodeBlock";
import { HandoffBlock } from "./blocks/HandoffBlock";
import { HumanInputBlock } from "./blocks/HumanInputBlock";
import { Loader2 } from "lucide-react";

interface BlockRendererProps {
  block: Block;
  workspaceId: string;
  agentWorkspaceId: string;
}

export function BlockRenderer({ block, workspaceId, agentWorkspaceId }: BlockRendererProps) {
  // Running state
  if (block.status === "running") {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Agent is working...</span>
      </div>
    );
  }

  // Pending state
  if (block.status === "pending") {
    return (
      <div className="py-2 text-xs text-muted-foreground italic">
        Waiting to start...
      </div>
    );
  }

  // Failed state
  if (block.status === "failed") {
    return (
      <div className="py-2 px-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
        {block.error_message || "Block execution failed"}
      </div>
    );
  }

  // Render by type
  switch (block.block_type) {
    case "markdown":
    case "text":
      return <MarkdownBlock content={block.content} />;
    case "json":
      return <JsonBlock content={block.content} />;
    case "table":
      return <TableBlock content={block.content} />;
    case "image":
      return <ImageBlock fileUrl={block.file_url} title={block.title} />;
    case "pdf":
      return <PdfBlock fileUrl={block.file_url} title={block.title} />;
    case "code":
      return <CodeBlock content={block.content} />;
    case "handoff":
      return <HandoffBlock handoffData={block.handoff_data} />;
    case "human_input":
      return (
        <HumanInputBlock
          block={block}
          workspaceId={workspaceId}
          agentWorkspaceId={agentWorkspaceId}
        />
      );
    default:
      return (
        <div className="py-2 text-xs text-muted-foreground">
          Unknown block type: {block.block_type}
        </div>
      );
  }
}
