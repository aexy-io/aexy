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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center max-w-md p-6">
          <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Unable to Create Assessment</h2>
          <p className="text-slate-400 mb-6">{error}</p>
          <button
            onClick={() => router.push("/hiring/assessments")}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
          >
            Back to Assessments
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary-500 mx-auto mb-4" />
        <p className="text-slate-400">Creating assessment...</p>
      </div>
    </div>
  );
}
