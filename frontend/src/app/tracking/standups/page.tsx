"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MessageSquare, Plus } from "lucide-react";
import { StandupForm, StandupTimeline } from "@/components/tracking";
import { useMyStandups, useSubmitStandup } from "@/hooks/useTracking";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/layout/AppHeader";

export default function StandupsPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const { data: standupsData, isLoading } = useMyStandups({ limit: 50 });
  const submitStandup = useSubmitStandup();

  const handleSubmit = async (data: Parameters<typeof submitStandup.mutateAsync>[0]) => {
    await submitStandup.mutateAsync(data);
    setShowForm(false);
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <AppHeader user={user} logout={logout} />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                <MessageSquare className="h-8 w-8 text-blue-400" />
                Standups
              </h1>
              <p className="text-slate-400 mt-2">
                Your standup history and submissions
              </p>
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              <Plus className="h-4 w-4" />
              New Standup
            </button>
          </div>
        </div>

        {/* Standup Form */}
        {showForm && (
          <div className="mb-8">
            <StandupForm
              onSubmit={handleSubmit}
              isSubmitting={submitStandup.isPending}
            />
          </div>
        )}

        {/* Standup Timeline */}
        <StandupTimeline
          standups={standupsData?.standups || []}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
