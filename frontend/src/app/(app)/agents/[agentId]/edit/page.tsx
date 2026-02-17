"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
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
import { getAgentTypeConfig, AgentType, WorkingHoursConfig } from "@/lib/api";
import { cn } from "@/lib/utils";
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
  const router = useRouter();
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

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mentionHandle, setMentionHandle] = useState("");
  const [agentType, setAgentType] = useState<AgentType>("custom");
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
  const [escalationEmail, setEscalationEmail] = useState("");
  const [escalationSlackChannel, setEscalationSlackChannel] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);
  const [emailSignature, setEmailSignature] = useState("");
  const [emailCopied, setEmailCopied] = useState(false);

  // Email setup form state
  const [showEmailSetup, setShowEmailSetup] = useState(false);
  const [newEmailHandle, setNewEmailHandle] = useState("");
  const [newEmailDomain, setNewEmailDomain] = useState("");

  // Initialize form from agent
  useEffect(() => {
    if (agent) {
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
    }
  }, [agent]);

  // Track changes
  useEffect(() => {
    if (!agent) return;

    // System agents can only change LLM configuration
    if (agent.is_system) {
      const changed =
        llmProvider !== (agent.llm_provider || "gemini") ||
        llmModel !== (agent.llm_model || agent.model || "gemini-2.0-flash") ||
        temperature !== (agent.temperature ?? 0.7);

      setHasChanges(changed);
      return;
    }

    const changed =
      name !== agent.name ||
      description !== (agent.description || "") ||
      mentionHandle !== (agent.mention_handle || "") ||
      llmProvider !== (agent.llm_provider || "gemini") ||
      llmModel !== (agent.llm_model || agent.model || "gemini-2.0-flash") ||
      temperature !== (agent.temperature ?? 0.7) ||
      maxTokens !== (agent.max_tokens ?? 2000) ||
      JSON.stringify(tools) !== JSON.stringify(agent.tools || []) ||
      autoRespond !== (agent.auto_respond ?? true) ||
      confidenceThreshold !== (agent.confidence_threshold ?? 0.7) ||
      requireApprovalBelow !== (agent.require_approval_below ?? 0.8) ||
      maxDailyResponses !== (agent.max_daily_responses ?? 100) ||
      responseDelayMinutes !== (agent.response_delay_minutes ?? 5) ||
      JSON.stringify(workingHours) !== JSON.stringify(agent.working_hours || null) ||
      systemPrompt !== (agent.system_prompt || "") ||
      customInstructions !== (agent.custom_instructions || "") ||
      escalationEmail !== (agent.escalation_email || "") ||
      escalationSlackChannel !== (agent.escalation_slack_channel || "") ||
      autoReplyEnabled !== (agent.auto_reply_enabled ?? true) ||
      emailSignature !== (agent.email_signature || "");

    setHasChanges(changed);
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

  const handleSave = async () => {
    if (!hasChanges) return;

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
      setError(err instanceof Error ? err.message : "Failed to save changes");
    }
  };

  const isLoading = currentWorkspaceLoading || agentLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-foreground">Loading agent...</p>
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
          <Link
            href="/agents"
            className="text-purple-400 hover:text-purple-300"
          >
            Back to Agents
          </Link>
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
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-sm">
                This is a system agent. Only LLM configuration (provider, model, temperature) can be modified.
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Agent Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSystemAgent}
                className={cn(
                  "w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500",
                  isSystemAgent && "opacity-50 cursor-not-allowed"
                )}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Agent Type
              </label>
              <div className="flex sm:flex-row flex-col sm:items-center items-start gap-2">
                <AgentTypeBadge type={agentType} />
                <span className="text-sm text-muted-foreground">
                  (Cannot be changed after creation)
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Mention Handle
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <input
                  type="text"
                  value={mentionHandle}
                  onChange={(e) => setMentionHandle(e.target.value.toLowerCase())}
                  disabled={isSystemAgent}
                  className={cn(
                    "w-full pl-8 pr-4 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500",
                    isSystemAgent && "opacity-50 cursor-not-allowed"
                  )}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSystemAgent}
                rows={3}
                className={cn(
                  "w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none",
                  isSystemAgent && "opacity-50 cursor-not-allowed"
                )}
              />
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
              <label className="block text-sm font-medium text-foreground mb-2">
                Temperature
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="flex-1 h-2 bg-accent rounded-lg appearance-none cursor-pointer"
                />
                <span className="w-12 text-right text-foreground font-medium">
                  {temperature.toFixed(1)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Max Tokens
              </label>
              <input
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 2000)}
                min={100}
                max={32000}
                className="w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>
        );

      case "tools":
        return (
          <div>
            {isSystemAgent && (
              <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-sm">
                This is a system agent. Tools cannot be modified.
              </div>
            )}
            {toolsLoading ? (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 text-purple-400 animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Loading tools...</p>
              </div>
            ) : (
              <div className={isSystemAgent ? "opacity-50 pointer-events-none" : ""}>
                <ToolSelector
                  tools={availableTools}
                  selectedTools={tools}
                  onChange={setTools}
                />
              </div>
            )}
          </div>
        );

      case "behavior":
        return (
          <div className="space-y-8">
            {isSystemAgent && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-sm">
                This is a system agent. Behavior settings cannot be modified.
              </div>
            )}
            <label className={cn("flex items-start gap-4", isSystemAgent ? "opacity-50 cursor-not-allowed" : "cursor-pointer")}>
              <input
                type="checkbox"
                checked={autoRespond}
                onChange={(e) => setAutoRespond(e.target.checked)}
                disabled={isSystemAgent}
                className="w-5 h-5 mt-0.5 rounded border-border bg-accent text-purple-500 focus:ring-purple-500"
              />
              <div>
                <div className="font-medium text-foreground">Enable Auto-Response</div>
                <p className="text-sm text-muted-foreground mt-1">
                  Automatically respond to messages above the confidence threshold
                </p>
              </div>
            </label>

            <div className={cn("space-y-6", isSystemAgent && "opacity-50 pointer-events-none")}>
              <ConfidenceSlider
                value={confidenceThreshold}
                onChange={setConfidenceThreshold}
                label="Minimum Confidence to Respond"
              />

              <ConfidenceSlider
                value={requireApprovalBelow}
                onChange={setRequireApprovalBelow}
                label="Require Approval Below"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Max Daily Responses
                </label>
                <input
                  type="number"
                  value={maxDailyResponses}
                  onChange={(e) => setMaxDailyResponses(parseInt(e.target.value) || 100)}
                  disabled={isSystemAgent}
                  min={1}
                  className={cn(
                    "w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500",
                    isSystemAgent && "opacity-50 cursor-not-allowed"
                  )}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Response Delay (minutes)
                </label>
                <input
                  type="number"
                  value={responseDelayMinutes}
                  onChange={(e) => setResponseDelayMinutes(parseInt(e.target.value) || 0)}
                  disabled={isSystemAgent}
                  min={0}
                  className={cn(
                    "w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500",
                    isSystemAgent && "opacity-50 cursor-not-allowed"
                  )}
                />
              </div>
            </div>

            <div className={isSystemAgent ? "opacity-50 pointer-events-none" : ""}>
              <h3 className="text-lg font-medium text-foreground mb-4">Working Hours</h3>
              <WorkingHoursConfigPanel
                value={workingHours}
                onChange={setWorkingHours}
              />
            </div>
          </div>
        );

      case "prompts":
        return (
          <div className="space-y-6">
            {isSystemAgent && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-sm">
                This is a system agent. Prompts cannot be modified.
              </div>
            )}
            <div className={isSystemAgent ? "opacity-50 pointer-events-none" : ""}>
              <PromptEditor
                value={systemPrompt}
                onChange={setSystemPrompt}
                label="System Prompt"
                rows={12}
              />
            </div>

            <div className={isSystemAgent ? "opacity-50 pointer-events-none" : ""}>
              <InstructionsEditor
                value={customInstructions}
                onChange={setCustomInstructions}
                rows={4}
              />
            </div>
          </div>
        );

      case "escalation":
        return (
          <div className="space-y-6">
            {isSystemAgent && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-sm">
                This is a system agent. Escalation settings cannot be modified.
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Escalation Email
              </label>
              <input
                type="email"
                value={escalationEmail}
                onChange={(e) => setEscalationEmail(e.target.value)}
                disabled={isSystemAgent}
                placeholder="support@example.com"
                className={cn(
                  "w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500",
                  isSystemAgent && "opacity-50 cursor-not-allowed"
                )}
              />
              <p className="mt-1 text-sm text-muted-foreground">
                Email address to notify when agent escalates an issue
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Slack Channel
              </label>
              <input
                type="text"
                value={escalationSlackChannel}
                onChange={(e) => setEscalationSlackChannel(e.target.value)}
                disabled={isSystemAgent}
                placeholder="#support-escalations"
                className={cn(
                  "w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500",
                  isSystemAgent && "opacity-50 cursor-not-allowed"
                )}
              />
              <p className="mt-1 text-sm text-muted-foreground">
                Slack channel to post escalation notifications
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
            setError(err instanceof Error ? err.message : "Failed to enable email");
          }
        };

        const handleDisableEmail = async () => {
          try {
            await disableEmail();
            setEmailEnabled(false);
          } catch (err) {
            console.error("Failed to disable email:", err);
            setError(err instanceof Error ? err.message : "Failed to disable email");
          }
        };

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
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-sm">
                This is a system agent. Email settings cannot be modified.
              </div>
            )}
            {/* Email Setup Modal */}
            {showEmailSetup && !agent?.email_enabled && !isSystemAgent && (
              <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <h3 className="font-medium text-foreground flex items-center gap-2">
                    <AtSign className="h-4 w-4 text-purple-400" />
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
                      className="w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                        className="w-full pl-10 pr-4 py-2 bg-accent border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none"
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
                    onClick={() => setShowEmailSetup(false)}
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
                        <code className="text-sm text-blue-400 bg-muted px-2 py-0.5 rounded">
                          {agent.email_address}
                        </code>
                        <button
                          onClick={copyEmailAddress}
                          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                          title="Copy email address"
                        >
                          {emailCopied ? (
                            <Check className="h-4 w-4 text-green-400" />
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
                      onClick={handleDisableEmail}
                      disabled={isDisabling}
                      className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50"
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
                    className="w-5 h-5 mt-0.5 rounded border-border bg-accent text-purple-500 focus:ring-purple-500"
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
                      "w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none",
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
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href={`/agents/${agentId}`}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition flex-shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
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
            <button
              onClick={handleSave}
              disabled={!hasChanges || isUpdating}
              className={cn(
                "flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition text-sm font-medium flex-shrink-0",
                hasChanges
                  ? "bg-purple-600 hover:bg-purple-700 text-white"
                  : "bg-accent text-muted-foreground cursor-not-allowed"
              )}
            >
              {isUpdating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">Saving...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <Check className="h-4 w-4" />
                  <span className="hidden sm:inline">Saved!</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span className="hidden sm:inline">Save Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
            {error}
          </div>
        )}

        <div className="flex gap-6 flex-col sm:flex-row">
          {/* Tabs sidebar */}
          <nav className="w-full sm:w-48 flex-shrink-0">
            <div className="bg-muted rounded-xl border border-border p-2 sticky top-24 flex sm:block overflow-x-auto gap-1 sm:gap-0">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex items-center gap-2 sm:gap-3 px-3 py-2 rounded-lg text-left transition whitespace-nowrap sm:w-full",
                      isActive
                        ? "bg-purple-500/20 text-purple-400"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="text-sm font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Tab content */}
          <div className="flex-1 min-w-0">
            <div className="bg-muted rounded-xl border border-border p-6">
              {renderTabContent()}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
