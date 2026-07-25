"use client";

import { getApiErrorMessage } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { WizardProgress, WizardStep } from "./WizardProgress";
import { WizardNavigation } from "./WizardNavigation";
import {
  AgentTypeStep,
  BasicInfoStep,
  LLMConfigStep,
  ToolSelectionStep,
  BehaviorStep,
  PromptEditorStep,
  EmailConfigStep,
  ReviewStep,
} from "./steps";
import { useAgents } from "@/hooks/useAgents";
import { useAgentDefaults } from "@/hooks/useAgentDefaults";
import { useAgentDraft } from "@/hooks/useAgentDraft";
import { AgentType, StandardAgentType, WorkingHoursConfig, AGENT_TYPE_CONFIG, agentsApi } from "@/lib/api";

// UX-WIZ-001: persist the 8-step wizard form to localStorage so Cmd+R
// on step 7 doesn't erase the user's progress. Keyed by workspace so a
// user juggling multiple workspaces doesn't bleed drafts across them.
// The persisted shape is a flat snapshot; on hydrate we set each piece
// of state from it. Cleared on successful submit OR explicit discard.
const DRAFT_VERSION = 1;
interface WizardDraft {
  v: number;
  step: number;
  agentType: AgentType | null;
  name: string;
  description: string;
  mentionHandle: string;
  llmProvider: "claude" | "gemini" | "ollama" | "openrouter";
  llmModel: string;
  temperature: number;
  maxTokens: number;
  tools: string[];
  autoRespond: boolean;
  confidenceThreshold: number;
  requireApprovalBelow: number;
  maxDailyResponses: number;
  responseDelayMinutes: number;
  workingHours: WorkingHoursConfig | null;
  systemPrompt: string;
  customInstructions: string;
  emailEnabled: boolean;
  emailHandle: string;
  emailDomain: string;
  autoReplyEnabled: boolean;
  emailSignature: string;
  savedAt: number;
}
const draftKey = (workspaceId: string) => `agent-wizard-draft:${workspaceId}`;
function readDraft(workspaceId: string): WizardDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(workspaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.v !== DRAFT_VERSION) return null;
    return parsed as WizardDraft;
  } catch {
    return null;
  }
}

const WIZARD_STEPS: WizardStep[] = [
  { id: "type", title: "Type", description: "Choose agent type" },
  { id: "basic", title: "Basic Info", description: "Name & description" },
  { id: "llm", title: "LLM", description: "Model configuration" },
  { id: "tools", title: "Tools", description: "Select capabilities" },
  { id: "behavior", title: "Behavior", description: "Thresholds & limits" },
  { id: "prompts", title: "Prompts", description: "System prompt" },
  { id: "email", title: "Email", description: "Email configuration" },
  { id: "review", title: "Review", description: "Final review" },
];

interface AgentCreationWizardProps {
  workspaceId: string;
  onClose?: () => void;
}

