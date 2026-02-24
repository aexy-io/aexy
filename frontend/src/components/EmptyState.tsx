"use client";

import Link from "next/link";
import { Plus, ArrowRight, Sparkles, type LucideIcon } from "lucide-react";

interface EmptyStateStep {
  label: string;
  description?: string;
  completed?: boolean;
}

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: LucideIcon;
  variant?: "primary" | "secondary" | "ghost";
}

interface EmptyStateConnection {
  label: string;
  href: string;
  connected?: boolean;
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actions?: EmptyStateAction[];
  steps?: EmptyStateStep[];
  connections?: EmptyStateConnection[];
  sampleDataLabel?: string;
  onLoadSampleData?: () => void;
  templateHref?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actions = [],
  steps,
  connections,
  sampleDataLabel,
  onLoadSampleData,
  templateHref,
  compact = false,
}: EmptyStateProps) {
  const padding = compact ? "p-8" : "p-12";

  return (
    <div className={`bg-muted rounded-xl border border-border ${padding} text-center`}>
      <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
        <Icon className="h-7 w-7 text-primary" />
      </div>

      <h3 className="text-lg font-semibold text-foreground mb-1.5">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">{description}</p>

      {/* Quick-start steps */}
      {steps && steps.length > 0 && (
        <div className="max-w-sm mx-auto mb-6 text-left">
          <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
            Get started
          </p>
          <div className="space-y-2">
            {steps.map((step, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-2.5 rounded-lg ${
                  step.completed ? "bg-emerald-500/5" : "bg-accent"
                }`}
              >
                <span
                  className={`flex-shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center mt-0.5 ${
                    step.completed
                      ? "bg-emerald-500 text-white"
                      : "bg-border text-muted-foreground"
                  }`}
                >
                  {step.completed ? "\u2713" : i + 1}
                </span>
                <div className="min-w-0">
                  <span
                    className={`text-sm font-medium ${
                      step.completed
                        ? "text-muted-foreground line-through"
                        : "text-foreground"
                    }`}
                  >
                    {step.label}
                  </span>
                  {step.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {step.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Integration connections */}
      {connections && connections.length > 0 && (
        <div className="max-w-sm mx-auto mb-6">
          <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
            Connect your tools
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {connections.map((conn) => (
              <Link
                key={conn.label}
                href={conn.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
                  conn.connected
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
                    : "border-border bg-accent text-muted-foreground hover:text-foreground hover:border-foreground/20"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    conn.connected ? "bg-emerald-400" : "bg-zinc-500"
                  }`}
                />
                {conn.label}
                {conn.connected && <span className="ml-0.5">Connected</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {actions.length > 0 && (
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {actions.map((action, i) => {
            const ActionIcon = action.icon || (i === 0 ? Plus : ArrowRight);
            const className =
              action.variant === "secondary"
                ? "px-4 py-2.5 text-sm font-medium text-foreground bg-accent hover:bg-accent/80 border border-border rounded-lg transition-colors inline-flex items-center gap-2"
                : action.variant === "ghost"
                ? "px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg transition-colors inline-flex items-center gap-2"
                : "px-4 py-2.5 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors inline-flex items-center gap-2";

            if (action.href) {
              return (
                <Link key={i} href={action.href} className={className}>
                  <ActionIcon className="h-4 w-4" />
                  {action.label}
                </Link>
              );
            }
            return (
              <button key={i} onClick={action.onClick} className={className}>
                <ActionIcon className="h-4 w-4" />
                {action.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Bottom row: sample data + templates */}
      {(onLoadSampleData || templateHref) && (
        <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-border">
          {onLoadSampleData && (
            <button
              onClick={onLoadSampleData}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {sampleDataLabel || "Load sample data"}
            </button>
          )}
          {templateHref && (
            <Link
              href={templateHref}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Browse templates
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
