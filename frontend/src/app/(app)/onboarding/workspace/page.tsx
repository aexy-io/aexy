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
} from "lucide-react";
import { motion } from "framer-motion";
import { useOnboarding } from "../OnboardingContext";
import { workspaceApi } from "@/lib/api";

type WorkspaceMode = "select" | "create" | "join";

export default function WorkspaceStep() {
  const router = useRouter();
  const { data, updateWorkspace, setCurrentStep } = useOnboarding();
  const [mode, setMode] = useState<WorkspaceMode>("select");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentStep(3);
  }, [setCurrentStep]);

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
                : "w-4 bg-slate-700"
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
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">
            Set up your workspace
          </h1>
          <p className="text-slate-400 max-w-lg mx-auto">
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
                <h3 className="font-medium text-white mb-1">Join Request Pending</h3>
                <p className="text-sm text-slate-400 mb-3">
                  Your request to join the workspace is awaiting approval. You&apos;ll receive an email once accepted.
                </p>
                <p className="text-xs text-slate-500">
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
                <h3 className="font-medium text-white mb-1">Workspace Ready</h3>
                <p className="text-sm text-slate-400">
                  {data.workspace.name || "Your workspace"} has been set up.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Mode Selection or Forms */}
        {!hasWorkspace && mode === "select" && (
          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto mb-8">
            <motion.button
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              onClick={() => setMode("create")}
              className="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:border-primary-500/50 transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center mb-4">
                <Plus className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-white mb-2 group-hover:text-primary-400 transition-colors">
                Create new workspace
              </h3>
              <p className="text-sm text-slate-400">
                Start fresh with a new workspace for your team or project.
              </p>
            </motion.button>

            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              onClick={() => setMode("join")}
              className="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:border-primary-500/50 transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-white mb-2 group-hover:text-primary-400 transition-colors">
                Join existing workspace
              </h3>
              <p className="text-sm text-slate-400">
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
              <label className="block text-sm font-medium text-slate-300 mb-2">
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
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-primary-500/50"
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
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
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
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Workspace ID
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={workspaceId}
                  onChange={(e) => {
                    setWorkspaceId(e.target.value);
                    setError(null);
                  }}
                  placeholder="Enter the workspace ID"
                  className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-primary-500/50"
                  autoFocus
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
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
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-6 mt-8 border-t border-slate-800 max-w-2xl mx-auto">
          <button
            onClick={() => router.push("/onboarding/use-case")}
            className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white transition-colors"
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
            <div className="text-sm text-slate-400">
              Waiting for approval...
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
