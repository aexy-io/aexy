"use client";

import { useWorkspace } from "@/hooks/useWorkspace";
import { AgentCreationWizard } from "@/components/agents/wizard";

export default function NewAgentPage() {
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();

  if (currentWorkspaceLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!currentWorkspaceId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-foreground">No workspace selected</p>
        </div>
      </div>
    );
  }

  return <AgentCreationWizard workspaceId={currentWorkspaceId} />;
}
