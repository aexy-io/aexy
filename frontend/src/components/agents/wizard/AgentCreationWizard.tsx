"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
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
import { AgentType, StandardAgentType, WorkingHoursConfig, AGENT_TYPE_CONFIG, agentsApi } from "@/lib/api";

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
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [agentType, setAgentType] = useState<AgentType | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mentionHandle, setMentionHandle] = useState("");
  const [llmProvider, setLlmProvider] = useState<"claude" | "gemini" | "ollama">("gemini");
  const [llmModel, setLlmModel] = useState("gemini-2.0-flash");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2000);
  const [tools, setTools] = useState<string[]>([]);
  const [autoRespond, setAutoRespond] = useState(true);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.7);
  const [requireApprovalBelow, setRequireApprovalBelow] = useState(0.8);
  const [maxDailyResponses, setMaxDailyResponses] = useState(100);
  const [responseDelayMinutes, setResponseDelayMinutes] = useState(5);
  const [workingHours, setWorkingHours] = useState<WorkingHoursConfig | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");

  // Email configuration state
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailHandle, setEmailHandle] = useState("");
  const [emailDomain, setEmailDomain] = useState("");
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);
  const [emailSignature, setEmailSignature] = useState("");

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

      // Redirect to the new agent's page
      router.push(`/agents/${newAgent.id}`);
    } catch (err) {
      console.error("Failed to create agent:", err);
      setError(err instanceof Error ? err.message : "Failed to create agent");
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
