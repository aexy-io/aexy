"use client";

import { getApiErrorMessage } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  Bot,
  Save,
  Settings,
  Cpu,
  Wrench,
  SlidersHorizontal,
  MessageSquare,
  Bell,
  Loader2,
  Check,
  Mail,
  Copy,
  ExternalLink,
  Globe,
  AtSign,
  X,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAgent, useAgentTools } from "@/hooks/useAgents";
import { useAgentEmail, useEmailDomains } from "@/hooks/useAgentInbox";
import { useRouteGuard } from "@/hooks/useRouteGuard";
import { agentsApi, getAgentTypeConfig, AgentType, WorkingHoursConfig } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  AgentTypeBadge,
  ToolSelector,
  LLMProviderSelector,
  ConfidenceSlider,
  WorkingHoursConfigPanel,
  PromptEditor,
  InstructionsEditor,
} from "@/components/agents/shared";

type TabId = "general" | "llm" | "tools" | "behavior" | "prompts" | "escalation" | "email";

interface Tab {
  id: TabId;
  label: string;
  icon: typeof Settings;
}

const TABS: Tab[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "llm", label: "LLM", icon: Cpu },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "behavior", label: "Behavior", icon: SlidersHorizontal },
  { id: "prompts", label: "Prompts", icon: MessageSquare },
  { id: "escalation", label: "Escalation", icon: Bell },
  { id: "email", label: "Email", icon: Mail },
];

