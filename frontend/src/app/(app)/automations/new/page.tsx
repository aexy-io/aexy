"use client";

import { getApiErrorMessage } from "@/lib/utils";
import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronLeft, Loader2, Sparkles } from "lucide-react";
import { Node, Edge } from "@xyflow/react";

import { useWorkspace } from "@/hooks/useWorkspace";
import { useAutomationModuleRegistry } from "@/hooks/useAutomations";
import { api, AutomationModule, GeneratedWorkflow } from "@/lib/api";
import {
  AutomationTemplate,
  CRM_TEMPLATE_LIST,
  defaultTriggerTypes,
  getDefaultEdges,
  getDefaultNodes,
  moduleLabels,
} from "@/lib/automationTemplates";
import { TemplateGallery } from "@/components/automations/TemplateGallery";
import { SaveStateBadge, type SaveState } from "@/components/automations/SaveStateBadge";

// WorkflowCanvas drags in @xyflow/react + 7 node components (~150 KB). It
// only matters when the user actually opens the canvas — both the
// template gallery first-run path AND the early `if (!workspaceId)`
// skeleton avoid loading it. Lazy-import via dynamic() so the bundle
// only ships when we're sure we need it.
const WorkflowCanvas = dynamic(
  () => import("@/components/workflow-builder").then((m) => m.WorkflowCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading canvas...
      </div>
    ),
  },
);

