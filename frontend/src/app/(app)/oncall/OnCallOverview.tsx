"use client";

/**
 * The destination on-call never had.
 *
 * `APP_CATALOG.oncall` declares `/oncall`, two of the four shipped bundles turn
 * it on, `can_view_oncall` gates it, and `ROUTE_TO_APP` maps it — and there was
 * no page. The feature itself is not missing: `api/oncall.py` has fifteen
 * endpoints, `hooks/useOnCall.ts` wraps eight of them, and there are three
 * built components. All of it was reachable only from
 * `/settings/projects/<id>/oncall`, a *configuration* screen buried three
 * levels into settings, one team at a time.
 *
 * So the gap was never "who is on call" — it was "which team are you asking
 * about". Everything in the API is team-scoped; nothing rolled it up. This page
 * is that roll-up, and it is the only thing here that is new.
 */

import Link from "next/link";
import { Phone, Settings, ArrowRight, Users } from "lucide-react";

import { PageShell, PageHeader, PageSection, PageSections, PageEmpty } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import CurrentOnCallBadge from "@/components/oncall/CurrentOnCallBadge";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTeams } from "@/hooks/useTeams";
import { useCurrentOnCall, useOnCallConfig } from "@/hooks/useOnCall";

export function OnCallOverview() {
  const { currentWorkspaceId } = useWorkspace();
  const { teams, isLoading } = useTeams(currentWorkspaceId);

  return (
    <PageShell width="wide">
      <PageHeader
        title="On-Call"
        description="Who is carrying the pager, on every team, right now."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/teams">
              <Users className="mr-2 h-4 w-4" />
              Manage teams
            </Link>
          </Button>
        }
      />

      <PageSections>
        {isLoading ? (
          <PageSection>
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-muted" />
              ))}
            </div>
          </PageSection>
        ) : !teams?.length ? (
          <PageSection flush>
            <PageEmpty
              icon={<Users className="h-8 w-8" />}
              title="No teams yet"
              description="On-call rotations belong to a team. Create one, then turn on its rotation and add a schedule."
              action={
                <Button asChild size="sm">
                  <Link href="/settings/teams">Create a team</Link>
                </Button>
              }
            />
          </PageSection>
        ) : (
          teams.map((team) => <TeamRotation key={team.id} teamId={team.id} teamName={team.name} />)
        )}
      </PageSections>
    </PageShell>
  );
}

/**
 * One team's row. The rotation query is per team and there is no batch
 * endpoint, so each row owns its own — which also means a team whose rotation
 * is switched off costs nothing beyond the config check.
 */
function TeamRotation({ teamId, teamName }: { teamId: string; teamName: string }) {
  const { currentWorkspaceId } = useWorkspace();
  const { config } = useOnCallConfig(currentWorkspaceId, teamId);
  const { currentSchedule, nextSchedule, isActive } = useCurrentOnCall(currentWorkspaceId, teamId);

  const settingsHref = `/settings/teams?team=${teamId}`;

  return (
    <PageSection
      title={teamName}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link href={settingsHref}>
            <Settings className="mr-2 h-4 w-4" />
            Rotation settings
          </Link>
        </Button>
      }
    >
      {config?.is_enabled ? (
        <CurrentOnCallBadge
          currentSchedule={currentSchedule}
          nextSchedule={nextSchedule}
          isActive={isActive}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="h-4 w-4 shrink-0" aria-hidden />
            Rotation is off for this team, so nobody is paged when an incident opens.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href={settingsHref}>
              Turn it on
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}
    </PageSection>
  );
}
