"use client";

import { useMemo, useState } from "react";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AppModuleGrid } from "@/components/access/AppModuleGrid";
import { AppAccessConfig, SYSTEM_BUNDLES } from "@/config/appDefinitions";
import { DepartmentAccessProfile } from "@/lib/organization-api";

/**
 * Edit exactly what one department's people can see, app by app and module by
 * module.
 *
 * The panel this opens from could only assign a whole bundle, so "Business" was
 * as fine-grained as a department could get — while the backend has stored an
 * explicit `app_config` with per-module flags all along, and the resolver has
 * always read it. A department could not be given "CRM without the Inbox" from
 * any screen.
 *
 * Bundles remain the starting point rather than the only choice: picking one
 * fills the grid, and editing from there keeps the bundle name as a label
 * ("Business, tweaked"), which is the provenance the API's `profile_slug`
 * already models.
 */

const PROFILE_OPTIONS = [
  { slug: "engineering", label: "Engineering" },
  { slug: "people", label: "People" },
  { slug: "business", label: "Business" },
  { slug: "full_access", label: "Full access" },
];

interface Props {
  profile: DepartmentAccessProfile;
  /** Apps the workspace has switched off — a profile cannot grant past them. */
  workspaceDisabledApps?: readonly string[];
  onClose: () => void;
  onSave: (data: {
    app_config: Record<string, AppAccessConfig>;
    profile_slug: string | null;
  }) => Promise<void>;
  saving: boolean;
}

export function DepartmentProfileEditor({
  profile,
  workspaceDisabledApps = [],
  onClose,
  onSave,
  saving,
}: Props) {
  const [config, setConfig] = useState<Record<string, AppAccessConfig>>(
    () => normalise(profile.app_config),
  );
  const [slug, setSlug] = useState<string | null>(profile.access_profile_slug);
  // Set once, from the profile as it was opened: the grid's "changed" hints are
  // meant to show the edits made in this sitting, so they must not chase the
  // value being edited.
  const baseline = useMemo(
    () => Object.fromEntries(
      Object.entries(normalise(profile.app_config)).map(([id, c]) => [id, !!c.enabled]),
    ),
    [profile.app_config],
  );

  const enabledCount = Object.values(config).filter((c) => c.enabled).length;
  // A bundle whose grid has since been edited is still worth naming — "Business,
  // tweaked" tells an admin where this started, which a bare grid cannot.
  const tweaked =
    slug !== null && !sameShape(config, bundleConfig(slug));

  const applyBundle = (nextSlug: string) => {
    setSlug(nextSlug || null);
    if (nextSlug) setConfig(bundleConfig(nextSlug));
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>{profile.department_name} — access</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3 text-sm">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Users className="h-3.5 w-3.5" aria-hidden />
            {/* Named before anything is ticked: this is not one person's settings
                screen, it decides for everyone in the department at once. */}
            {profile.member_count === 1
              ? "1 person is in this department"
              : `${profile.member_count} people are in this department`}
          </span>
          <span className="ml-auto flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Start from</label>
            <select
              value={slug ?? ""}
              onChange={(e) => applyBundle(e.target.value)}
              disabled={saving}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm disabled:opacity-60"
            >
              <option value="">Nothing — build it here</option>
              {PROFILE_OPTIONS.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.label}
                </option>
              ))}
            </select>
          </span>
        </div>

        <div className="flex-1 overflow-y-auto py-3">
          <AppModuleGrid
            value={config}
            onChange={setConfig}
            disabled={saving}
            lockedApps={ALWAYS_ON}
            baseline={baseline}
          />
        </div>

        <div className="border-t border-border pt-3 text-xs text-muted-foreground">
          {enabledCount === 0 ? (
            // Not the same as "no access": an empty profile is how a department
            // is put back on role defaults, and that switches API enforcement off
            // for its people. Worth saying out loud before they save it.
            <span className="text-amber-600 dark:text-amber-500">
              Nothing enabled — saving this puts these people back on their
              workspace role&apos;s defaults.
            </span>
          ) : (
            <>
              {enabledCount} app{enabledCount === 1 ? "" : "s"} enabled
              {tweaked && slug ? ` · based on ${labelFor(slug)}, edited` : ""}
              {workspaceDisabledApps.length > 0 && (
                <>
                  {" · "}
                  {/* The workspace toggle beats every other layer, so a profile
                      granting an app the workspace has off is not a contradiction
                      the user will ever see resolved in their favour. */}
                  apps switched off for the whole workspace stay off
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              try {
                await onSave({ app_config: config, profile_slug: slug });
              } catch {
                toast.error("Could not save the profile");
              }
            }}
            disabled={saving}
          >
            {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Apps a department profile may not switch off — the platform floor. */
const ALWAYS_ON = ["dashboard", "chat", "organization"] as const;

function labelFor(slug: string): string {
  return PROFILE_OPTIONS.find((o) => o.slug === slug)?.label ?? slug;
}

/** A bundle expanded into grid shape, so "start from Business" fills the grid.
 *
 *  Expanded client-side from `SYSTEM_BUNDLES` — the same definitions the server
 *  seeds from — so the grid can be edited before anything is saved. The server
 *  still expands the slug on its own when no `app_config` is sent. */
function bundleConfig(slug: string): Record<string, AppAccessConfig> {
  const bundle = SYSTEM_BUNDLES.find((b) => b.id === slug);
  if (!bundle) return {};
  return normalise(bundle.appConfig as Record<string, AppAccessConfig>);
}

/**
 * A stored profile in grid shape.
 *
 * `modules` is absent on an app whose sub-pages were never configured, and the
 * grid reads `modules[id] ?? false`; without this an app arriving with no
 * `modules` key would render every module unticked and then *save* them as
 * explicitly off.
 */
function normalise(
  raw: Record<string, { enabled?: boolean; modules?: Record<string, boolean> }> | null | undefined,
): Record<string, AppAccessConfig> {
  const out: Record<string, AppAccessConfig> = {};
  for (const [appId, entry] of Object.entries(raw ?? {})) {
    out[appId] = { enabled: !!entry?.enabled, modules: entry?.modules ?? {} };
  }
  return out;
}

function sameShape(
  a: Record<string, AppAccessConfig>,
  b: Record<string, AppAccessConfig>,
): boolean {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) {
    if (!!a[id]?.enabled !== !!b[id]?.enabled) return false;
    const modules = new Set([
      ...Object.keys(a[id]?.modules ?? {}),
      ...Object.keys(b[id]?.modules ?? {}),
    ]);
    for (const moduleId of modules) {
      if (!!a[id]?.modules?.[moduleId] !== !!b[id]?.modules?.[moduleId]) return false;
    }
  }
  return true;
}
