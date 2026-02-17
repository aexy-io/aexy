"use client";

import { Check, AlertTriangle, Edit } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AgentTypeBadge,
  ToolBadges,
  LLMConfigDisplay,
  WorkingHoursDisplay,
} from "@/components/agents/shared";
import { AgentType, WorkingHoursConfig } from "@/lib/api";

interface AgentConfig {
  agentType: AgentType;
  name: string;
  description: string;
  mentionHandle: string;
  llmProvider: "claude" | "gemini" | "ollama";
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
  // Email configuration
  emailEnabled?: boolean;
  emailHandle?: string;
  emailDomain?: string;
  autoReplyEnabled?: boolean;
  emailSignature?: string;
}

interface ReviewStepProps {
  config: AgentConfig;
  onEditStep: (step: number) => void;
}

function ReviewSection({
  title,
  step,
  onEdit,
  children,
  warning,
}: {
  title: string;
  step: number;
  onEdit: (step: number) => void;
  children: React.ReactNode;
  warning?: string;
}) {
  return (
    <div className="bg-muted rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-foreground">{title}</h3>
          {warning && (
            <div className="flex items-center gap-1 text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">{warning}</span>
            </div>
          )}
        </div>
        <button
          onClick={() => onEdit(step)}
          className="flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300 transition"
        >
          <Edit className="h-3.5 w-3.5" />
          Edit
        </button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function ReviewItem({
  label,
  value,
  empty,
}: {
  label: string;
  value: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="flex items-start justify-between py-2">
      <span className="text-muted-foreground text-sm">{label}</span>
      <div className={cn("text-right", empty ? "text-muted-foreground italic" : "text-foreground")}>
        {value}
      </div>
    </div>
  );
}

export function ReviewStep({ config, onEditStep }: ReviewStepProps) {
  const warnings: string[] = [];

  if (!config.systemPrompt) {
    warnings.push("No system prompt configured");
  }
  if (config.tools.length === 0) {
    warnings.push("No tools selected");
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Review & Create
        </h2>
        <p className="text-muted-foreground">
          Review your agent configuration before creating it.
        </p>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-amber-400 font-medium mb-1">
                Configuration warnings
              </p>
              <ul className="list-disc list-inside text-sm text-muted-foreground">
                {warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Basic Info */}
      <ReviewSection title="Basic Information" step={1} onEdit={onEditStep}>
        <div className="space-y-1 divide-y divide-border">
          <ReviewItem label="Name" value={config.name} />
          <ReviewItem
            label="Type"
            value={<AgentTypeBadge type={config.agentType} size="sm" />}
          />
          <ReviewItem
            label="Handle"
            value={config.mentionHandle ? `@${config.mentionHandle}` : "Not set"}
            empty={!config.mentionHandle}
          />
          <ReviewItem
            label="Description"
            value={config.description || "Not set"}
            empty={!config.description}
          />
        </div>
      </ReviewSection>

      {/* LLM Configuration */}
      <ReviewSection title="LLM Configuration" step={2} onEdit={onEditStep}>
        <div className="space-y-1 divide-y divide-border">
          <ReviewItem
            label="Provider & Model"
            value={<LLMConfigDisplay provider={config.llmProvider} model={config.llmModel} />}
          />
          <ReviewItem label="Temperature" value={config.temperature.toFixed(1)} />
          <ReviewItem
            label="Max Tokens"
            value={config.maxTokens >= 1000 ? `${config.maxTokens / 1000}K` : config.maxTokens}
          />
        </div>
      </ReviewSection>

      {/* Tools */}
      <ReviewSection
        title="Tools"
        step={3}
        onEdit={onEditStep}
        warning={config.tools.length === 0 ? "None selected" : undefined}
      >
        {config.tools.length > 0 ? (
          <ToolBadges tools={config.tools} max={10} size="md" />
        ) : (
          <p className="text-muted-foreground italic">No tools selected</p>
        )}
      </ReviewSection>

      {/* Behavior */}
      <ReviewSection title="Behavior" step={4} onEdit={onEditStep}>
        <div className="space-y-1 divide-y divide-border">
          <ReviewItem
            label="Auto-respond"
            value={
              <span className={config.autoRespond ? "text-green-400" : "text-muted-foreground"}>
                {config.autoRespond ? "Enabled" : "Disabled"}
              </span>
            }
          />
          <ReviewItem
            label="Confidence Threshold"
            value={`${Math.round(config.confidenceThreshold * 100)}%`}
          />
          <ReviewItem
            label="Require Approval Below"
            value={`${Math.round(config.requireApprovalBelow * 100)}%`}
          />
          <ReviewItem label="Daily Limit" value={`${config.maxDailyResponses} responses`} />
          <ReviewItem
            label="Response Delay"
            value={
              config.responseDelayMinutes > 0
                ? `${config.responseDelayMinutes} minutes`
                : "Immediate"
            }
          />
          <ReviewItem
            label="Working Hours"
            value={<WorkingHoursDisplay config={config.workingHours} />}
          />
        </div>
      </ReviewSection>

      {/* Prompts */}
      <ReviewSection
        title="Prompts"
        step={5}
        onEdit={onEditStep}
        warning={!config.systemPrompt ? "Not configured" : undefined}
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground block mb-1">System Prompt</label>
            {config.systemPrompt ? (
              <div className="bg-accent/50 rounded-lg p-3 max-h-32 overflow-y-auto">
                <pre className="text-sm text-foreground whitespace-pre-wrap font-mono">
                  {config.systemPrompt.slice(0, 300)}
                  {config.systemPrompt.length > 300 && "..."}
                </pre>
              </div>
            ) : (
              <p className="text-muted-foreground italic">Not set</p>
            )}
          </div>
          {config.customInstructions && (
            <div>
              <label className="text-sm text-muted-foreground block mb-1">
                Custom Instructions
              </label>
              <div className="bg-accent/50 rounded-lg p-3 max-h-24 overflow-y-auto">
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {config.customInstructions.slice(0, 200)}
                  {config.customInstructions.length > 200 && "..."}
                </p>
              </div>
            </div>
          )}
        </div>
      </ReviewSection>

      {/* Email Configuration */}
      <ReviewSection title="Email" step={6} onEdit={onEditStep}>
        <div className="space-y-1 divide-y divide-border">
          <ReviewItem
            label="Email Enabled"
            value={
              <span className={config.emailEnabled ? "text-green-400" : "text-muted-foreground"}>
                {config.emailEnabled ? "Yes" : "No"}
              </span>
            }
          />
          {config.emailEnabled && (
            <>
              <ReviewItem
                label="Email Address"
                value={
                  config.emailHandle && config.emailDomain
                    ? `${config.emailHandle}@${config.emailDomain}`
                    : "Not configured"
                }
                empty={!config.emailHandle}
              />
              <ReviewItem
                label="Auto-Reply"
                value={
                  <span className={config.autoReplyEnabled ? "text-green-400" : "text-muted-foreground"}>
                    {config.autoReplyEnabled ? "Enabled" : "Disabled"}
                  </span>
                }
              />
              <ReviewItem
                label="Email Signature"
                value={config.emailSignature ? "Configured" : "Not set"}
                empty={!config.emailSignature}
              />
            </>
          )}
        </div>
      </ReviewSection>

      {/* Ready indicator */}
      <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
        <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
          <Check className="h-5 w-5 text-green-400" />
        </div>
        <div>
          <p className="text-green-400 font-medium">Ready to create</p>
          <p className="text-sm text-muted-foreground">
            Your agent will be created as inactive. You can activate it after testing.
          </p>
        </div>
      </div>
    </div>
  );
}