export default function EditAgentPage() {
  const params = useParams();
  const agentId = params.agentId as string;
  const { currentWorkspaceId, currentWorkspaceLoading } = useWorkspace();

  const {
    agent,
    isLoading: agentLoading,
    updateAgent,
    isUpdating,
  } = useAgent(currentWorkspaceId, agentId);

  const { tools: availableTools, isLoading: toolsLoading } = useAgentTools(currentWorkspaceId);
  const { enableEmail, disableEmail, isEnabling, isDisabling } = useAgentEmail(currentWorkspaceId, agentId);
  const { domains, defaultDomain } = useEmailDomains(currentWorkspaceId);

  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [hasChanges, setHasChanges] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lifted to component scope so the ConfirmDialog can render at the
  // page root (outside the per-tab render switch) — Disable Email is
  // destructive (severs the agent's email address, orphans any
  // pending inbox messages) and needs a confirm step. UX-EDT-017.
  const [showDisableEmailConfirm, setShowDisableEmailConfirm] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mentionHandle, setMentionHandle] = useState("");
  const [agentType, setAgentType] = useState<AgentType>("custom");
  const [llmProvider, setLlmProvider] = useState<"claude" | "gemini" | "ollama" | "openrouter">("gemini");
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
  const [escalationEmail, setEscalationEmail] = useState("");
  const [escalationSlackChannel, setEscalationSlackChannel] = useState("");
  // Only the setter is consumed — the canonical "is email enabled?" read
  // comes from `agent.email_enabled`, which the polling query refreshes
  // after enable / disable mutations. Keeping the setter so the mutation
  // callbacks can flip the local view optimistically.
  const [, setEmailEnabled] = useState(false);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);
  const [emailSignature, setEmailSignature] = useState("");
  const [emailCopied, setEmailCopied] = useState(false);

  // Email setup form state
  const [showEmailSetup, setShowEmailSetup] = useState(false);
  const [newEmailHandle, setNewEmailHandle] = useState("");
  const [newEmailDomain, setNewEmailDomain] = useState("");

  // Initialize form from agent. UX-EDT-021: skip the sync when the
  // user has unsaved local edits — otherwise an incoming refetch
  // (the global polling, or an invalidate after another mutation)
  // can silently clobber in-flight typing. The initial-load case is
  // identified by `name === ""` (we haven't initialized yet), which
  // always re-syncs regardless of hasChanges so we don't strand the
  // form in its empty default.
  useEffect(() => {
    if (!agent) return;
    const isInitialLoad = name === "";
    if (!isInitialLoad && hasChanges) {
      return;
    }
    setName(agent.name);
    setDescription(agent.description || "");
    setMentionHandle(agent.mention_handle || "");
    setAgentType(agent.agent_type);
    setLlmProvider(agent.llm_provider || "gemini");
    setLlmModel(agent.llm_model || agent.model || "gemini-2.0-flash");
    setTemperature(agent.temperature ?? 0.7);
    setMaxTokens(agent.max_tokens ?? 2000);
    setTools(agent.tools || []);
    setAutoRespond(agent.auto_respond ?? true);
    setConfidenceThreshold(agent.confidence_threshold ?? 0.7);
    setRequireApprovalBelow(agent.require_approval_below ?? 0.8);
    setMaxDailyResponses(agent.max_daily_responses ?? 100);
    setResponseDelayMinutes(agent.response_delay_minutes ?? 5);
    setWorkingHours(agent.working_hours || null);
    setSystemPrompt(agent.system_prompt || "");
    setCustomInstructions(agent.custom_instructions || "");
    setEscalationEmail(agent.escalation_email || "");
    setEscalationSlackChannel(agent.escalation_slack_channel || "");
    setEmailEnabled(agent.email_enabled || false);
    setAutoReplyEnabled(agent.auto_reply_enabled ?? true);
    setEmailSignature(agent.email_signature || "");
    // `hasChanges` and `name` are read inside on purpose: the dirty-guard
    // above must use the freshest values at re-render time, but they
    // MUST NOT trigger this effect — adding them to deps would re-sync
    // the form mid-edit and clobber typing. The `[agent]` trigger is the
    // intended single source of "new data arrived from the server".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent]);

  // Per-tab dirty tracking — each tab independently reports whether any
  // of its fields differ from the persisted agent. The audit flagged the
  // prior single boolean as confidence-killing: users switching tabs lost
  // sight of which sections had pending edits.
  const dirtyByTab = useMemo<Record<TabId, boolean>>(() => {
    if (!agent) {
      return {
        general: false,
        llm: false,
        tools: false,
        behavior: false,
        prompts: false,
        escalation: false,
        email: false,
      };
    }
    // System agents are LLM-only; everything else is locked to its
    // persisted value, so it can't be dirty.
    if (agent.is_system) {
      return {
        general: false,
        llm:
          llmProvider !== (agent.llm_provider || "gemini") ||
          llmModel !==
            (agent.llm_model || agent.model || "gemini-2.0-flash") ||
          temperature !== (agent.temperature ?? 0.7),
        tools: false,
        behavior: false,
        prompts: false,
        escalation: false,
        email: false,
      };
    }
    return {
      general:
        name !== agent.name ||
        description !== (agent.description || "") ||
        mentionHandle !== (agent.mention_handle || ""),
      llm:
        llmProvider !== (agent.llm_provider || "gemini") ||
        llmModel !==
          (agent.llm_model || agent.model || "gemini-2.0-flash") ||
        temperature !== (agent.temperature ?? 0.7) ||
        maxTokens !== (agent.max_tokens ?? 2000),
      tools: JSON.stringify(tools) !== JSON.stringify(agent.tools || []),
      behavior:
        autoRespond !== (agent.auto_respond ?? true) ||
        confidenceThreshold !== (agent.confidence_threshold ?? 0.7) ||
        requireApprovalBelow !== (agent.require_approval_below ?? 0.8) ||
        maxDailyResponses !== (agent.max_daily_responses ?? 100) ||
        responseDelayMinutes !== (agent.response_delay_minutes ?? 5) ||
        JSON.stringify(workingHours) !==
          JSON.stringify(agent.working_hours || null),
      prompts:
        systemPrompt !== (agent.system_prompt || "") ||
        customInstructions !== (agent.custom_instructions || ""),
      escalation:
        escalationEmail !== (agent.escalation_email || "") ||
        escalationSlackChannel !== (agent.escalation_slack_channel || ""),
      email:
        autoReplyEnabled !== (agent.auto_reply_enabled ?? true) ||
        emailSignature !== (agent.email_signature || ""),
    };
  }, [
    agent,
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
    escalationEmail,
    escalationSlackChannel,
    autoReplyEnabled,
    emailSignature,
  ]);

  // hasChanges is now a derived value but kept in state for compatibility
  // with the existing save flow (and so saveSuccess resetting the agent
  // payload re-derives cleanly when the next agent fetch lands).
  useEffect(() => {
    const anyDirty = Object.values(dirtyByTab).some(Boolean);
    setHasChanges(anyDirty);
  }, [dirtyByTab]);

  // UX-EDT-025 + UX-DLG-004: pop a ConfirmDialog when the user clicks
  // a link to navigate away (sidebar, breadcrumb, etc.) while edits
  // are pending. The hook also handles the beforeunload fallback for
  // hard refresh / tab close, so we no longer need a separate effect
  // for that.
  const { pendingHref, confirmPending, cancelPending } = useRouteGuard({
    enabled: hasChanges,
  });

  const dirtyTabCount = useMemo(
    () => Object.values(dirtyByTab).filter(Boolean).length,
    [dirtyByTab],
  );

  // Per-tab validation errors. UX-EDT-016: prior to this, the form
  // passed empty names, malformed emails, and out-of-range numbers
  // straight to the server. Real-time validation surfaces problems
  // inline + on the tab (red dot) so users don't get bounced by a
  // server error after a long save.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const errorsByTab = useMemo<Record<TabId, string[]>>(() => {
    const errors: Record<TabId, string[]> = {
      general: [],
      llm: [],
      tools: [],
      behavior: [],
      prompts: [],
      escalation: [],
      email: [],
    };
    // System agents only edit LLM fields; everything else is locked
    // and can't be in error.
    if (agent?.is_system) {
      if (temperature < 0 || temperature > 2) {
        errors.llm.push("Temperature must be between 0 and 2");
      }
      return errors;
    }
    // General
    if (!name.trim()) errors.general.push("Name is required");
    if (mentionHandle && !/^[a-z0-9-]{2,}$/.test(mentionHandle)) {
      errors.general.push(
        "Mention handle must be at least 2 characters, lowercase letters, numbers or hyphens",
      );
    }
    // LLM
    if (temperature < 0 || temperature > 2) {
      errors.llm.push("Temperature must be between 0 and 2");
    }
    if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 32000) {
      errors.llm.push("Max tokens must be a whole number between 1 and 32000");
    }
    // Behavior
    if (confidenceThreshold < 0 || confidenceThreshold > 1) {
      errors.behavior.push("Confidence threshold must be between 0 and 1");
    }
    if (requireApprovalBelow < 0 || requireApprovalBelow > 1) {
      errors.behavior.push("Approval threshold must be between 0 and 1");
    }
    if (!Number.isInteger(maxDailyResponses) || maxDailyResponses < 1) {
      errors.behavior.push("Daily response cap must be at least 1");
    }
    if (!Number.isInteger(responseDelayMinutes) || responseDelayMinutes < 0) {
      errors.behavior.push("Response delay can't be negative");
    }
    // Escalation
    if (escalationEmail.trim() && !EMAIL_RE.test(escalationEmail.trim())) {
      errors.escalation.push("Escalation email must be a valid email address");
    }
    return errors;
  }, [
    agent?.is_system,
    name,
    mentionHandle,
    temperature,
    maxTokens,
    confidenceThreshold,
    requireApprovalBelow,
    maxDailyResponses,
    responseDelayMinutes,
    escalationEmail,
  ]);

  const hasErrors = useMemo(
    () => Object.values(errorsByTab).some((list) => list.length > 0),
    [errorsByTab],
  );
  const errorTabCount = useMemo(
    () => Object.values(errorsByTab).filter((list) => list.length > 0).length,
    [errorsByTab],
  );

  // UX-EDT-020: the two thresholds invert when require_approval_below >
  // confidence_threshold — there's then an ambiguous gap where the agent
  // both auto-responds AND requires approval. Render an inline warning
  // (not a blocking error) when that's true.
  const thresholdInverted =
    !agent?.is_system && requireApprovalBelow > confidenceThreshold;

  const handleSave = async () => {
    if (!hasChanges) return;
    // Block submission when validation errors exist; surface the first
    // tab with an error so the user lands where they need to look.
    if (hasErrors) {
      const firstBad = (Object.keys(errorsByTab) as TabId[]).find(
        (id) => errorsByTab[id].length > 0,
      );
      if (firstBad) setActiveTab(firstBad);
      setError("Please fix the validation errors before saving.");
      return;
    }

    setError(null);
    setSaveSuccess(false);

    try {
      // System agents can only update LLM configuration fields
      if (agent?.is_system) {
        await updateAgent({
          llm_provider: llmProvider,
          model: llmModel,
          temperature,
        });
      } else {
        await updateAgent({
          name: name.trim(),
          description: description.trim() || undefined,
          mention_handle: mentionHandle.trim() || undefined,
          llm_provider: llmProvider,
          model: llmModel,
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
          escalation_email: escalationEmail.trim() || undefined,
          escalation_slack_channel: escalationSlackChannel.trim() || undefined,
          auto_reply_enabled: autoReplyEnabled,
          email_signature: emailSignature.trim() || undefined,
        });
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error("Failed to save agent:", err);
      setError(getApiErrorMessage(err, "Failed to save changes"));
    }
  };

  const isLoading = currentWorkspaceLoading || agentLoading;

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto animate-pulse">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-8 w-8 bg-accent rounded-lg" />
          <div className="h-6 w-40 bg-accent rounded" />
        </div>
        <div className="flex gap-2 mb-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-9 w-20 bg-accent rounded-lg" />
          ))}
        </div>
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <div className="h-4 w-24 bg-accent rounded mb-2" />
              <div className="h-10 bg-accent rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Bot className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-medium text-foreground mb-2">Agent Not Found</h2>
          <Breadcrumb
            items={[{ label: "Agents", href: "/agents" }]}
            className="justify-center"
          />
        </div>
      </div>
    );
  }

  // System agents can only edit LLM configuration (provider, model, temperature)
  const isSystemAgent = agent?.is_system ?? false;

  const renderTabContent = () => {
    switch (activeTab) {
      case "general":
        return (
          <div className="space-y-6">
            {isSystemAgent && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-700 dark:text-amber-300 text-sm">
                This is a system agent. Only LLM configuration (provider, model, temperature) can be modified.
              </div>
            )}
            <div>
              <label htmlFor="agent-name" className="block text-sm font-medium text-foreground mb-1.5">
                Agent Name
              </label>
              <input
                id="agent-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSystemAgent}
                className={cn(
                  "w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500",
                  isSystemAgent && "opacity-50 cursor-not-allowed"
                )}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Shown on the agent&apos;s profile, in @mentions, and as the
                From-name on outbound email.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Agent Type
              </label>
              <div className="flex sm:flex-row flex-col sm:items-center items-start gap-2">
                <AgentTypeBadge type={agentType} />
                <span className="text-sm text-muted-foreground">
                  (Cannot be changed after creation)
                </span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                The type seeds the agent&apos;s default tool set, prompt
                template, and persona. To switch types, create a new
                agent.
              </p>
            </div>

            <div>
              <label htmlFor="mention-handle" className="block text-sm font-medium text-foreground mb-1.5">
                Mention Handle
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <input
                  id="mention-handle"
                  type="text"
                  value={mentionHandle}
                  // UX-EDT-022: strip invalid chars on input so users can't
                  // create a handle the server is just going to reject.
                  // Matches the same sanitization used by newEmailHandle.
                  onChange={(e) =>
                    setMentionHandle(
                      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                    )
                  }
                  disabled={isSystemAgent}
                  placeholder="my-agent"
                  className={cn(
                    "w-full pl-8 pr-4 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500",
                    isSystemAgent && "opacity-50 cursor-not-allowed"
                  )}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Lowercase letters, numbers, and hyphens. Used to ping the
                agent from chat with @{mentionHandle || "your-handle"}.
              </p>
            </div>

            <div>
              <label htmlFor="agent-description" className="block text-sm font-medium text-foreground mb-1.5">
                Description
              </label>
              <textarea
                id="agent-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSystemAgent}
                rows={3}
                placeholder="What does this agent do?"
                className={cn(
                  "w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 resize-none",
                  isSystemAgent && "opacity-50 cursor-not-allowed"
                )}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                A one-liner shown to teammates browsing your workspace&apos;s
                agents. Not seen by end users.
              </p>
            </div>
          </div>
        );

      case "llm":
        return (
          <div className="space-y-6">
            <LLMProviderSelector
              provider={llmProvider}
              model={llmModel}
              onChange={({ provider, model }) => {
                setLlmProvider(provider);
                setLlmModel(model);
              }}
            />

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="temperature" className="block text-sm font-medium text-foreground">
                  Temperature
                </label>
                <span className="text-sm text-foreground font-medium tabular-nums">
                  {temperature.toFixed(2)}
                </span>
              </div>
              <input
                id="temperature"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full h-2 bg-accent rounded-lg appearance-none cursor-pointer"
              />
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/70 uppercase tracking-wider">
                <span>Deterministic</span>
                <span>Balanced</span>
                <span>Creative</span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                How much variation the model adds. Low values stick to
                predictable wording; high values vary phrasing more —
                useful for outbound emails, riskier for compliance copy.
                Most production agents sit between 0.3 and 0.7.
              </p>
            </div>

            <div>
              <label htmlFor="max-tokens" className="block text-sm font-medium text-foreground mb-1.5">
                Max Tokens
              </label>
              <input
                id="max-tokens"
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 2000)}
                min={100}
                max={32000}
                className="w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Cap on the model&apos;s response length (1 token ≈ 4 characters
                of English). Cuts cost on chatty agents; risks truncating
                long-form replies when set too low. 2000 is a safe
                default for email + support agents.
              </p>
            </div>
          </div>
        );

      case "tools":
        return (
          <div>
            {isSystemAgent && (
              <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-700 dark:text-amber-300 text-sm">
                This is a system agent. Tools cannot be modified.
              </div>
            )}
            {toolsLoading ? (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 text-purple-700 dark:text-purple-300 animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Loading tools...</p>
              </div>
            ) : (
              // UX-EDT-023: pass `disabled` down so the underlying
              // inputs are keyboard-unfocusable for system agents, not
              // just visually muted. `opacity-50 pointer-events-none`
              // would let a keyboard user tab into the inputs.
              <ToolSelector
                tools={availableTools}
                selectedTools={tools}
                onChange={setTools}
                disabled={isSystemAgent}
              />
            )}
          </div>
        );

      case "behavior":
        return (
          <div className="space-y-8">
            {isSystemAgent && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-700 dark:text-amber-300 text-sm">
                This is a system agent. Behavior settings cannot be modified.
              </div>
            )}
            <label className={cn("flex items-start gap-4", isSystemAgent ? "opacity-50 cursor-not-allowed" : "cursor-pointer")}>
              <input
                type="checkbox"
                checked={autoRespond}
                onChange={(e) => setAutoRespond(e.target.checked)}
                disabled={isSystemAgent}
                className="w-5 h-5 mt-0.5 rounded border-border bg-accent text-purple-500 focus-visible:ring-purple-500"
              />
              <div>
                <div className="font-medium text-foreground">Enable Auto-Response</div>
                <p className="text-sm text-muted-foreground mt-1">
                  Automatically respond to messages above the confidence threshold
                </p>
              </div>
            </label>

            <div className="space-y-6">
              <ConfidenceSlider
                value={confidenceThreshold}
                onChange={setConfidenceThreshold}
                label="Minimum Confidence to Respond"
                disabled={isSystemAgent}
              />

              <ConfidenceSlider
                value={requireApprovalBelow}
                onChange={setRequireApprovalBelow}
                label="Require Approval Below"
                disabled={isSystemAgent}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="max-daily-responses" className="block text-sm font-medium text-foreground mb-1.5">
                  Max Daily Responses
                </label>
                <input
                  id="max-daily-responses"
                  type="number"
                  value={maxDailyResponses}
                  onChange={(e) => setMaxDailyResponses(parseInt(e.target.value) || 100)}
                  disabled={isSystemAgent}
                  min={1}
                  className={cn(
                    "w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500",
                    isSystemAgent && "opacity-50 cursor-not-allowed"
                  )}
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Hard cap. Messages beyond the cap are queued and the
                  agent picks them up the next day.
                </p>
              </div>
              <div>
                <label htmlFor="response-delay" className="block text-sm font-medium text-foreground mb-1.5">
                  Response Delay (minutes)
                </label>
                <input
                  id="response-delay"
                  type="number"
                  value={responseDelayMinutes}
                  onChange={(e) => setResponseDelayMinutes(parseInt(e.target.value) || 0)}
                  disabled={isSystemAgent}
                  min={0}
                  className={cn(
                    "w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500",
                    isSystemAgent && "opacity-50 cursor-not-allowed"
                  )}
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Adds a delay before the agent replies so it doesn&apos;t
                  look robotic. 0 = reply instantly.
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">Working Hours</h3>
              <WorkingHoursConfigPanel
                value={workingHours}
                onChange={setWorkingHours}
                disabled={isSystemAgent}
              />
            </div>
          </div>
        );

      case "prompts":
        return (
          <div className="space-y-6">
            {isSystemAgent && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-700 dark:text-amber-300 text-sm">
                This is a system agent. Prompts cannot be modified.
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              The system prompt anchors the agent&apos;s tone and behavior on
              every run. Custom instructions are layered on top for run-
              specific guidance — use them for policy (&quot;never quote a
              price&quot;), style (&quot;be terse&quot;), or escalation logic the
              behavior thresholds can&apos;t express.
            </p>
            <div>
              <PromptEditor
                value={systemPrompt}
                onChange={setSystemPrompt}
                label="System Prompt"
                rows={12}
                disabled={isSystemAgent}
              />
            </div>

            <div>
              <InstructionsEditor
                value={customInstructions}
                onChange={setCustomInstructions}
                rows={4}
                disabled={isSystemAgent}
              />
            </div>

            {/* UX-EDT-018: Test-this. Lets the user sanity-check the
                prompt + model against a sample input WITHOUT saving
                first and WITHOUT running tools (no side effects).
                Uses the most recent saved prompt — unsaved edits stay
                local until the user clicks Save. */}
            {currentWorkspaceId && agentId ? (
              <PromptPreviewPanel
                workspaceId={currentWorkspaceId}
                agentId={agentId}
              />
            ) : null}
          </div>
        );

      case "escalation":
        return (
          <div className="space-y-6">
            {isSystemAgent && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-700 dark:text-amber-300 text-sm">
                This is a system agent. Escalation settings cannot be modified.
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              The agent escalates when it falls below the approval
              threshold on the Behavior tab, hits a manual &quot;Escalate&quot;
              from the inbox, or encounters a tool failure it can&apos;t
              recover from. The routes below are the destinations for
              those events — either is fine on its own, both is fine
              for higher-criticality agents.
            </p>
            <div>
              <label htmlFor="escalation-email" className="block text-sm font-medium text-foreground mb-2">
                Escalation Email
              </label>
              <input
                id="escalation-email"
                type="email"
                value={escalationEmail}
                onChange={(e) => setEscalationEmail(e.target.value)}
                disabled={isSystemAgent}
                placeholder="support@example.com"
                className={cn(
                  "w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500",
                  isSystemAgent && "opacity-50 cursor-not-allowed"
                )}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Inbox + thread context land here as a regular email.
                Leave blank to disable email escalation.
              </p>
            </div>

            <div>
              <label htmlFor="escalation-slack" className="block text-sm font-medium text-foreground mb-2">
                Slack Channel
              </label>
              <input
                id="escalation-slack"
                type="text"
                value={escalationSlackChannel}
                onChange={(e) => setEscalationSlackChannel(e.target.value)}
                disabled={isSystemAgent}
                placeholder="#support-escalations"
                className={cn(
                  "w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500",
                  isSystemAgent && "opacity-50 cursor-not-allowed"
                )}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Posts a summary card with a deep-link back to the
                original inbox message. Requires the workspace Slack
                integration; leave blank to skip.
              </p>
            </div>
          </div>
        );

      case "email":
        const handleEnableEmail = async () => {
          if (!newEmailHandle || !newEmailDomain) {
            setError("Please enter an email handle and select a domain");
            return;
          }
          try {
            await enableEmail({
              preferredHandle: newEmailHandle,
              domain: newEmailDomain,
            });
            setEmailEnabled(true);
            setShowEmailSetup(false);
            setNewEmailHandle("");
            setNewEmailDomain("");
          } catch (err) {
            console.error("Failed to enable email:", err);
            setError(getApiErrorMessage(err, "Failed to enable email"));
          }
        };

        // handleDisableEmail removed — the destructive action now lives in
        // the page-level ConfirmDialog (UX-EDT-017) whose onConfirm holds
        // the disableEmail() call directly.

        const copyEmailAddress = async () => {
          if (agent?.email_address) {
            await navigator.clipboard.writeText(agent.email_address);
            setEmailCopied(true);
            setTimeout(() => setEmailCopied(false), 2000);
          }
        };

        const openEmailSetup = () => {
          // Pre-fill with mention handle or agent name
          const suggestedHandle = mentionHandle || name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
          setNewEmailHandle(suggestedHandle);
          setNewEmailDomain(defaultDomain);
          setShowEmailSetup(true);
        };

        return (
          <div className="space-y-6">
            {isSystemAgent && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-700 dark:text-amber-300 text-sm">
                This is a system agent. Email settings cannot be modified.
              </div>
            )}
            {/* Email Setup Modal */}
            {showEmailSetup && !agent?.email_enabled && !isSystemAgent && (
              <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <h3 className="font-medium text-foreground flex items-center gap-2">
                    <AtSign className="h-4 w-4 text-purple-700 dark:text-purple-300" />
                    Configure Email Address
                  </h3>
                  <button
                    onClick={() => setShowEmailSetup(false)}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {/* Email Handle */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Email Handle
                    </label>
                    <input
                      type="text"
                      value={newEmailHandle}
                      onChange={(e) => setNewEmailHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      placeholder="support"
                      className="w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Letters, numbers, and hyphens only
                    </p>
                  </div>

                  {/* Domain Selector */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Domain
                    </label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <select
                        value={newEmailDomain}
                        onChange={(e) => setNewEmailDomain(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 appearance-none"
                      >
                        {domains.map((d) => (
                          <option key={d.domain} value={d.domain}>
                            {d.domain} {d.is_default && "(Default)"}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Preview */}
                {newEmailHandle && newEmailDomain && (
                  <div className="p-3 bg-muted rounded-lg border border-border mb-4">
                    <span className="text-sm text-muted-foreground">Email address: </span>
                    <code className="text-blue-400 font-mono">{newEmailHandle}@{newEmailDomain}</code>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    // UX-EDT-027: Cancel clears the draft handle +
                    // domain so reopening the panel starts from the
                    // user's persisted state, not whatever they typed
                    // and abandoned. The prior implementation left the
                    // draft latent which read as a UI bug.
                    onClick={() => {
                      setShowEmailSetup(false);
                      setNewEmailHandle("");
                      setNewEmailDomain("");
                    }}
                    className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEnableEmail}
                    disabled={isEnabling || !newEmailHandle || !newEmailDomain}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                  >
                    {isEnabling ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Enable Email"
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Email Status */}
            <div className="p-4 bg-accent/50 rounded-lg border border-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2 rounded-lg",
                    agent?.email_enabled ? "bg-green-500/20" : "bg-muted"
                  )}>
                    <Mail className={cn(
                      "h-5 w-5",
                      agent?.email_enabled ? "text-green-400" : "text-muted-foreground"
                    )} />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">
                      {agent?.email_enabled ? "Email Enabled" : "Email Disabled"}
                    </h3>
                    {agent?.email_address ? (
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-sm text-blue-700 dark:text-blue-400 bg-muted px-2 py-0.5 rounded">
                          {agent.email_address}
                        </code>
                        <button
                          onClick={copyEmailAddress}
                          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                          title="Copy email address"
                        >
                          {emailCopied ? (
                            <Check className="h-4 w-4 text-green-700 dark:text-green-400" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Enable email to get an address for this agent
                      </p>
                    )}
                  </div>
                </div>
                {!isSystemAgent && (
                  agent?.email_enabled ? (
                    <button
                      onClick={() => setShowDisableEmailConfirm(true)}
                      disabled={isDisabling}
                      className="px-4 py-2 bg-red-500/20 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50"
                    >
                      {isDisabling ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Disable"
                      )}
                    </button>
                  ) : !showEmailSetup ? (
                    <button
                      onClick={openEmailSetup}
                      className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                    >
                      Enable Email
                    </button>
                  ) : null
                )}
              </div>
            </div>

            {agent?.email_enabled && (
              <>
                {/* Auto Reply */}
                <label className={cn("flex items-start gap-4", isSystemAgent ? "opacity-50 cursor-not-allowed" : "cursor-pointer")}>
                  <input
                    type="checkbox"
                    checked={autoReplyEnabled}
                    onChange={(e) => setAutoReplyEnabled(e.target.checked)}
                    disabled={isSystemAgent}
                    className="w-5 h-5 mt-0.5 rounded border-border bg-accent text-purple-500 focus-visible:ring-purple-500"
                  />
                  <div>
                    <div className="font-medium text-foreground">Enable Auto-Reply</div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Automatically respond to emails when AI confidence is above threshold ({Math.round(confidenceThreshold * 100)}%)
                    </p>
                  </div>
                </label>

                {/* Email Signature */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Email Signature
                  </label>
                  <textarea
                    value={emailSignature}
                    onChange={(e) => setEmailSignature(e.target.value)}
                    disabled={isSystemAgent}
                    rows={4}
                    placeholder="Best regards,&#10;{agent_name}"
                    className={cn(
                      "w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 resize-none",
                      isSystemAgent && "opacity-50 cursor-not-allowed"
                    )}
                  />
                  <p className="mt-1 text-sm text-muted-foreground">
                    Signature appended to all outgoing emails from this agent
                  </p>
                </div>

                {/* Inbox Link */}
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-medium text-blue-300">Agent Inbox</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        View and manage emails received by this agent
                      </p>
                    </div>
                    <Link
                      href={`/agents/${agentId}/inbox`}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      <Mail className="h-4 w-4" />
                      View Inbox
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-muted/50 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 sm:py-4">
          <Breadcrumb
            items={[
              { label: "Agents", href: "/agents" },
              { label: agent.name, href: `/agents/${agentId}` },
              { label: "Edit" },
            ]}
            className="mb-3"
          />
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <div
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: `${getAgentTypeConfig(agentType).color}20`,
                }}
              >
                <Bot
                  className="h-4 w-4 sm:h-5 sm:w-5"
                  style={{
                    color: getAgentTypeConfig(agentType).color,
                  }}
                />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-semibold text-foreground truncate">Edit {agent.name}</h1>
                <p className="text-muted-foreground text-sm hidden sm:block">
                  Configure your agent settings
                </p>
              </div>
            </div>
            {/* Validation-errors hint takes priority over the dirty-tabs
                hint when both apply — fixing errors is the user's next
                action, not knowing where their edits are scattered. */}
            {errorTabCount > 0 && !isUpdating && !saveSuccess ? (
              <span
                className="hidden sm:inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 mr-1"
                role="status"
                aria-live="polite"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                {errorTabCount === 1
                  ? "1 tab has errors"
                  : `${errorTabCount} tabs have errors`}
              </span>
            ) : dirtyTabCount > 0 && !isUpdating && !saveSuccess ? (
              <span
                className="hidden sm:inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 mr-1"
                role="status"
                aria-live="polite"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {dirtyTabCount === 1
                  ? "1 tab has unsaved changes"
                  : `${dirtyTabCount} tabs have unsaved changes`}
              </span>
            ) : null}
            <button
              onClick={handleSave}
              disabled={!hasChanges || isUpdating || hasErrors}
              // UX-EDT-026: aria-label always carries the resolved
              // state so SR users + mobile (icon-only) users don't see
              // an ambiguous Save vs Saving vs Saved.
              aria-label={
                isUpdating ? "Saving changes" : saveSuccess ? "Changes saved" : "Save changes"
              }
              title={isUpdating ? "Saving..." : saveSuccess ? "Saved!" : "Save changes"}
              className={cn(
                "flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition text-sm font-medium flex-shrink-0",
                hasChanges && !hasErrors
                  ? "bg-purple-600 hover:bg-purple-700 text-white"
                  : "bg-accent text-muted-foreground cursor-not-allowed"
              )}
            >
              {isUpdating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  <span className="hidden sm:inline">Saving...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <Check className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">Saved!</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">Save Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="flex gap-6 flex-col sm:flex-row">
          {/* Tabs sidebar */}
          <nav className="w-full sm:w-48 flex-shrink-0" aria-label="Edit sections">
            {/* UX-MOB-003: keep the horizontal scroller on mobile but
                strengthen the active-tab affordance so it doesn't get
                lost next to the dirty/error dot, AND scroll the active
                tab into view on mount + activeTab change so a tab the
                user just jumped to via the validation banner isn't
                stranded off-screen on a phone. The active state on
                mobile gets a 2px purple bottom border that survives the
                scroll; on desktop it stays the rounded fill it always
                was. */}
              <div className="bg-muted rounded-xl border border-border p-2 sticky top-24 flex sm:block overflow-x-auto gap-1 sm:gap-0 scroll-smooth">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                const isDirty = dirtyByTab[tab.id];
                const hasError = errorsByTab[tab.id].length > 0;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    aria-current={isActive ? "page" : undefined}
                    ref={(el) => {
                      if (isActive && el && typeof window !== "undefined" && window.innerWidth < 640) {
                        el.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
                      }
                    }}
                    className={cn(
                      "flex items-center gap-2 sm:gap-3 px-3 py-2 rounded-lg sm:rounded-lg text-left transition whitespace-nowrap sm:w-full relative",
                      // Active state — stronger fill on desktop, fill+
                      // bottom underline on mobile so it survives the
                      // horizontal scroll-truncation.
                      isActive
                        ? "bg-purple-500/20 text-purple-700 dark:text-purple-300 shadow-[inset_0_-2px_0_0_rgb(168,85,247)] sm:shadow-none"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" aria-hidden />
                    <span className="text-sm font-medium flex-1">{tab.label}</span>
                    {/* Status dot: red when there are validation errors,
                        amber when only dirty. Errors take priority since
                        they block the save the user is about to attempt. */}
                    {hasError ? (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0"
                        aria-label="validation errors"
                        title={errorsByTab[tab.id].join("; ")}
                      />
                    ) : isDirty ? (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"
                        aria-label="unsaved changes"
                        title="Unsaved changes in this tab"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Tab content */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Validation banner for the active tab — lists every error
                inline. Rendered above the tab card so users see what to
                fix without scrolling for the offending field. */}
            {errorsByTab[activeTab].length > 0 ? (
              <div
                role="alert"
                className="rounded-xl border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-300"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium mb-1">
                      Fix these before saving
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {errorsByTab[activeTab].map((msg) => (
                        <li key={msg}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : null}
            {/* Threshold inversion is a footgun, not a blocker — surfaced
                as a warning on the Behavior tab where it lives. */}
            {activeTab === "behavior" && thresholdInverted ? (
              <div
                role="status"
                className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-300"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium mb-0.5">
                      Approval threshold sits above confidence threshold
                    </div>
                    <p className="text-amber-600/90 dark:text-amber-300/90">
                      The agent will auto-respond at{" "}
                      {Math.round(confidenceThreshold * 100)}% confidence
                      yet still require approval up to{" "}
                      {Math.round(requireApprovalBelow * 100)}%. Drafts in
                      that overlap will land in the inbox awaiting review
                      instead of going out automatically. If that&apos;s
                      intentional, ignore — otherwise lower the approval
                      threshold to be at or below confidence.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="bg-muted rounded-xl border border-border p-6">
              {renderTabContent()}
            </div>
          </div>
        </div>
      </main>

      <ConfirmDialog
        open={showDisableEmailConfirm}
        onOpenChange={setShowDisableEmailConfirm}
        title="Disable email for this agent?"
        description={
          agent?.email_address ? (
            <>
              The address{" "}
              <span className="font-mono text-foreground">
                {agent.email_address}
              </span>{" "}
              will be released. Any pending replies in the inbox stay archived
              but the agent will no longer receive new messages. You can
              re-enable email later, but the address may already be claimed
              by another agent.
            </>
          ) : (
            "The agent will stop receiving and replying to email. You can re-enable later."
          )
        }
        confirmLabel="Disable email"
        tone="danger"
        isPending={isDisabling}
        onConfirm={async () => {
          try {
            await disableEmail();
            setEmailEnabled(false);
          } catch (err) {
            console.error("Failed to disable email:", err);
            setError(getApiErrorMessage(err, "Failed to disable email"));
          }
        }}
      />

      {/* UX-EDT-025: Unsaved-changes guard. useRouteGuard captures
          anchor-click navigations away from this page when hasChanges
          is true; this dialog renders the user's choice. confirmPending
          performs the navigation; cancelPending dismisses. */}
      <ConfirmDialog
        open={pendingHref !== null}
        onOpenChange={(open) => {
          if (!open) cancelPending();
        }}
        title="Leave with unsaved changes?"
        description="You have edits in this form that haven't been saved. Leaving will discard them."
        confirmLabel="Discard and leave"
        cancelLabel="Stay on this page"
        tone="warning"
        onConfirm={confirmPending}
      />
    </div>
  );
}

// ===========================================================================
// PromptPreviewPanel — inline "Test this" affordance for the Prompts tab.
// UX-EDT-018. Runs the agent's saved prompt + LLM config against a sample
// input via /agents/{id}/test/prompt, which deliberately doesn't run tools
// (no side effects) and doesn't persist an execution row.
//
// Uses the SAVED prompt rather than the in-progress edit — the user has to
// click Save first to test their changes. Could be relaxed later by POSTing
// the in-progress prompt as a body field, but that means duplicating prompt
// state on the server.
// ===========================================================================
function PromptPreviewPanel({
  workspaceId,
  agentId,
}: {
  workspaceId: string;
  agentId: string;
}) {
  const [input, setInput] = useState("");
  const [response, setResponse] = useState<{
    content: string;
    duration_ms: number;
    input_tokens: number | null;
    output_tokens: number | null;
    cost_usd: number | null;
  } | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    const trimmed = input.trim();
    if (!trimmed || isRunning) return;
    setIsRunning(true);
    setError(null);
    setResponse(null);
    try {
      const result = await agentsApi.previewAgentPrompt(workspaceId, agentId, {
        input: trimmed,
      });
      setResponse(result);
    } catch (err) {
      // The preview endpoint surfaces both 400 (bad input) and 500
      // (LLM misconfig / provider error). Either way the user needs
      // the message so they can fix config + retry.
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        (getApiErrorMessage(err, "Preview failed"));
      setError(detail);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">Test this prompt</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          read-only · no tools
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Runs the saved prompt + LLM config against a sample input. Tool
        execution is disabled so previewing can&apos;t send email, mutate CRM
        records, or trigger side effects. Save your edits first if you
        want to test them.
      </p>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="e.g. Hi, I'm interested in the enterprise plan, can you share pricing?"
        rows={3}
        aria-label="Sample input"
        disabled={isRunning}
        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50 disabled:opacity-50"
      />
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleTest}
          disabled={!input.trim() || isRunning}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-purple-500"
        >
          {isRunning ? "Running…" : "Run preview"}
        </button>
        {response ? (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {response.duration_ms}ms
            {response.output_tokens != null ? ` · ${response.output_tokens}t` : ""}
            {response.cost_usd != null ? ` · $${response.cost_usd.toFixed(4)}` : ""}
          </span>
        ) : null}
      </div>
      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}
      {response ? (
        <div className="rounded-lg border border-border bg-background p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Response
          </div>
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {response.content || <span className="italic text-muted-foreground">(empty)</span>}
          </p>
        </div>
      ) : null}
    </div>
  );
}
