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
import Link from "next/link";
import { Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  useMemberAppAccess,
  useAppAccessTemplates,
} from "@/hooks/useAppAccess";
import { AppAccessConfig } from "@/config/appDefinitions";
import { AppModuleGrid } from "@/components/access/AppModuleGrid";
import { MemberEffectiveAccess } from "@/lib/api";

interface MemberAppAccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  developerId: string;
  developerName?: string;
  onSuccess?: () => void;
}

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
    resetMemberToInherited,
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
        toast.success("Template applied successfully");
      } catch (error) {
        console.error("Failed to apply template:", error);
        toast.error("Failed to apply template");
      }
    },
    [applyTemplateToMember, developerId, getMemberAccess]
  );

  const handleReset = useCallback(async () => {
    try {
      await resetMemberToInherited(developerId);
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
      toast.success("Overrides cleared — inheriting again");
    } catch (error) {
      console.error("Failed to reset:", error);
      toast.error("Failed to reset access");
    }
  }, [resetMemberToInherited, developerId, getMemberAccess]);

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
      toast.success("App access updated successfully");
    } catch (error) {
      console.error("Failed to save:", error);
      toast.error("Failed to update app access");
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
            Only your changes are stored: anything you leave as-is keeps following
            this person&apos;s department profile.
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
                  title="Drop every override so this person inherits from their department again"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reset to inherited
                </Button>
              </div>

              {/* What this person inherits, and from where. Saving stores only the
                  differences against this baseline, so an admin needs to know what
                  the baseline is before they start ticking boxes. */}
              {effectiveAccess && (
                <div className="mt-2 space-y-1 text-sm">
                  {effectiveAccess.baseline === "department" ? (
                    <p className="text-muted-foreground">
                      Inherits from{" "}
                      <span className="text-foreground">
                        {effectiveAccess.departments
                          .filter((d) => d.has_profile)
                          .map((d) => d.name)
                          .join(", ") || "their departments"}
                      </span>
                      . Anything you leave alone keeps following it.{" "}
                      {/* An override is often the wrong tool: if the whole
                          department needs the change, editing the profile fixes it
                          for everyone instead of pinning this one person out of
                          every future change to it. */}
                      <Link
                        href="/settings/access?tab=departments"
                        className="text-primary hover:underline"
                        onClick={() => onOpenChange(false)}
                      >
                        Edit the department instead
                      </Link>
                    </p>
                  ) : effectiveAccess.baseline === "member_template" ? (
                    <p className="text-muted-foreground">
                      Pinned to the{" "}
                      <span className="text-foreground">
                        {effectiveAccess.applied_template_name || "selected"}
                      </span>{" "}
                      profile, which replaces their department&apos;s.
                    </p>
                  ) : (
                    <p className="flex items-start gap-2 text-amber-600 dark:text-amber-400">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        No department profile applies, so this falls back to their
                        workspace role.{" "}
                        <Link
                          href="/settings/access?tab=departments"
                          className="underline"
                          onClick={() => onOpenChange(false)}
                        >
                          Give their department a profile
                        </Link>{" "}
                        to decide it deliberately.
                      </span>
                    </p>
                  )}

                  {effectiveAccess.has_custom_overrides && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <AlertCircle className="h-4 w-4" />
                      Has overrides of their own on top.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* The app x module grid, shared with the department profile editor.
                Both describe the same `{app: {enabled, modules}}` shape and are
                read by one resolver, so a second hand-written copy would drift. */}
            <div className="flex-1 overflow-y-auto py-4">
              <AppModuleGrid
                value={accessConfig}
                onChange={(next) => {
                  setAccessConfig(next);
                  setHasChanges(true);
                  // Any hand edit stops this being "the template", which is what
                  // the pinned-profile baseline means.
                  setSelectedTemplateId(null);
                }}
                disabled={isSaving}
                lockedApps={["dashboard"]}
              />
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
