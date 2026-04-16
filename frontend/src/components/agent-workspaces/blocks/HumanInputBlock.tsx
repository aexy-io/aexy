"use client";

import { useState } from "react";
import { useRespondToBlock } from "@/hooks/useAgentWorkspaces";
import { MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import type { Block } from "@/hooks/useAgentWorkspaces";

interface HumanInputBlockProps {
  block: Block;
  workspaceId: string;
  agentWorkspaceId: string;
}

export function HumanInputBlock({ block, workspaceId, agentWorkspaceId }: HumanInputBlockProps) {
  const [response, setResponse] = useState("");
  const respondMutation = useRespondToBlock(workspaceId, agentWorkspaceId);

  const question = (block.content.text as string) || (block.content.question as string) || "Agent is requesting your input";
  const humanResponse = block.content.human_response as string | undefined;
  const isWaiting = block.status === "waiting_human";

  // Already responded
  if (humanResponse || block.status === "completed") {
    return (
      <div className="py-2 px-3 bg-muted/30 border rounded-md">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
          <MessageSquare className="w-3 h-3" />
          Question
        </div>
        <p className="text-sm mb-2">{question}</p>
        {humanResponse && (
          <div className="text-sm bg-primary/10 px-3 py-2 rounded-md">
            <span className="text-xs font-medium text-muted-foreground">Your response:</span>
            <p className="mt-0.5">{humanResponse}</p>
          </div>
        )}
      </div>
    );
  }

  // Waiting for response
  if (!isWaiting) return null;

  const handleSubmit = async () => {
    if (!response.trim()) return;
    try {
      await respondMutation.mutateAsync({ blockId: block.id, response: response.trim() });
      setResponse("");
      toast.success("Response submitted");
    } catch {
      toast.error("Failed to submit response");
    }
  };

  return (
    <div className="py-2 px-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
      <div className="flex items-center gap-1.5 text-xs font-medium text-yellow-700 dark:text-yellow-400 mb-2">
        <MessageSquare className="w-3 h-3" />
        Question for You
      </div>
      <p className="text-sm mb-3">{question}</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Type your response..."
          className="flex-1 px-3 py-1.5 rounded-md border bg-background text-sm"
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        <button
          onClick={handleSubmit}
          disabled={!response.trim() || respondMutation.isPending}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm disabled:opacity-50"
        >
          <Send className="w-3 h-3" />
          Submit
        </button>
      </div>
    </div>
  );
}
