"use client";

import { useState } from "react";
import { ChevronDown, Check, Sparkles, Cpu, Server } from "lucide-react";
import { cn } from "@/lib/utils";

type LLMProvider = "claude" | "gemini" | "ollama";

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
        <label className="block text-sm font-medium text-foreground mb-2">
          LLM Provider
        </label>
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
        <label className="block text-sm font-medium text-foreground mb-2">
          Model
        </label>
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
  const providerConfig = PROVIDERS[provider];
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
