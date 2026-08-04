"use client";

import { useState } from "react";
import { ChevronDown, Check, Sparkles, Cpu, Server, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { HelpTooltip } from "@/components/ui/tooltip";

// Must stay in sync with backend schema:
// `AgentCreate.llm_provider` in src/aexy/schemas/agent.py
// — a divergence here surfaces as a runtime crash inside
// LLMConfigDisplay because `PROVIDERS[provider]` is undefined when
// the FE doesn't recognize a value the BE accepted.
// Exported so callers hold the same union instead of re-declaring their own.
// Two of them had gone stale at four providers while this list grew to six, so
// handing the selector's value back to their own setState did not typecheck —
// and a user picking DeepSeek or LM Studio was writing a value the caller's
// state did not admit.
export type LLMProvider =
  | "claude"
  | "gemini"
  | "ollama"
  | "openrouter"
  | "deepseek"
  | "lmstudio";

interface LLMConfig {
  provider: LLMProvider;
  model: string;
}

const PROVIDERS: Record<
  LLMProvider,
  {
    name: string;
    icon: typeof Sparkles;
    color: string;
    models: { id: string; name: string; description: string }[];
  }
> = {
  claude: {
    name: "Claude",
    icon: Sparkles,
    color: "#D97706",
    models: [
      {
        id: "claude-opus-4-20250514",
        name: "Claude Opus 4",
        description: "Most capable, best for complex tasks",
      },
      {
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        description: "Balanced performance and speed",
      },
      {
        id: "claude-3-5-haiku-20241022",
        name: "Claude 3.5 Haiku",
        description: "Fast and cost-effective",
      },
    ],
  },
  gemini: {
    name: "Gemini",
    icon: Cpu,
    color: "#4285F4",
    models: [
      {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        description: "Fast and capable",
      },
      {
        id: "gemini-1.5-pro",
        name: "Gemini 1.5 Pro",
        description: "Advanced reasoning",
      },
      {
        id: "gemini-1.5-flash",
        name: "Gemini 1.5 Flash",
        description: "Quick responses",
      },
    ],
  },
  ollama: {
    name: "Ollama (Self-hosted)",
    icon: Server,
    color: "#22c55e",
    models: [
      {
        id: "llama3.1:70b",
        name: "Llama 3.1 70B",
        description: "Large open model",
      },
      {
        id: "llama3.1:8b",
        name: "Llama 3.1 8B",
        description: "Efficient open model",
      },
      {
        id: "mistral",
        name: "Mistral",
        description: "Fast and capable",
      },
    ],
  },
  openrouter: {
    name: "OpenRouter",
    icon: Globe,
    color: "#6366F1",
    models: [
      {
        id: "anthropic/claude-sonnet-4",
        name: "Claude Sonnet 4",
        description: "Balanced performance and speed",
      },
      {
        id: "openai/gpt-4o",
        name: "GPT-4o",
        description: "OpenAI flagship model",
      },
      {
        id: "meta-llama/llama-3.1-70b-instruct",
        name: "Llama 3.1 70B",
        description: "Open source, fast and capable",
      },
      {
        id: "google/gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        description: "Fast and cost-effective",
      },
      {
        id: "deepseek/deepseek-chat-v3",
        name: "DeepSeek V3",
        description: "Strong reasoning at low cost",
      },
    ],
  },
  deepseek: {
    name: "DeepSeek",
    icon: Cpu,
    color: "#7C3AED",
    models: [
      {
        id: "deepseek-chat",
        name: "DeepSeek Chat",
        description: "Strong reasoning at low cost",
      },
      {
        id: "deepseek-reasoner",
        name: "DeepSeek Reasoner",
        description: "Chain-of-thought reasoning model",
      },
    ],
  },
  lmstudio: {
    name: "LM Studio",
    icon: Server,
    color: "#0EA5E9",
    models: [
      {
        id: "qwen/qwen3.5-9b",
        name: "Qwen 3.5 9B",
        description: "Local Qwen model loaded via LM Studio",
      },
    ],
  },
};

interface LLMProviderSelectorProps {
  provider: LLMProvider;
  model: string;
  onChange: (config: LLMConfig) => void;
  disabled?: boolean;
  className?: string;
}

export function LLMProviderSelector({
  provider,
  model,
  onChange,
  disabled = false,
  className,
}: LLMProviderSelectorProps) {
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  const currentProvider = PROVIDERS[provider];
  const Icon = currentProvider.icon;

  const handleProviderChange = (newProvider: LLMProvider) => {
    const defaultModel = PROVIDERS[newProvider].models[0].id;
    onChange({ provider: newProvider, model: defaultModel });
    setShowProviderDropdown(false);
  };

  const handleModelChange = (newModel: string) => {
    onChange({ provider, model: newModel });
    setShowModelDropdown(false);
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Provider Selector */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <label className="text-sm font-medium text-foreground">
            LLM Provider
          </label>
          <HelpTooltip content="The AI service that powers your agent. Claude excels at nuanced tasks, Gemini offers fast responses, and Ollama runs locally for data privacy" />
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => !disabled && setShowProviderDropdown(!showProviderDropdown)}
            disabled={disabled}
            className={cn(
              "w-full flex items-center justify-between px-4 py-3 bg-accent border border-border rounded-lg text-left transition",
              !disabled && "hover:border-muted-foreground",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${currentProvider.color}20` }}
              >
                <Icon
                  className="h-5 w-5"
                  style={{ color: currentProvider.color }}
                />
              </div>
              <span className="text-foreground font-medium">{currentProvider.name}</span>
            </div>
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          </button>

          {showProviderDropdown && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowProviderDropdown(false)}
              />
              <div className="absolute left-0 right-0 top-full mt-2 bg-accent border border-border rounded-lg shadow-xl z-20 overflow-hidden">
                {Object.entries(PROVIDERS).map(([key, prov]) => {
                  const ProvIcon = prov.icon;
                  const isSelected = key === provider;
                  return (
                    <button
                      key={key}
                      onClick={() => handleProviderChange(key as LLMProvider)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 text-left transition",
                        isSelected ? "bg-purple-500/20" : "hover:bg-muted"
                      )}
                    >
                      <div
                        className="p-2 rounded-lg"
                        style={{ backgroundColor: `${prov.color}20` }}
                      >
                        <ProvIcon
                          className="h-5 w-5"
                          style={{ color: prov.color }}
                        />
                      </div>
                      <span className="text-foreground font-medium">{prov.name}</span>
                      {isSelected && (
                        <Check className="h-4 w-4 text-purple-400 ml-auto" />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Model Selector */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <label className="text-sm font-medium text-foreground">
            Model
          </label>
          <HelpTooltip content="Specific model version to use. Larger models are more capable but slower and more expensive. Smaller models are faster and cheaper" />
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => !disabled && setShowModelDropdown(!showModelDropdown)}
            disabled={disabled}
            className={cn(
              "w-full flex items-center justify-between px-4 py-3 bg-accent border border-border rounded-lg text-left transition",
              !disabled && "hover:border-muted-foreground",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <div>
              <div className="text-foreground font-medium">
                {currentProvider.models.find((m) => m.id === model)?.name || model}
              </div>
              <div className="text-sm text-muted-foreground">
                {currentProvider.models.find((m) => m.id === model)?.description}
              </div>
            </div>
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          </button>

          {showModelDropdown && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowModelDropdown(false)}
              />
              <div className="absolute left-0 right-0 top-full mt-2 bg-accent border border-border rounded-lg shadow-xl z-20 overflow-hidden">
                {currentProvider.models.map((m) => {
                  const isSelected = m.id === model;
                  return (
                    <button
                      key={m.id}
                      onClick={() => handleModelChange(m.id)}
                      className={cn(
                        "w-full px-4 py-3 text-left transition",
                        isSelected ? "bg-purple-500/20" : "hover:bg-muted"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-foreground font-medium">{m.name}</div>
                          <div className="text-sm text-muted-foreground">{m.description}</div>
                        </div>
                        {isSelected && (
                          <Check className="h-4 w-4 text-purple-400" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Compact display version
interface LLMConfigDisplayProps {
  provider: LLMProvider;
  model: string;
  className?: string;
}

export function LLMConfigDisplay({ provider, model, className }: LLMConfigDisplayProps) {
  // Defensive: a future backend provider that the FE doesn't know
  // about yet would previously crash here (`PROVIDERS[unknown]` is
  // undefined → `.models.find` throws → agent detail error boundary).
  // Falling back to a generic render keeps the page usable until the
  // FE catches up.
  const providerConfig = PROVIDERS[provider] ?? {
    name: provider,
    icon: Cpu,
    color: "#6B7280",
    models: [],
  };
  const modelConfig = providerConfig.models.find((m) => m.id === model);
  const Icon = providerConfig.icon;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Icon className="h-4 w-4" style={{ color: providerConfig.color }} />
      <span className="text-sm text-foreground">
        {providerConfig.name} / {modelConfig?.name || model}
      </span>
    </div>
  );
}
