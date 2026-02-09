"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
}

interface ReminderWizardProgressProps {
  steps: WizardStep[];
  currentStep: number;
  onStepClick?: (step: number) => void;
  className?: string;
}

export function ReminderWizardProgress({
  steps,
  currentStep,
  onStepClick,
  className,
}: ReminderWizardProgressProps) {
  return (
    <div className={cn("relative", className)}>
      {/* Progress line */}
      <div className="absolute top-5 left-5 right-5 h-0.5 bg-slate-700">
        <div
          className="h-full bg-blue-500 transition-all duration-300"
          style={{
            width: `${(currentStep / (steps.length - 1)) * 100}%`,
          }}
        />
      </div>

      {/* Steps */}
      <div className="relative flex justify-between">
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
                "flex flex-col items-center",
                isClickable && "cursor-pointer"
              )}
            >
              {/* Step circle */}
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                  isCompleted
                    ? "bg-blue-500 border-blue-500"
                    : isCurrent
                    ? "bg-slate-800 border-blue-500"
                    : "bg-slate-800 border-slate-600"
                )}
              >
                {isCompleted ? (
                  <Check className="h-5 w-5 text-white" />
                ) : (
                  <span
                    className={cn(
                      "text-sm font-medium",
                      isCurrent ? "text-blue-400" : "text-slate-500"
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
                    isCompleted || isCurrent ? "text-white" : "text-slate-500"
                  )}
                >
                  {step.title}
                </div>
                {step.description && (
                  <div className="text-xs text-slate-500 mt-0.5 hidden sm:block">
                    {step.description}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