export default function NewAutomationPage() {
  const t = useTranslations("automations");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentWorkspace } = useWorkspace();

  // Get module and template from URL query params. Any module the server
  // enables is honoured — the picker below is driven by the same list, so
  // arriving from a filtered list (/automations?module=tickets) starts the
  // builder in that module instead of silently reverting to CRM. An unknown
  // id falls back to CRM via the registry check further down.
  const requestedModule = searchParams.get("module") as AutomationModule | null;
  const moduleParam =
    requestedModule && requestedModule in moduleLabels ? requestedModule : null;
  const templateParam = searchParams.get("template");
  const startBlank = searchParams.get("blank") === "1";
  const template = templateParam
    ? CRM_TEMPLATE_LIST.find((item) => item.id === templateParam) ?? null
    : null;

  // UX-DEF-004: LLM-generated workflow lives in component state (not
  // URL, since the payload can be large). When the gallery's generate
  // dialog succeeds, we stash the workflow here + flip into canvas
  // mode. The canvas reads from `generatedWorkflow` to seed initial
  // nodes/edges, identical to the template path.
  const [generatedWorkflow, setGeneratedWorkflow] = useState<GeneratedWorkflow | null>(null);

  // Decide whether to show the gallery or the canvas. The audit flagged
  // the blank-canvas cold-start as a major UX cliff; we now route
  // first-time creators through a template picker unless they
  // explicitly opted to skip (?blank=1), arrived with a template
  // already picked, or generated one from a prompt.
  const showCanvas = !!template || startBlank || !!generatedWorkflow;

  const [module, setModule] = useState<AutomationModule>(
    template?.module || moduleParam || "crm"
  );
  const [name, setName] = useState(template?.name || "New Automation");
  const [description, setDescription] = useState(template?.description || "");
  // Picking a template swaps the gallery for the canvas via router.replace,
  // which does NOT remount this page — so the useState initialisers above
  // already ran with template === null. Without this, every template-created
  // automation saves as "New Automation" and is impossible to tell apart in
  // the list. Keyed on template id so it only fires on an actual change.
  const templateId = template?.id;
  useEffect(() => {
    if (!templateId) return;
    const picked = CRM_TEMPLATE_LIST.find((item) => item.id === templateId);
    if (!picked) return;
    setName(picked.name);
    setDescription(picked.description || "");
    setModule(picked.module);
  }, [templateId]);
  const [isCreating, setIsCreating] = useState(false);
  const [automationId, setAutomationId] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  // Synchronous mirror of `automationId` so handlers that fire
  // RIGHT AFTER an auto-create (e.g. canvas's handleTest → onSave
  // → onTest) can read the freshly minted id without waiting for
  // React's re-render to update closures. setAutomationId triggers
  // a re-render but the `onTest` closure already captured by the
  // canvas still sees the old null value — the ref bypasses that.
  const automationIdRef = useRef<string | null>(null);
  const updateAutomationId = useCallback((id: string | null) => {
    automationIdRef.current = id;
    setAutomationId(id);
  }, []);

  const handleUseTemplate = (picked: AutomationTemplate) => {
    const params = new URLSearchParams();
    params.set("template", picked.id);
    if (moduleParam && moduleParam !== picked.module) {
      // Keep the originating module-filter on the URL so the back button
      // returns to that filtered list.
      params.set("module", moduleParam);
    }
    router.replace(`/automations/new?${params.toString()}`);
  };

  const handleStartBlank = () => {
    const params = new URLSearchParams();
    params.set("blank", "1");
    if (moduleParam) params.set("module", moduleParam);
    router.replace(`/automations/new?${params.toString()}`);
  };

  const handleUseGenerated = (workflow: GeneratedWorkflow) => {
    // Generated workflows always start as drafts in the user's
    // chosen module (or "crm" by default) — which `module` already holds, so
    // it is left alone rather than forced back to CRM. The user can rename +
    // tweak before save, same as templates.
    setName("Generated Automation");
    setDescription("");
    setGeneratedWorkflow(workflow);
  };

  const workspaceId = currentWorkspace?.id;

  // The offerable module list is server-owned (ENABLED_MODULES): a module is
  // only listed while its trigger/action registry is non-empty, so the picker
  // cannot drop the builder into a module with a blank palette.
  const { modules: enabledModules } = useAutomationModuleRegistry(workspaceId ?? null);

  // Correct an out-of-scope ?module= once the registry lands, but only while
  // the automation is still a draft: the module is immutable server-side after
  // creation (AutomationUpdate refuses it), so switching afterwards would put
  // the header out of step with the stored row.
  useEffect(() => {
    if (!enabledModules.length || automationId) return;
    if (!enabledModules.includes(module)) setModule(enabledModules[0]);
  }, [enabledModules, module, automationId]);

  const handleCreateAutomation = useCallback(async () => {
    if (!workspaceId || isCreating) return null;

    setIsCreating(true);
    setError(null);

    try {
      // Use the correct default trigger type for the module
      const defaultTrigger = defaultTriggerTypes[module] || defaultTriggerTypes.crm;
      const response = await api.post(`/workspaces/${workspaceId}/automations`, {
        name,
        description,
        module,
        trigger_type: defaultTrigger.type,
        trigger_config: {},
        actions: [], // Start with empty actions, user will add via workflow canvas
      });
      updateAutomationId(response.data.id);
      return response.data.id;
    } catch (err: unknown) {
      const errorMessage = getApiErrorMessage(err, "Failed to create automation");
      setError(errorMessage);
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [workspaceId, name, description, module, isCreating, updateAutomationId]);

  const handleSave = useCallback(
    async (nodes: Node[], edges: Edge[], viewport: { x: number; y: number; zoom: number }) => {
      if (!workspaceId) return;

      let currentAutomationId = automationId;

      // Extract trigger type from the trigger node
      const triggerNode = nodes.find((n) => n.type === "trigger");
      const triggerType = (triggerNode?.data?.trigger_type as string) || "record.created";
      
      // Create automation if not exists
      if (!currentAutomationId) {
        currentAutomationId = await handleCreateAutomation();
        if (!currentAutomationId) throw new Error("Failed to create automation");
      }

      // Update workflow (workflow endpoints are under /crm/automations)
      setSaveState("saving");
      try {
        await api.put(
          `/workspaces/${workspaceId}/crm/automations/${currentAutomationId}/workflow`,
          {
            nodes,
            edges,
            viewport,
          }
        );

        // Also update the automation's trigger_type to match the trigger node
        await api.patch(
          `/workspaces/${workspaceId}/automations/${currentAutomationId}`,
          {
            trigger_type: triggerType,
          }
        );
        setError(null);
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1500);
      } catch (err: unknown) {
        const errorMessage = getApiErrorMessage(err, "Failed to save workflow");
        setError(errorMessage);
        setSaveState("error");
        throw err;
      }
    },
    [workspaceId, automationId, handleCreateAutomation]
  );

  const handlePublish = useCallback(async () => {
    if (!workspaceId || !automationId) {
      throw new Error("Save the automation before publishing");
    }

    try {
      const response = await api.post(
        `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow/publish`
      );
      setIsPublished(response.data?.is_published === true);
      setError(null);
    } catch (err: unknown) {
      const errorMessage = getApiErrorMessage(err, "Failed to publish workflow");
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [workspaceId, automationId]);

  const handleUnpublish = useCallback(async () => {
    if (!workspaceId || !automationId) {
      throw new Error("Save the automation before unpublishing");
    }

    try {
      const response = await api.post(
        `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow/unpublish`
      );
      setIsPublished(response.data?.is_published === true);
      setError(null);
    } catch (err: unknown) {
      const errorMessage = getApiErrorMessage(err, "Failed to unpublish workflow");
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [workspaceId, automationId]);

  const handleTest = useCallback(
    async (recordId?: string) => {
      // Read from the ref so we pick up an id minted by a just-
      // completed handleSave in the same await chain. The state-
      // backed `automationId` would still be the old value at this
      // closure capture — see updateAutomationId for the rationale.
      const id = automationIdRef.current ?? automationId;
      if (!workspaceId || !id) return;

      try {
        const response = await api.post(
          `/workspaces/${workspaceId}/crm/automations/${id}/workflow/execute`,
          {
            dry_run: true,
            // Only include record_id if provided and non-empty
            ...(recordId?.trim() ? { record_id: recordId.trim() } : {}),
          }
        );
        setError(null);
        return response.data;
      } catch (err: unknown) {
        const errorMessage = getApiErrorMessage(err, "Failed to test workflow");
        setError(errorMessage);
        throw err;
      }
    },
    [workspaceId, automationId]
  );

  const handleBack = () => {
    const backUrl = moduleParam ? `/automations?module=${moduleParam}` : "/automations";
    router.push(backUrl);
  };

  if (!workspaceId) {
    return (
      <div className="animate-pulse">
        <div className="h-[calc(100vh-64px)] flex flex-col">
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border bg-muted/50">
            <div className="flex items-center gap-4">
              <div className="h-9 w-9 bg-accent rounded-lg" />
              <div>
                <div className="h-5 w-48 bg-accent rounded mb-2" />
                <div className="h-3 w-32 bg-accent rounded" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-9 w-20 bg-accent rounded-lg" />
              <div className="h-9 w-24 bg-accent rounded-lg" />
            </div>
          </div>
          <div className="flex-1 flex">
            <div className="flex-1 p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-muted border border-border rounded-xl p-4">
                  <div className="h-4 w-32 bg-accent rounded mb-3" />
                  <div className="h-10 w-full bg-accent rounded-lg" />
                </div>
              ))}
            </div>
            <div className="w-80 border-l border-border p-4 space-y-3">
              <div className="h-4 w-24 bg-accent rounded" />
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 w-full bg-accent rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Gallery mode — no template + user hasn't explicitly opted to skip.
  if (!showCanvas) {
    return (
      <TemplateGallery
        initialModule={moduleParam}
        workspaceId={workspaceId ?? null}
        onUseTemplate={handleUseTemplate}
        onStartBlank={handleStartBlank}
        onUseGenerated={handleUseGenerated}
        onBack={handleBack}
      />
    );
  }

  return (
    <div>
      <div className="h-[calc(100vh-64px)] flex flex-col">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-3 border-b border-border bg-muted/50 relative z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-lg font-semibold text-foreground bg-transparent border-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-2 py-1 -ml-2"
                  placeholder={t("builder.namePlaceholder")}
                />
                {/* Module picker. Editable only while this is still a draft:
                    once the row exists the module is fixed server-side, so it
                    renders as a plain badge rather than a control that would
                    take a click and do nothing. */}
                {automationId ? (
                  <span
                    className="text-sm text-muted-foreground bg-accent px-2 py-0.5 rounded"
                    title={t("builder.moduleLocked")}
                  >
                    {moduleLabels[module]}
                  </span>
                ) : (
                  <select
                    aria-label={t("builder.moduleLabel")}
                    value={module}
                    onChange={(e) => setModule(e.target.value as AutomationModule)}
                    className="text-sm bg-accent border border-border rounded-lg px-3 py-1 text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {(enabledModules.length ? enabledModules : [module]).map((m) => (
                      <option key={m} value={m}>
                        {moduleLabels[m] || m}
                      </option>
                    ))}
                  </select>
                )}
                <SaveStateBadge state={saveState} />
              </div>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="block text-sm text-muted-foreground bg-transparent border-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-2 py-0.5 -ml-2 w-full max-w-md"
                placeholder={t("builder.descriptionPlaceholder")}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-500/10 px-3 py-1 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Template Banner — anchors the canvas to the template the user
            just picked, with a one-click escape back to the gallery in
            case they want to try a different starting point. */}
        {template && (
          <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-b border-primary/20 text-sm">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <span className="text-muted-foreground flex-1">
              {t("builder.fromTemplate")}
              {" "}
              <span className="text-foreground font-medium">{template.name}</span>
              {" "}
              {t("builder.fromTemplateTail")}
            </span>
            <Link
              href={moduleParam ? `/automations/new?module=${moduleParam}` : "/automations/new"}
              className="text-primary hover:underline text-xs font-medium"
            >
              {t("builder.pickAnotherTemplate")}
            </Link>
          </div>
        )}

        {/* Workflow Canvas */}
        <div className="flex-1">
          <WorkflowCanvas
            // Force-remount when the seed source changes so initial
            // nodes/edges are re-read. Generated workflows get their
            // own key so editing one and then generating another
            // doesn't bleed nodes from the first into the second.
            key={generatedWorkflow ? "generated" : module}
            automationId={automationId || "new"}
            workspaceId={workspaceId}
            module={module}
            // Generated workflows seed nodes/edges directly. The
            // generator already validated the shape; the canvas
            // applies its usual validation rules on top.
            initialNodes={
              generatedWorkflow
                ? (generatedWorkflow.nodes as unknown as Node[])
                : getDefaultNodes(module, template)
            }
            initialEdges={
              generatedWorkflow
                ? (generatedWorkflow.edges as unknown as Edge[])
                : getDefaultEdges(template)
            }
            isPublished={isPublished}
            onSave={handleSave}
            onPublish={handlePublish}
            onUnpublish={handleUnpublish}
            onTest={handleTest}
          />
        </div>
      </div>
    </div>
  );
}
