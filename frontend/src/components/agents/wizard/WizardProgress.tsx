"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
}

interface WizardProgressProps {
  steps: WizardStep[];
  currentStep: number;
  className?: string;
}

export function WizardProgress({ steps, currentStep, className }: WizardProgressProps) {
  return (
    <div className={cn("relative", className)}>
      {/* Progress line */}
      <div className="absolute top-5 left-5 right-5 h-0.5 bg-accent">
        <div
          className="h-full bg-purple-500 transition-all duration-300"
          style={{
            width: `${((currentStep) / (steps.length - 1)) * 100}%`,
          }}
        />
      </div>

      {/* Steps */}
      <div className="relative flex justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;

          return (
            <div key={step.id} className="flex flex-col items-center">
              {/* Step circle */}
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                  isCompleted
                    ? "bg-purple-500 border-purple-500"
                    : isCurrent
                    ? "bg-muted border-purple-500"
                    : "bg-muted border-border"
                )}
              >
                {isCompleted ? (
                  <Check className="h-5 w-5 text-foreground" />
                ) : (
                  <span
                    className={cn(
                      "text-sm font-medium",
                      isCurrent ? "text-purple-400" : "text-muted-foreground"
                    )}
                  >
                    {index + 1}
                  </span>
                )}
              </div>

              {/* Step title */}
              <div className="mt-2 text-center">
                <div
                  className={cn(
                    "text-sm font-medium",
                    isCompleted || isCurrent ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {step.title}
                </div>
                {step.description && (
                  <div className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                    {step.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Compact vertical progress for mobile/sidebar
interface WizardProgressVerticalProps {
  steps: WizardStep[];
  currentStep: number;
  onStepClick?: (step: number) => void;
  className?: string;
}

export function WizardProgressVertical({
  steps,
  currentStep,
  onStepClick,
  className,
}: WizardProgressVerticalProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;
        const isClickable = onStepClick && isCompleted;

        return (
          <button
            key={step.id}
            onClick={() => isClickable && onStepClick(index)}
            disabled={!isClickable}
            className={cn(
              "w-full flex items-center gap-3 p-2 rounded-lg text-left transition",
              isClickable && "hover:bg-accent/50 cursor-pointer",
              !isClickable && "cursor-default"
            )}
          >
            {/* Step indicator */}
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-medium transition-all",
                isCompleted
                  ? "bg-purple-500 text-white"
                  : isCurrent
                  ? "bg-purple-500/20 text-purple-400 border border-purple-500"
                  : "bg-accent text-muted-foreground"
              )}
            >
              {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
            </div>

            {/* Step info */}
            <div className="min-w-0">
              <div
                className={cn(
                  "text-sm font-medium truncate",
                  isCompleted || isCurrent ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {step.title}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
