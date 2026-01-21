"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Check,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useMemberAppAccess,
  useAppAccessTemplates,
} from "@/hooks/useAppAccess";
import {
  APP_CATALOG,
  getAllApps,
  AppCategory,
  AppAccessConfig,
} from "@/config/appDefinitions";
import { MemberEffectiveAccess, AppAccessTemplate } from "@/lib/api";

interface MemberAppAccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  developerId: string;
  developerName?: string;
  onSuccess?: () => void;
}

type CategoryGroup = {
  category: AppCategory;
  label: string;
  apps: typeof APP_CATALOG[string][];
};

const CATEGORIES: CategoryGroup[] = [
  {
    category: "engineering",
    label: "Engineering",
    apps: getAllApps().filter((a) => a.category === "engineering"),
  },
  {
    category: "people",
    label: "People",
    apps: getAllApps().filter((a) => a.category === "people"),
  },
  {
    category: "business",
    label: "Business",
    apps: getAllApps().filter((a) => a.category === "business"),
  },
  {
    category: "productivity",
    label: "Productivity",
    apps: getAllApps().filter((a) => a.category === "productivity"),
  },
];

export function MemberAppAccessModal({
  open,
  onOpenChange,
  workspaceId,
  developerId,
  developerName,
  onSuccess,
}: MemberAppAccessModalProps) {
  const [accessConfig, setAccessConfig] = useState<
    Record<string, AppAccessConfig>
  >({});
  const [expandedApps, setExpandedApps] = useState<Record<string, boolean>>({});
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoadingAccess, setIsLoadingAccess] = useState(false);
  const [effectiveAccess, setEffectiveAccess] =
    useState<MemberEffectiveAccess | null>(null);

  const {
    getMemberAccess,
    updateMemberAccess,
    applyTemplateToMember,
    resetMemberToDefaults,
    isUpdating,
    isApplyingTemplate,
    isResetting,
  } = useMemberAppAccess(workspaceId);

  const { templates, isLoading: templatesLoading } =
    useAppAccessTemplates(workspaceId);

  // Load member's current access when modal opens
  useEffect(() => {
    if (open && developerId) {
      setIsLoadingAccess(true);
      getMemberAccess(developerId)
        .then((access) => {
          setEffectiveAccess(access);
          // Convert effective access to editable config
          const config: Record<string, AppAccessConfig> = {};
          for (const [appId, appAccess] of Object.entries(access.apps)) {
            config[appId] = {
              enabled: appAccess.enabled,
              modules: appAccess.modules,
            };
          }
          setAccessConfig(config);
          setSelectedTemplateId(access.applied_template_id);
          setHasChanges(false);
        })
        .finally(() => setIsLoadingAccess(false));
    }
  }, [open, developerId, getMemberAccess]);

  const toggleApp = useCallback((appId: string) => {
    setAccessConfig((prev) => ({
      ...prev,
      [appId]: {
        ...prev[appId],
        enabled: !prev[appId]?.enabled,
      },
    }));
    setHasChanges(true);
    setSelectedTemplateId(null); // Clear template since user is making custom changes
  }, []);

  const toggleModule = useCallback((appId: string, moduleId: string) => {
    setAccessConfig((prev) => ({
      ...prev,
      [appId]: {
        ...prev[appId],
        modules: {
          ...prev[appId]?.modules,
          [moduleId]: !prev[appId]?.modules?.[moduleId],
        },
      },
    }));
    setHasChanges(true);
    setSelectedTemplateId(null);
  }, []);

  const toggleExpanded = useCallback((appId: string) => {
    setExpandedApps((prev) => ({
      ...prev,
      [appId]: !prev[appId],
    }));
  }, []);

  const handleApplyTemplate = useCallback(
    async (templateId: string) => {
      try {
        await applyTemplateToMember({ developerId, templateId });
        // Reload access
        const access = await getMemberAccess(developerId);
        setEffectiveAccess(access);
        const config: Record<string, AppAccessConfig> = {};
        for (const [appId, appAccess] of Object.entries(access.apps)) {
          config[appId] = {
            enabled: appAccess.enabled,
            modules: appAccess.modules,
          };
        }
        setAccessConfig(config);
        setSelectedTemplateId(templateId);
        setHasChanges(false);
      } catch (error) {
        console.error("Failed to apply template:", error);
      }
    },
    [applyTemplateToMember, developerId, getMemberAccess]
  );

  const handleReset = useCallback(async () => {
    try {
      await resetMemberToDefaults(developerId);
      // Reload access
      const access = await getMemberAccess(developerId);
      setEffectiveAccess(access);
      const config: Record<string, AppAccessConfig> = {};
      for (const [appId, appAccess] of Object.entries(access.apps)) {
        config[appId] = {
          enabled: appAccess.enabled,
          modules: appAccess.modules,
        };
      }
      setAccessConfig(config);
      setSelectedTemplateId(null);
      setHasChanges(false);
    } catch (error) {
      console.error("Failed to reset:", error);
    }
  }, [resetMemberToDefaults, developerId, getMemberAccess]);

  const handleSave = useCallback(async () => {
    try {
      await updateMemberAccess({
        developerId,
        appConfig: accessConfig,
        appliedTemplateId: selectedTemplateId,
      });
      setHasChanges(false);
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save:", error);
    }
  }, [
    updateMemberAccess,
    developerId,
    accessConfig,
    selectedTemplateId,
    onSuccess,
    onOpenChange,
  ]);

  const isSaving = isUpdating || isApplyingTemplate || isResetting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Edit App Access{developerName ? ` - ${developerName}` : ""}
          </DialogTitle>
          <DialogDescription>
            Configure which apps and modules this member can access.
          </DialogDescription>
        </DialogHeader>

        {isLoadingAccess || templatesLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Quick Apply Template */}
            <div className="border-b pb-4">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium">Quick Apply:</label>
                <select
                  value={selectedTemplateId || ""}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleApplyTemplate(e.target.value);
                    }
                  }}
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                  disabled={isSaving}
                >
                  <option value="">Select a template...</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                      {template.is_system ? " (System)" : ""}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  disabled={isSaving}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reset to Defaults
                </Button>
              </div>

              {effectiveAccess?.has_custom_overrides && (
                <div className="flex items-center gap-2 mt-2 text-sm text-amber-600">
                  <AlertCircle className="h-4 w-4" />
                  Custom overrides applied
                </div>
              )}
            </div>

            {/* App List */}
            <div className="flex-1 overflow-y-auto py-4 space-y-6">
              {CATEGORIES.map((category) => (
                <div key={category.category}>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {category.label}
                  </h4>
                  <div className="space-y-2">
                    {category.apps.map((app) => {
                      const isEnabled = accessConfig[app.id]?.enabled ?? false;
                      const isExpanded = expandedApps[app.id] ?? false;
                      const hasModules = app.modules.length > 0;
                      const Icon = app.icon;

                      return (
                        <div
                          key={app.id}
                          className="border rounded-md overflow-hidden"
                        >
                          {/* App Row */}
                          <div
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 hover:bg-accent/50 transition-colors",
                              isEnabled ? "bg-accent/20" : ""
                            )}
                          >
                            {/* Expand button */}
                            {hasModules ? (
                              <button
                                onClick={() => toggleExpanded(app.id)}
                                className="p-0.5 hover:bg-accent rounded"
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

                            {/* Toggle */}
                            <button
                              onClick={() => toggleApp(app.id)}
                              className={cn(
                                "h-5 w-5 rounded border flex items-center justify-center transition-colors",
                                isEnabled
                                  ? "bg-primary border-primary text-primary-foreground"
                                  : "border-muted-foreground/30"
                              )}
                              disabled={isSaving || app.id === "dashboard"} // Dashboard always enabled
                            >
                              {isEnabled && <Check className="h-3 w-3" />}
                            </button>

                            {/* App info */}
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <div className="flex-1">
                              <p className="text-sm font-medium">{app.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {app.description}
                              </p>
                            </div>
                          </div>

                          {/* Modules */}
                          {hasModules && isExpanded && (
                            <div className="border-t bg-muted/30 px-3 py-2">
                              <div className="flex flex-wrap gap-2">
                                {app.modules.map((module) => {
                                  const moduleEnabled =
                                    accessConfig[app.id]?.modules?.[module.id] ??
                                    false;
                                  return (
                                    <button
                                      key={module.id}
                                      onClick={() =>
                                        toggleModule(app.id, module.id)
                                      }
                                      disabled={isSaving || !isEnabled}
                                      className={cn(
                                        "flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors",
                                        moduleEnabled && isEnabled
                                          ? "bg-primary/10 text-primary border border-primary/30"
                                          : "bg-muted text-muted-foreground border border-transparent",
                                        !isEnabled && "opacity-50"
                                      )}
                                    >
                                      <div
                                        className={cn(
                                          "h-3 w-3 rounded-sm border flex items-center justify-center",
                                          moduleEnabled && isEnabled
                                            ? "bg-primary border-primary text-primary-foreground"
                                            : "border-muted-foreground/30"
                                        )}
                                      >
                                        {moduleEnabled && isEnabled && (
                                          <Check className="h-2 w-2" />
                                        )}
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
          </>
        )}

        <DialogFooter className="border-t pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default MemberAppAccessModal;
