"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";

import {
  APP_CATALOG,
  AppAccessConfig,
  AppCategory,
  SUPPORT_CONTACT_EMAIL,
  getAllApps,
} from "@/config/appDefinitions";
import { cn } from "@/lib/utils";

/**
 * The app × module access grid.
 *
 * Extracted from `MemberAppAccessModal`, which owned the only copy. A department
 * profile and a personal override describe the same shape — `{app: {enabled,
 * modules}}` — and are read by one resolver, so two hand-written grids would
 * drift: the member editor already had per-module toggles while the department
 * editor could only pick a whole bundle, which is why a department could not be
 * given "CRM without Inbox" at all even though the backend stored it happily.
 *
 * Presentation only. It holds expand/collapse state and nothing else; whether a
 * change is stored as a delta, a snapshot or a department profile is the caller's
 * business.
 */

type CategoryGroup = {
  category: AppCategory;
  label: string;
  apps: (typeof APP_CATALOG)[string][];
};

const CATEGORIES: CategoryGroup[] = (
  [
    ["engineering", "Engineering"],
    ["people", "People"],
    ["business", "Business"],
    ["productivity", "Productivity"],
  ] as [AppCategory, string][]
).map(([category, label]) => ({
  category,
  label,
  apps: getAllApps().filter((a) => a.category === category),
}));

interface Props {
  value: Record<string, AppAccessConfig>;
  onChange: (next: Record<string, AppAccessConfig>) => void;
  disabled?: boolean;
  /**
   * Apps that cannot be switched off here. The member editor pins `dashboard`
   * (it is the landing page); a department profile pins whatever the workspace
   * always enables, since a profile that disagreed with the workspace toggle
   * would be resolved silently in the workspace's favour.
   */
  lockedApps?: readonly string[];
  /**
   * What the value is measured against, per app id: `true` where the baseline
   * grants the app. Rendered as a hint, so an admin can see that ticking a box
   * is a *change* rather than a restatement — the thing a bare grid cannot show.
   */
  baseline?: Record<string, boolean>;
  /**
   * Called when somebody asks for an app they cannot switch on themselves.
   *
   * Apps marked `contact_support` are shown with the checkbox disabled and this
   * offered in its place — the API refuses to enable them, so a live checkbox
   * would be a control that fails on save. Without this callback the app is
   * still listed and still disabled; it just cannot be asked for from here.
   */
  onRequestApp?: (appId: string) => void;
  /** App ids with a request already sent, so the button can say so. */
  requestedApps?: readonly string[];
}

export function AppModuleGrid({
  value,
  onChange,
  disabled,
  lockedApps = [],
  baseline,
  onRequestApp,
  requestedApps = [],
}: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const locked = useMemo(() => new Set(lockedApps), [lockedApps]);
  const requested = useMemo(() => new Set(requestedApps), [requestedApps]);

  const toggleApp = useCallback(
    (appId: string) => {
      onChange({
        ...value,
        [appId]: { ...value[appId], enabled: !value[appId]?.enabled },
      });
    },
    [value, onChange],
  );

  const toggleModule = useCallback(
    (appId: string, moduleId: string) => {
      onChange({
        ...value,
        [appId]: {
          ...value[appId],
          modules: {
            ...value[appId]?.modules,
            [moduleId]: !value[appId]?.modules?.[moduleId],
          },
        },
      });
    },
    [value, onChange],
  );

  return (
    <div className="space-y-6">
      {CATEGORIES.map((category) => (
        <div key={category.category}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {category.label}
          </h4>
          <div className="space-y-2">
            {category.apps.map((app) => {
              const isEnabled = value[app.id]?.enabled ?? false;
              const isExpanded = expanded[app.id] ?? false;
              const hasModules = app.modules.length > 0;
              const Icon = app.icon;
              const isLocked = locked.has(app.id);
              // Not ours to switch on. The row stays visible — an admin should
              // be able to see the app exists and ask for it — but the checkbox
              // is inert, because the API will refuse it.
              const needsSupport = app.availability === "contact_support";
              const alreadyRequested = requested.has(app.id);
              // Only meaningful when a baseline was supplied: undefined means the
              // caller isn't editing against one, so we say nothing rather than
              // implying every app is a change.
              const differsFromBaseline =
                baseline !== undefined && (baseline[app.id] ?? false) !== isEnabled;

              return (
                <div key={app.id} className="overflow-hidden rounded-md border">
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 transition-colors hover:bg-accent/50",
                      isEnabled ? "bg-accent/20" : "",
                    )}
                  >
                    {hasModules ? (
                      <button
                        onClick={() =>
                          setExpanded((prev) => ({ ...prev, [app.id]: !prev[app.id] }))
                        }
                        className="rounded p-0.5 hover:bg-accent"
                        aria-label={app.name}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    ) : (
                      <span className="w-5" />
                    )}

                    <button
                      onClick={() => toggleApp(app.id)}
                      disabled={disabled || isLocked || needsSupport}
                      title={
                        needsSupport
                          ? `${app.name} is switched on by Aexy — contact ${SUPPORT_CONTACT_EMAIL}`
                          : undefined
                      }
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded border transition-colors",
                        isEnabled
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30",
                        (disabled || isLocked || needsSupport) && "opacity-60",
                        needsSupport && "cursor-not-allowed",
                      )}
                      aria-label={app.name}
                    >
                      {isEnabled && <Check className="h-3 w-3" />}
                    </button>

                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {app.name}
                        {differsFromBaseline && !needsSupport && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase text-primary">
                            changed
                          </span>
                        )}
                        {needsSupport &&
                          (alreadyRequested ? (
                            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] uppercase text-emerald-600 dark:text-emerald-400">
                              requested
                            </span>
                          ) : onRequestApp ? (
                            <button
                              type="button"
                              onClick={() => onRequestApp(app.id)}
                              disabled={disabled}
                              className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase text-primary hover:bg-primary/20 transition disabled:opacity-60"
                            >
                              Contact support
                            </button>
                          ) : (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                              Contact support
                            </span>
                          ))}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {needsSupport
                          ? `${app.description} — switched on by Aexy, not from here`
                          : app.description}
                      </p>
                    </div>
                  </div>

                  {hasModules && isExpanded && (
                    <div className="border-t bg-muted/30 px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {app.modules.map((module) => {
                          const moduleEnabled = value[app.id]?.modules?.[module.id] ?? false;
                          return (
                            <button
                              key={module.id}
                              onClick={() => toggleModule(app.id, module.id)}
                              disabled={disabled || !isEnabled}
                              className={cn(
                                "flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors",
                                moduleEnabled && isEnabled
                                  ? "border border-primary/30 bg-primary/10 text-primary"
                                  : "border border-transparent bg-muted text-muted-foreground",
                                !isEnabled && "opacity-50",
                              )}
                            >
                              <div
                                className={cn(
                                  "flex h-3 w-3 items-center justify-center rounded-sm border",
                                  moduleEnabled && isEnabled
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-muted-foreground/30",
                                )}
                              >
                                {moduleEnabled && isEnabled && <Check className="h-2 w-2" />}
                              </div>
                              {module.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
