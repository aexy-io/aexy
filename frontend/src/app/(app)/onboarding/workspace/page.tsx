"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Building2,
  Users,
  Plus,
  Search,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Mail,
} from "lucide-react";
import { motion } from "framer-motion";
import { useOnboarding } from "../OnboardingContext";
import { workspaceApi, type MyInvitation } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

type WorkspaceMode = "select" | "create" | "join";

export default function WorkspaceStep() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, updateWorkspace, setCurrentStep } = useOnboarding();
  const [mode, setMode] = useState<WorkspaceMode>("select");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<MyInvitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(true);
  const [acceptingToken, setAcceptingToken] = useState<string | null>(null);

  useEffect(() => {
    setCurrentStep(3);
  }, [setCurrentStep]);

  useEffect(() => {
    const fetchInvitations = async () => {
      try {
        const data = await workspaceApi.getMyInvitations();
        setInvitations(data);
      } catch {
        // Silently fail — invitations are optional
      } finally {
        setLoadingInvitations(false);
      }
    };
    fetchInvitations();
  }, []);

  // If already has workspace, show continue
  const hasWorkspace = data.workspace.id !== null;
  const isPendingJoin = data.workspace.joinRequestStatus === "pending";

  const handleCreateWorkspace = async () => {
    if (!workspaceName.trim()) {
      setError("Please enter a workspace name");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const workspace = await workspaceApi.create({
        name: workspaceName.trim(),
        type: "team",
      });

      updateWorkspace({
        id: workspace.id,
        name: workspace.name,
        type: "create",
        joinRequestStatus: "none",
      });

      // Update sidebar workspace list and switch to the new workspace
      localStorage.setItem("current_workspace_id", workspace.id);
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });

      router.push("/onboarding/connect");
    } catch (err) {
      console.error("Failed to create workspace:", err);
      setError("Failed to create workspace. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRequest = async () => {
    if (!workspaceId.trim()) {
      setError("Please enter a workspace ID");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Request to join the workspace
      await workspaceApi.requestToJoin(workspaceId.trim());

      updateWorkspace({
        id: workspaceId.trim(),
        name: null, // We don't know the name yet
        type: "join",
        joinRequestStatus: "pending",
      });

      // Show pending state
      setMode("select");
    } catch (err: unknown) {
      console.error("Failed to send join request:", err);
      const errorMessage = err instanceof Error ? err.message : "Workspace not found or join request failed";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptInvite = async (invitation: MyInvitation) => {
    setAcceptingToken(invitation.token);
    setError(null);

    try {
      const result = await workspaceApi.acceptInvite(invitation.token);

      updateWorkspace({
        id: result.workspace_id,
        name: result.workspace_name,
        type: "join",
        joinRequestStatus: "none",
      });

      // Update sidebar workspace list and switch to the accepted workspace
      localStorage.setItem("current_workspace_id", result.workspace_id);
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });

      router.push("/onboarding/connect");
    } catch (err) {
      console.error("Failed to accept invitation:", err);
      setError("Failed to accept invitation. Please try again.");
    } finally {
      setAcceptingToken(null);
    }
  };

  const handleContinue = () => {
    router.push("/onboarding/connect");
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2, 3, 4, 5, 6, 7].map((step) => (
          <div
            key={step}
            className={`h-1.5 rounded-full transition-all ${
              step <= 3
                ? "w-8 bg-primary-500"
                : "w-4 bg-accent"
            }`}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center mx-auto mb-6">
            <Building2 className="w-8 h-8 text-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-3">
            Set up your workspace
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            A workspace is where your team collaborates. Create a new one or join an existing workspace.
          </p>
        </div>

        {/* Pending Join State */}
        {isPendingJoin && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md mx-auto mb-8 p-6 rounded-xl bg-amber-500/10 border border-amber-500/30"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-medium text-foreground mb-1">Join Request Pending</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Your request to join the workspace is awaiting approval. You&apos;ll receive an email once accepted.
                </p>
                <p className="text-xs text-muted-foreground">
                  Workspace ID: {data.workspace.id}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Already has workspace */}
        {hasWorkspace && !isPendingJoin && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md mx-auto mb-8 p-6 rounded-xl bg-green-500/10 border border-green-500/30"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h3 className="font-medium text-foreground mb-1">Workspace Ready</h3>
                <p className="text-sm text-muted-foreground">
                  {data.workspace.name || "Your workspace"} has been set up.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Pending Invitations */}
        {!hasWorkspace && mode === "select" && !loadingInvitations && invitations.length > 0 && (
          <div className="max-w-2xl mx-auto mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Mail className="w-4 h-4 text-primary-400" />
              <h2 className="text-sm font-medium text-primary-400 uppercase tracking-wide">
                You&apos;ve been invited
              </h2>
            </div>

            <div className="space-y-3 mb-6">
              {invitations.map((invitation) => (
                <motion.div
                  key={invitation.token}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-4 rounded-xl bg-primary-500/5 border border-primary-500/20"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-primary-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium text-foreground truncate">
                        {invitation.workspace_name}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {invitation.invited_by_name
                          ? `Invited by ${invitation.invited_by_name}`
                          : "Invited to join"}
                        {" \u00B7 "}
                        <span className="capitalize">{invitation.role}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAcceptInvite(invitation)}
                    disabled={acceptingToken === invitation.token}
                    className="flex-shrink-0 ml-4 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {acceptingToken === invitation.token ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      "Accept"
                    )}
                  </button>
                </motion.div>
              ))}
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-accent/50" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Or start fresh</span>
              <div className="flex-1 h-px bg-accent/50" />
            </div>
          </div>
        )}

        {/* Mode Selection or Forms */}
        {!hasWorkspace && mode === "select" && (
          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto mb-8">
            <motion.button
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              onClick={() => setMode("create")}
              className="p-6 rounded-xl bg-muted/50 border border-border/50 hover:border-primary-500/50 transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center mb-4">
                <Plus className="w-6 h-6 text-foreground" />
              </div>
              <h3 className="font-semibold text-foreground mb-2 group-hover:text-primary-400 transition-colors">
                Create new workspace
              </h3>
              <p className="text-sm text-muted-foreground">
                Start fresh with a new workspace for your team or project.
              </p>
            </motion.button>

            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              onClick={() => setMode("join")}
              className="p-6 rounded-xl bg-muted/50 border border-border/50 hover:border-primary-500/50 transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-foreground" />
              </div>
              <h3 className="font-semibold text-foreground mb-2 group-hover:text-primary-400 transition-colors">
                Join existing workspace
              </h3>
              <p className="text-sm text-muted-foreground">
                Request to join a workspace if you have the workspace ID.
              </p>
            </motion.button>
          </div>
        )}

        {/* Create Workspace Form */}
        {mode === "create" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto"
          >
            <div className="mb-6">
              <label className="block text-sm font-medium text-foreground mb-2">
                Workspace name
              </label>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => {
                  setWorkspaceName(e.target.value);
                  setError(null);
                }}
                placeholder="e.g., Acme Engineering"
                className="w-full px-4 py-3 bg-muted/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary-500/50"
                autoFocus
              />
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setMode("select");
                  setError(null);
                }}
                className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleCreateWorkspace}
                disabled={isLoading || !workspaceName.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 text-white font-medium hover:from-primary-600 hover:to-primary-700 transition-all shadow-lg shadow-primary-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Create Workspace
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}

        {/* Join Workspace Form */}
        {mode === "join" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto"
          >
            <div className="mb-6">
              <label className="block text-sm font-medium text-foreground mb-2">
                Workspace ID
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={workspaceId}
                  onChange={(e) => {
                    setWorkspaceId(e.target.value);
                    setError(null);
                  }}
                  placeholder="Enter the workspace ID"
                  className="w-full pl-10 pr-4 py-3 bg-muted/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary-500/50"
                  autoFocus
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Ask your team admin for the workspace ID.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-sm text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setMode("select");
                  setError(null);
                }}
                className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleJoinRequest}
                disabled={isLoading || !workspaceId.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 text-white font-medium hover:from-primary-600 hover:to-primary-700 transition-all shadow-lg shadow-primary-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending Request...
                  </>
                ) : (
                  <>
                    Request to Join
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-6 mt-8 border-t border-border max-w-2xl mx-auto">
          <button
            onClick={() => router.push("/onboarding/use-case")}
            className="flex items-center gap-2 px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          {(hasWorkspace && !isPendingJoin) && (
            <button
              onClick={handleContinue}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 text-white font-medium hover:from-primary-600 hover:to-primary-700 transition-all shadow-lg shadow-primary-500/25"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {isPendingJoin && (
            <div className="text-sm text-muted-foreground">
              Waiting for approval...
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
