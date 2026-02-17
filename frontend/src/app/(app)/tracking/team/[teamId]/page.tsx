"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Users, Settings } from "lucide-react";
import { TeamTrackingDashboard } from "@/components/tracking";
import {
  useTeamTrackingDashboard,
  useResolveBlocker,
  useEscalateBlocker,
} from "@/hooks/useTracking";

interface TeamTrackingPageProps {
  params: Promise<{ teamId: string }>;
}

export default function TeamTrackingPage({ params }: TeamTrackingPageProps) {
  const { teamId } = use(params);
  const router = useRouter();

  const { data: dashboard, isLoading } = useTeamTrackingDashboard(teamId);
  const resolveBlocker = useResolveBlocker();
  const escalateBlocker = useEscalateBlocker();

  // Convert team members for escalation dropdown
  const teamMembers =
    dashboard?.member_summaries?.map((m) => ({
      id: m.developer_id,
      name: m.name || m.email || "Unknown",
    })) || [];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push("/tracking")}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to My Tracking
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                <Users className="h-8 w-8 text-purple-400" />
                Team Tracking
              </h1>
              <p className="text-muted-foreground mt-2">
                Team progress, standups, and blockers
              </p>
            </div>
            <button
              onClick={() => router.push(`/teams/${teamId}/settings`)}
              className="flex items-center gap-2 px-4 py-2 bg-accent text-foreground rounded-lg hover:bg-muted transition"
            >
              <Settings className="h-4 w-4" />
              Team Settings
            </button>
          </div>
        </div>

        {/* Team Dashboard */}
        <TeamTrackingDashboard
          dashboard={dashboard}
          isLoading={isLoading}
          onResolveBlocker={async (blockerId, notes) => {
            await resolveBlocker.mutateAsync({ blockerId, notes });
          }}
          onEscalateBlocker={async (blockerId, escalateToId, notes) => {
            await escalateBlocker.mutateAsync({ blockerId, escalateToId, notes });
          }}
          teamMembers={teamMembers}
          isResolvingBlocker={resolveBlocker.isPending}
          isEscalatingBlocker={escalateBlocker.isPending}
        />
      </div>
    </div>
  );
}
