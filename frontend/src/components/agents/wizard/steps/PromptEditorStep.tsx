"use client";

import { Lightbulb, Copy, Check } from "lucide-react";
import { useState } from "react";
import { PromptEditor, InstructionsEditor } from "@/components/agents/shared";
import { AgentType, getAgentTypeConfig, StandardAgentType } from "@/lib/api";

const SYSTEM_PROMPT_TEMPLATES: Record<AgentType, string> = {
  support: `You are a helpful customer support agent for {{company_name}}. Your role is to:

1. Respond to customer inquiries with empathy and professionalism
2. Resolve issues quickly and effectively
3. Escalate complex issues that require human attention
4. Document important information in the CRM

Guidelines:
- Always greet the customer by name when available
- Be concise but thorough in your responses
- If you're unsure about something, say so and offer to find out
- Never make promises you can't keep
- Use a friendly, professional tone`,

  sales: `You are a sales development representative for {{company_name}}. Your role is to:

1. Engage potential customers professionally
2. Qualify leads based on their needs and fit
3. Schedule meetings with qualified prospects
4. Update CRM records with interaction details

Guidelines:
- Be helpful rather than pushy
- Focus on understanding the prospect's needs
- Provide value in every interaction
- Personalize your outreach based on available context`,

  scheduling: `You are a scheduling assistant for {{company_name}}. Your role is to:

1. Coordinate meeting times between parties
2. Handle scheduling conflicts gracefully
3. Send meeting invitations and confirmations
4. Reschedule meetings when necessary

Guidelines:
- Be flexible and accommodating
- Confirm all details before scheduling
- Provide clear meeting information including time zones
- Offer alternatives when the first option doesn't work`,

  onboarding: `You are an onboarding specialist for {{company_name}}. Your role is to:

1. Welcome new users and guide them through setup
2. Answer questions about features and capabilities
3. Create tasks for follow-up and check-ins
4. Track onboarding progress in the CRM

Guidelines:
- Be patient and encouraging
- Break down complex processes into simple steps
- Celebrate milestones and progress
- Proactively check in on stuck users`,

  recruiting: `You are a recruiting coordinator for {{company_name}}. Your role is to:

1. Screen candidates based on job requirements
2. Schedule interviews with qualified candidates
3. Answer common questions about the role and company
4. Keep candidate records updated

Guidelines:
- Be professional and respectful of candidates' time
- Provide clear information about next steps
- Maintain confidentiality of candidate information
- Give timely responses to inquiries`,

  newsletter: `You are a newsletter and subscription manager for {{company_name}}. Your role is to:

1. Handle subscription requests and preferences
2. Answer questions about newsletter content
3. Process unsubscribe requests promptly
4. Maintain subscriber engagement

Guidelines:
- Respect subscriber preferences
- Provide value in every communication
- Make subscription management easy
- Be transparent about data usage`,

  custom: `You are an AI assistant. Your role is to help users accomplish their goals efficiently and accurately.

Guidelines:
- Be helpful and professional
- Provide accurate information
- Ask for clarification when needed
- Respect user privacy and data`,
};

interface PromptEditorStepProps {
  agentType: AgentType;
  systemPrompt: string;
  customInstructions: string;
  onSystemPromptChange: (value: string) => void;
  onCustomInstructionsChange: (value: string) => void;
}

export function PromptEditorStep({
  agentType,
  systemPrompt,
  customInstructions,
  onSystemPromptChange,
  onCustomInstructionsChange,
}: PromptEditorStepProps) {
  const [copied, setCopied] = useState(false);

  const template = SYSTEM_PROMPT_TEMPLATES[agentType] || SYSTEM_PROMPT_TEMPLATES.custom;

  const handleUseTemplate = () => {
    onSystemPromptChange(template);
  };

  const handleCopyTemplate = () => {
    navigator.clipboard.writeText(template);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Agent Prompts
        </h2>
        <p className="text-muted-foreground">
          Configure the system prompt that defines your agent's personality and
          behavior, plus any custom instructions.
        </p>
      </div>

      {/* Template suggestion */}
      {!systemPrompt && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Lightbulb className="h-5 w-5 text-amber-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-amber-400 font-medium mb-2">
                Start with a template for {getAgentTypeConfig(agentType).label}
              </p>
              <p className="text-sm text-muted-foreground mb-3">
                We have a pre-written prompt template that works well for this type
                of agent. You can customize it after applying.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleUseTemplate}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition text-sm font-medium"
                >
                  Use Template
                </button>
                <button
                  onClick={handleCopyTemplate}
                  className="px-4 py-2 bg-accent hover:bg-muted text-foreground rounded-lg transition text-sm flex items-center gap-2"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy Template
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* System Prompt */}
      <PromptEditor
        value={systemPrompt}
        onChange={onSystemPromptChange}
        label="System Prompt"
        description="This prompt defines the agent's core behavior, personality, and guidelines."
        placeholder="Enter the system prompt that defines how your agent should behave..."
        rows={12}
      />

      {/* Custom Instructions */}
      <InstructionsEditor
        value={customInstructions}
        onChange={onCustomInstructionsChange}
        label="Custom Instructions (Optional)"
        placeholder="Add any additional instructions or context for the agent..."
        rows={4}
      />

      <div className="p-3 bg-accent/50 rounded-lg">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Tip:</strong> Use variables like{" "}
          <code className="text-purple-400">{"{{sender_name}}"}</code> in your
          prompts. They'll be replaced with actual values when the agent runs.
        </p>
      </div>
    </div>
  );
}
