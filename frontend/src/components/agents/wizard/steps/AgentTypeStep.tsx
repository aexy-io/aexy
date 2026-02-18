"use client";

import {
  Headphones,
  TrendingUp,
  Calendar,
  UserPlus,
  Users,
  Newspaper,
  Sparkles,
  Check,
  LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentType, StandardAgentType, AGENT_TYPE_CONFIG } from "@/lib/api";

const iconMap: Record<string, LucideIcon> = {
  headphones: Headphones,
  "trending-up": TrendingUp,
  calendar: Calendar,
  "user-plus": UserPlus,
  users: Users,
  newspaper: Newspaper,
  sparkles: Sparkles,
};

interface AgentTypeStepProps {
  selectedType: AgentType | null;
  onSelect: (type: AgentType) => void;
}

export function AgentTypeStep({ selectedType, onSelect }: AgentTypeStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          What type of agent do you want to create?
        </h2>
        <p className="text-muted-foreground">
          Choose a template to start with pre-configured tools and prompts, or
          create a custom agent from scratch.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(Object.entries(AGENT_TYPE_CONFIG) as [StandardAgentType, typeof AGENT_TYPE_CONFIG.support][]).map(
          ([type, config]) => {
            const Icon = iconMap[config.icon] || Sparkles;
            const isSelected = selectedType === type;

            return (
              <button
                key={type}
                onClick={() => onSelect(type)}
                className={cn(
                  "relative flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all",
                  isSelected
                    ? "border-purple-500 bg-purple-500/10"
                    : "border-border hover:border-border bg-muted/50"
                )}
              >
                {/* Selected indicator */}
                {isSelected && (
                  <div className="absolute top-3 right-3">
                    <div className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
                      <Check className="h-4 w-4 text-foreground" />
                    </div>
                  </div>
                )}

                {/* Icon */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${config.color}20` }}
                >
                  <Icon className="h-6 w-6" style={{ color: config.color }} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pr-8">
                  <h3 className="text-foreground font-medium mb-1">{config.label}</h3>
                  <p className="text-sm text-muted-foreground mb-2">{config.description}</p>

                  {/* Default tools preview */}
                  {config.defaultTools.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {config.defaultTools.slice(0, 3).map((tool) => (
                        <span
                          key={tool}
                          className="text-xs px-1.5 py-0.5 bg-accent text-muted-foreground rounded"
                        >
                          {tool}
                        </span>
                      ))}
                      {config.defaultTools.length > 3 && (
                        <span className="text-xs text-muted-foreground">
                          +{config.defaultTools.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </button>
            );
          }
        )}
      </div>
    </div>
  );
}
