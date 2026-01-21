"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { useAssessments } from "@/hooks/useAssessments";

export default function NewAssessmentPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { currentWorkspaceId, workspacesLoading, hasWorkspaces } = useWorkspace();
  const { createAssessment, isCreating } = useAssessments(currentWorkspaceId);
  const [error, setError] = useState<string | null>(null);
  const [isCreatingAssessment, setIsCreatingAssessment] = useState(false);

  useEffect(() => {
    // Wait for auth and workspace to load
    if (authLoading || workspacesLoading) return;

    // Redirect if not authenticated
    if (!isAuthenticated) {
      router.push("/");
      return;
    }

    // Check for workspace
    if (!hasWorkspaces || !currentWorkspaceId) {
      setError("Please create a workspace first to create assessments.");
      return;
    }

    // Create assessment only once
    if (isCreatingAssessment) return;

    const createNewAssessment = async () => {
      setIsCreatingAssessment(true);
      try {
        const assessment = await createAssessment({
          title: "Untitled Assessment",
        });

        // Redirect to the edit page
        router.replace(`/hiring/assessments/${assessment.id}/edit`);
      } catch (err) {
        console.error("Failed to create assessment:", err);
        setError("Failed to create assessment. Please try again.");
        setIsCreatingAssessment(false);
      }
    };

    createNewAssessment();
  }, [
    authLoading,
    workspacesLoading,
    isAuthenticated,
    hasWorkspaces,
    currentWorkspaceId,
    isCreatingAssessment,
    createAssessment,
    router,
  ]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md p-6">
          <div className="w-16 h-16 bg-destructive/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Unable to Create Assessment</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <button
            onClick={() => router.push("/hiring/assessments")}
            className="px-4 py-2 bg-muted hover:bg-accent text-foreground rounded-lg transition"
          >
            Back to Assessments
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Creating assessment...</p>
      </div>
    </div>
  );
}
