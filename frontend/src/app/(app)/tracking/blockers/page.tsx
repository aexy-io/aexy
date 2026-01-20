"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, AlertTriangle, Plus } from "lucide-react";
import { BlockerBoard, BlockerReportForm } from "@/components/tracking";
import { useActiveBlockers, useReportBlocker, useResolveBlocker, useEscalateBlocker } from "@/hooks/useTracking";
import { useAuth } from "@/hooks/useAuth";

export default function BlockersPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const { data: blockersData, isLoading } = useActiveBlockers();
  const reportBlocker = useReportBlocker();
  const resolveBlocker = useResolveBlocker();
  const escalateBlocker = useEscalateBlocker();

  const handleSubmit = async (data: Parameters<typeof reportBlocker.mutateAsync>[0]) => {
    await reportBlocker.mutateAsync(data);
    setShowForm(false);
  };

  // Get all blockers from response
  const blockers = blockersData?.blockers || [];

  // Stats
  const activeCount = blockers.filter((b) => b.status === "active").length;
  const escalatedCount = blockers.filter((b) => b.status === "escalated").length;
  const resolvedCount = blockers.filter((b) => b.status === "resolved").length;

  return (
    <div className="min-h-screen bg-slate-950">
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push("/tracking")}
            className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Tracking
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-red-400" />
                Blockers
              </h1>
              <p className="text-slate-400 mt-2">
                Track and manage blockers
              </p>
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
            >
              <Plus className="h-4 w-4" />
              Report Blocker
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-800 rounded-xl p-6 border border-red-700/50">
            <div className="text-slate-400 mb-2">Active</div>
            <p className="text-3xl font-semibold text-red-400">{activeCount}</p>
            <p className="text-sm text-slate-500">Needs attention</p>
          </div>

          <div className="bg-slate-800 rounded-xl p-6 border border-purple-700/50">
            <div className="text-slate-400 mb-2">Escalated</div>
            <p className="text-3xl font-semibold text-purple-400">{escalatedCount}</p>
            <p className="text-sm text-slate-500">Waiting for help</p>
          </div>

          <div className="bg-slate-800 rounded-xl p-6 border border-green-700/50">
            <div className="text-slate-400 mb-2">Resolved</div>
            <p className="text-3xl font-semibold text-green-400">{resolvedCount}</p>
            <p className="text-sm text-slate-500">Completed</p>
          </div>
        </div>

        {/* Report Form */}
        {showForm && (
          <div className="mb-8">
            <BlockerReportForm
              onSubmit={handleSubmit}
              isSubmitting={reportBlocker.isPending}
            />
          </div>
        )}

        {/* Blocker Board */}
        <BlockerBoard
          blockers={blockers}
          isLoading={isLoading}
          onResolve={async (blockerId, notes) => {
            await resolveBlocker.mutateAsync({ blockerId, notes });
          }}
          onEscalate={async (blockerId, escalateToId, notes) => {
            await escalateBlocker.mutateAsync({ blockerId, escalateToId, notes });
          }}
          isResolving={resolveBlocker.isPending}
          isEscalating={escalateBlocker.isPending}
        />
      </div>
    </div>
  );
}