export function AgentCreationWizard({
  workspaceId,
  onClose,
}: AgentCreationWizardProps) {
  const router = useRouter();
  const { createAgent, isCreating } = useAgents(workspaceId);
  // UX-EDT-024: pull server-side defaults instead of hardcoding
  // gemini-2.0-flash. The hook keeps a hardcoded fallback so the
  // first paint isn't blank if the call is in flight.
  const { defaults } = useAgentDefaults(workspaceId);
  // UX-DEF-003: server-side wizard draft for cross-device resume.
  // Layered on top of the localStorage path — localStorage covers
  // same-browser Cmd+R; this covers picking the wizard back up on
  // a different machine.
  const serverDraftHook = useAgentDraft(workspaceId);
  // Lazy initializer reads the saved draft once on mount so the user
  // resumes where they left off. Subsequent state changes write back
  // via the autosave effect below.
  const initialDraft = useRef<WizardDraft | null>(null);
  if (initialDraft.current === null && typeof window !== "undefined") {
    initialDraft.current = readDraft(workspaceId);
  }
  const draft = initialDraft.current;
  const [hydratedFromDraft] = useState(() => Boolean(draft));
  const [currentStep, setCurrentStep] = useState(draft?.step ?? 0);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [agentType, setAgentType] = useState<AgentType | null>(draft?.agentType ?? null);
  const [name, setName] = useState(draft?.name ?? "");
  const [description, setDescription] = useState(draft?.description ?? "");
  const [mentionHandle, setMentionHandle] = useState(draft?.mentionHandle ?? "");
  const [llmProvider, setLlmProvider] = useState<"claude" | "gemini" | "ollama" | "openrouter">(
    draft?.llmProvider ?? "gemini",
  );
  const [llmModel, setLlmModel] = useState(draft?.llmModel ?? "gemini-2.0-flash");
  const [temperature, setTemperature] = useState(draft?.temperature ?? 0.7);
  const [maxTokens, setMaxTokens] = useState(draft?.maxTokens ?? 2000);
  const [tools, setTools] = useState<string[]>(draft?.tools ?? []);
  const [autoRespond, setAutoRespond] = useState(draft?.autoRespond ?? true);
  const [confidenceThreshold, setConfidenceThreshold] = useState(draft?.confidenceThreshold ?? 0.7);
  const [requireApprovalBelow, setRequireApprovalBelow] = useState(draft?.requireApprovalBelow ?? 0.8);
  const [maxDailyResponses, setMaxDailyResponses] = useState(draft?.maxDailyResponses ?? 100);
  const [responseDelayMinutes, setResponseDelayMinutes] = useState(draft?.responseDelayMinutes ?? 5);
  const [workingHours, setWorkingHours] = useState<WorkingHoursConfig | null>(draft?.workingHours ?? null);
  const [systemPrompt, setSystemPrompt] = useState(draft?.systemPrompt ?? "");
  const [customInstructions, setCustomInstructions] = useState(draft?.customInstructions ?? "");

  // Email configuration state
  const [emailEnabled, setEmailEnabled] = useState(draft?.emailEnabled ?? false);
  const [emailHandle, setEmailHandle] = useState(draft?.emailHandle ?? "");
  const [emailDomain, setEmailDomain] = useState(draft?.emailDomain ?? "");
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(draft?.autoReplyEnabled ?? true);
  const [emailSignature, setEmailSignature] = useState(draft?.emailSignature ?? "");

  // One-time toast: tell the user we restored their draft so the
  // pre-filled state doesn't look like the wizard is broken / out of
  // sync with the URL. "Discard" wipes the draft + resets to defaults.
  useEffect(() => {
    if (!hydratedFromDraft) return;
    toast.message("Resumed your in-progress agent", {
      description: "Picked up where you left off. Discard to start fresh.",
      duration: 8000,
      action: {
        label: "Discard",
        onClick: () => {
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(draftKey(workspaceId));
          }
          // Also drop the server-side draft so a discard on this
          // device doesn't leave the wizard re-appearing on the
          // next one.
          void serverDraftHook.clear();
          // Reload the page to reset every piece of state cleanly —
          // a manual setX(default) call for every field is fragile.
          if (typeof window !== "undefined") window.location.reload();
        },
      },
    });
    // Intentionally only fire once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave: serialize the full state into localStorage on every
  // change. Cheap because the payload is small (no canvas, no images)
  // and JSON.stringify on ~25 primitives is sub-ms. The draft is
  // cleared on successful submit (handleSubmit) — Cmd+R or tab close
  // mid-flow keeps the snapshot.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const snapshot: WizardDraft = {
      v: DRAFT_VERSION,
      step: currentStep,
      agentType,
      name,
      description,
      mentionHandle,
      llmProvider,
      llmModel,
      temperature,
      maxTokens,
      tools,
      autoRespond,
      confidenceThreshold,
      requireApprovalBelow,
      maxDailyResponses,
      responseDelayMinutes,
      workingHours,
      systemPrompt,
      customInstructions,
      emailEnabled,
      emailHandle,
      emailDomain,
      autoReplyEnabled,
      emailSignature,
      savedAt: Date.now(),
    };
    try {
      window.localStorage.setItem(draftKey(workspaceId), JSON.stringify(snapshot));
    } catch {
      // localStorage can throw under private-browsing / quota limits;
      // autosave failing isn't worth a user-facing toast.
    }
    // UX-DEF-003: also sync to the server (debounced inside the
    // hook). localStorage keeps working as the same-browser fast
    // path — the server call layers cross-device on top.
    // `snapshot` is already a plain object — pass it through.
    serverDraftHook.save(snapshot as unknown as Record<string, unknown>);
  }, [
    workspaceId,
    currentStep,
    agentType,
    name,
    description,
    mentionHandle,
    llmProvider,
    llmModel,
    temperature,
    maxTokens,
    tools,
    autoRespond,
    confidenceThreshold,
    requireApprovalBelow,
    maxDailyResponses,
    responseDelayMinutes,
    workingHours,
    systemPrompt,
    customInstructions,
    emailEnabled,
    emailHandle,
    emailDomain,
    autoReplyEnabled,
    emailSignature,
    // serverDraftHook is intentionally NOT a dep — the hook's
    // `save` reference is stable, and adding it would trigger this
    // effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  // When agent type is selected, initialize with defaults
  const handleTypeSelect = (type: AgentType) => {
    setAgentType(type);
    const config = type in AGENT_TYPE_CONFIG ? AGENT_TYPE_CONFIG[type as StandardAgentType] : null;
    if (config && config.defaultTools.length > 0 && tools.length === 0) {
      setTools(config.defaultTools);
    }
  };

  // Validation for each step
  const canProceed = (): boolean => {
    switch (currentStep) {
      case 0: // Type
        return agentType !== null;
      case 1: // Basic Info
        return name.trim().length > 0;
      case 2: // LLM Config
        return !!llmProvider && !!llmModel && temperature >= 0 && maxTokens > 0;
      case 3: // Tools
        return true; // Tools are optional
      case 4: // Behavior
        return (
          confidenceThreshold >= 0 &&
          confidenceThreshold <= 1 &&
          requireApprovalBelow >= 0 &&
          requireApprovalBelow <= 1 &&
          maxDailyResponses > 0
        );
      case 5: // Prompts
        return true; // Prompts are optional
      case 6: // Email
        // If email is enabled, handle and domain must be set
        if (emailEnabled) {
          return emailHandle.trim().length > 0 && emailDomain.length > 0;
        }
        return true; // Email is optional
      case 7: // Review
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (canProceed() && currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
      setError(null);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setError(null);
    }
  };

  const handleGoToStep = (step: number) => {
    if (step < currentStep) {
      setCurrentStep(step);
      setError(null);
    }
  };

  // UX-WIZ-002: "Skip to review with defaults" — once the user has
  // picked an agent type and named the agent, the remaining 5 steps
  // (LLM / tools / behavior / prompts / email) all have sensible
  // defaults. This jumps straight to Review so power users can ship a
  // serviceable agent in 30 seconds and tune later from the edit page.
  // Only enabled after step 1 (Basic Info) so we're guaranteed to have
  // both agent_type and a name.
  const skipToReview = () => {
    if (!agentType || !name.trim()) return;
    setCurrentStep(WIZARD_STEPS.length - 1);
    setError(null);
  };
  const canSkip = currentStep >= 1 && currentStep < WIZARD_STEPS.length - 1 && agentType !== null && name.trim().length > 0;

  const handleSubmit = async () => {
    if (!agentType || !name) return;

    setError(null);

    try {
      const newAgent = await createAgent({
        name: name.trim(),
        description: description.trim() || undefined,
        agent_type: agentType,
        mention_handle: mentionHandle.trim() || undefined,
        llm_provider: llmProvider,
        llm_model: llmModel,
        temperature,
        max_tokens: maxTokens,
        tools,
        auto_respond: autoRespond,
        confidence_threshold: confidenceThreshold,
        require_approval_below: requireApprovalBelow,
        max_daily_responses: maxDailyResponses,
        response_delay_minutes: responseDelayMinutes,
        working_hours: workingHours,
        system_prompt: systemPrompt.trim() || undefined,
        custom_instructions: customInstructions.trim() || undefined,
        // Email settings that go with the agent
        auto_reply_enabled: autoReplyEnabled,
        email_signature: emailSignature.trim() || undefined,
      });

      // If email is enabled, enable it for the agent
      if (emailEnabled && emailHandle && emailDomain) {
        try {
          await agentsApi.enableEmail(
            workspaceId,
            newAgent.id,
            emailHandle,
            emailDomain
          );
        } catch (emailErr) {
          console.error("Failed to enable email:", emailErr);
          // Don't fail the whole creation, just log the error
        }
      }

      // Clear the autosaved draft now that creation succeeded.
      // Failed submissions keep the draft so the user can retry without
      // re-typing. Both local + server paths are cleared — failed
      // creates leave both intact.
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(draftKey(workspaceId));
      }
      // Server-side draft is fire-and-forget — a network error
      // here doesn't change the fact that the agent was created.
      void serverDraftHook.clear();

      // Redirect to the new agent's page
      router.push(`/agents/${newAgent.id}`);
    } catch (err) {
      console.error("Failed to create agent:", err);
      setError(getApiErrorMessage(err, "Failed to create agent"));
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      router.push("/settings/agents");
    }
  };

  // Render current step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <AgentTypeStep
            selectedType={agentType}
            onSelect={handleTypeSelect}
          />
        );
      case 1:
        return (
          <BasicInfoStep
            workspaceId={workspaceId}
            name={name}
            description={description}
            mentionHandle={mentionHandle}
            onNameChange={setName}
            onDescriptionChange={setDescription}
            onMentionHandleChange={setMentionHandle}
            // Email quick setup props
            emailEnabled={emailEnabled}
            emailHandle={emailHandle}
            emailDomain={emailDomain}
            onEmailEnabledChange={setEmailEnabled}
            onEmailHandleChange={setEmailHandle}
            onEmailDomainChange={setEmailDomain}
          />
        );
      case 2:
        return (
          <LLMConfigStep
            provider={llmProvider}
            model={llmModel}
            temperature={temperature}
            maxTokens={maxTokens}
            onProviderChange={setLlmProvider}
            onModelChange={setLlmModel}
            onTemperatureChange={setTemperature}
            onMaxTokensChange={setMaxTokens}
          />
        );
      case 3:
        return (
          <ToolSelectionStep
            workspaceId={workspaceId}
            agentType={agentType || "custom"}
            selectedTools={tools}
            onToolsChange={setTools}
          />
        );
      case 4:
        return (
          <BehaviorStep
            autoRespond={autoRespond}
            confidenceThreshold={confidenceThreshold}
            requireApprovalBelow={requireApprovalBelow}
            maxDailyResponses={maxDailyResponses}
            responseDelayMinutes={responseDelayMinutes}
            workingHours={workingHours}
            onAutoRespondChange={setAutoRespond}
            onConfidenceThresholdChange={setConfidenceThreshold}
            onRequireApprovalBelowChange={setRequireApprovalBelow}
            onMaxDailyResponsesChange={setMaxDailyResponses}
            onResponseDelayMinutesChange={setResponseDelayMinutes}
            onWorkingHoursChange={setWorkingHours}
          />
        );
      case 5:
        return (
          <PromptEditorStep
            agentType={agentType || "custom"}
            systemPrompt={systemPrompt}
            customInstructions={customInstructions}
            onSystemPromptChange={setSystemPrompt}
            onCustomInstructionsChange={setCustomInstructions}
          />
        );
      case 6:
        return (
          <EmailConfigStep
            workspaceId={workspaceId}
            agentName={name}
            mentionHandle={mentionHandle}
            emailEnabled={emailEnabled}
            emailHandle={emailHandle}
            emailDomain={emailDomain}
            autoReplyEnabled={autoReplyEnabled}
            emailSignature={emailSignature}
            onEmailEnabledChange={setEmailEnabled}
            onEmailHandleChange={setEmailHandle}
            onEmailDomainChange={setEmailDomain}
            onAutoReplyEnabledChange={setAutoReplyEnabled}
            onEmailSignatureChange={setEmailSignature}
          />
        );
      case 7:
        return (
          <ReviewStep
            config={{
              agentType: agentType || "custom",
              name,
              description,
              mentionHandle,
              llmProvider,
              llmModel,
              temperature,
              maxTokens,
              tools,
              autoRespond,
              confidenceThreshold,
              requireApprovalBelow,
              maxDailyResponses,
              responseDelayMinutes,
              workingHours,
              systemPrompt,
              customInstructions,
              emailEnabled,
              emailHandle,
              emailDomain,
              autoReplyEnabled,
              emailSignature,
            }}
            onEditStep={handleGoToStep}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-muted/50 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-semibold text-foreground">Create New Agent</h1>
            <button
              onClick={handleClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <WizardProgress steps={WIZARD_STEPS} currentStep={currentStep} />
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
            {error}
          </div>
        )}

        <div className="bg-muted rounded-xl border border-border p-6">
          {renderStepContent()}

          {/* UX-WIZ-002: Skip-to-review escape hatch. Renders above the
              standard nav so it doesn't compete with the primary Next /
              Submit buttons. Hidden until we have an agent type + name
              so it can't accidentally create a nameless agent. */}
          {canSkip ? (
            <div className="mt-6 -mb-2 flex items-center justify-end">
              <button
                type="button"
                onClick={skipToReview}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors focus-visible:ring-2 focus-visible:ring-purple-500 rounded"
              >
                Skip to review with sensible defaults →
              </button>
            </div>
          ) : null}

          <WizardNavigation
            currentStep={currentStep}
            totalSteps={WIZARD_STEPS.length}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onSubmit={handleSubmit}
            canProceed={canProceed()}
            isSubmitting={isCreating}
            className="mt-8"
          />
        </div>
      </main>
    </div>
  );
}
