"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, TriangleAlert, Users } from "lucide-react";
import { toast } from "sonner";

import { organizationApi, DepartmentAccessProfile } from "@/lib/organization-api";
import { APP_CATALOG, PERSONA_LABELS } from "@/config/appDefinitions";

/**
 * Assign each department the apps its people should see.
 *
 * This is the layer that replaced role defaults as the access baseline, so it
 * needs somewhere to be set — before this panel there was nowhere, and a
 * department's profile could only be created by onboarding.
 *
 * A department with no profile is called out rather than left blank: its members
 * are still being decided by their legacy workspace role, which is the situation
 * that gave a salesperson a developer's sidebar.
 */

/** The bundles the server will expand. Mirrors SYSTEM_APP_BUNDLES. */
const PROFILE_OPTIONS = [
  { slug: "engineering", label: "Engineering" },
  { slug: "people", label: "People" },
  { slug: "business", label: "Business" },
  { slug: "full_access", label: "Full access" },
];

const PERSONA_OPTIONS = [
  "developer",
  "manager",
  "product",
  "hr",
  "support",
  "sales",
];

const PROFILES_KEY = "departmentAccessProfiles";

export function DepartmentProfilesPanel({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<DepartmentAccessProfile[]>({
    queryKey: [PROFILES_KEY, workspaceId],
    queryFn: () => organizationApi.listAccessProfiles(workspaceId),
    enabled: !!workspaceId,
    retry: false,
  });

  const profiles = useMemo(() => data ?? [], [data]);
  const unconfigured = profiles.filter((p) => p.enabled_app_ids.length === 0);

  const mutation = useMutation({
    mutationFn: ({
      departmentId,
      profileSlug,
      persona,
    }: {
      departmentId: string;
      profileSlug?: string | null;
      persona?: string | null;
    }) =>
      organizationApi.setAccessProfile(workspaceId, departmentId, {
        ...(profileSlug !== undefined ? { profile_slug: profileSlug } : {}),
        ...(persona !== undefined ? { default_persona: persona } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROFILES_KEY, workspaceId] });
      // Access resolution and the matrix both change for everyone in the
      // department, so neither can be left showing the previous answer.
      queryClient.invalidateQueries({ queryKey: ["appAccess"] });
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast.success("Access profile updated");
    },
    onError: () => toast.error("Could not update the access profile"),
    onSettled: () => setSavingId(null),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Couldn&apos;t load department profiles. You need the organization-management
        permission to see them.
      </p>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="py-12 text-center">
        <Building2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" aria-hidden />
        <p className="text-sm font-medium text-foreground">No departments yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Departments decide what people see. Create them under Organization →
          Departments, then give each one a profile here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A department&apos;s profile decides which apps its people see — and is enforced
        on the API, not just in the sidebar. Someone in two departments gets the
        union of both.
      </p>

      {unconfigured.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {unconfigured.length === 1
              ? `${unconfigured[0].department_name} has no access profile, so its people`
              : `${unconfigured.length} departments have no access profile, so their people`}{" "}
            still see whatever their workspace role defaults to — which is
            engineering-shaped for anyone whose role reads &ldquo;member&rdquo;.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full min-w-[720px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Department
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Access profile
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Default sidebar view
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Apps
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {profiles.map((profile) => {
              const isSaving = savingId === profile.department_id;
              const appNames = profile.enabled_app_ids
                .map((id) => APP_CATALOG[id]?.name ?? id)
                .sort();

              return (
                <tr key={profile.department_id} className="hover:bg-accent/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {profile.department_name}
                      </span>
                      {isSaving && (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden />
                      )}
                    </div>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" aria-hidden />
                      {profile.member_count === 1
                        ? "1 person"
                        : `${profile.member_count} people`}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <select
                      value={profile.access_profile_slug ?? ""}
                      disabled={isSaving}
                      onChange={(e) => {
                        setSavingId(profile.department_id);
                        mutation.mutate({
                          departmentId: profile.department_id,
                          profileSlug: e.target.value || null,
                        });
                      }}
                      className="w-full rounded-md border border-border bg-muted/50 px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
                    >
                      {/* Clearing is a real choice with a real consequence, so it
                          says what it does rather than reading as "unset". */}
                      <option value="">No profile — use role defaults</option>
                      {PROFILE_OPTIONS.map((option) => (
                        <option key={option.slug} value={option.slug}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="px-4 py-3">
                    <select
                      value={profile.default_persona ?? ""}
                      disabled={isSaving}
                      onChange={(e) => {
                        setSavingId(profile.department_id);
                        mutation.mutate({
                          departmentId: profile.department_id,
                          persona: e.target.value || null,
                        });
                      }}
                      className="w-full rounded-md border border-border bg-muted/50 px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
                    >
                      <option value="">Platform default</option>
                      {PERSONA_OPTIONS.map((persona) => (
                        <option key={persona} value={persona}>
                          {PERSONA_LABELS[persona] ?? persona}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="px-4 py-3">
                    {appNames.length > 0 ? (
                      <span className="text-sm text-muted-foreground">
                        {appNames.slice(0, 4).join(", ")}
                        {appNames.length > 4 && ` +${appNames.length - 4} more`}
                      </span>
                    ) : (
                      <span className="text-sm text-amber-600 dark:text-amber-400">
                        Role defaults
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        The sidebar view is a default, not a lock — anyone can pick their own in
        Settings → Appearance.
      </p>
    </div>
  );
}
