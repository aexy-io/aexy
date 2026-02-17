"use client";

import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface WizardNavigationProps {
  currentStep: number;
  totalSteps: number;
  onPrevious: () => void;
  onNext: () => void;
  onSubmit: () => void;
  canProceed: boolean;
  isSubmitting?: boolean;
  previousLabel?: string;
  nextLabel?: string;
  submitLabel?: string;
  className?: string;
}

export function WizardNavigation({
  currentStep,
  totalSteps,
  onPrevious,
  onNext,
  onSubmit,
  canProceed,
  isSubmitting = false,
  previousLabel = "Back",
  nextLabel = "Continue",
  submitLabel = "Create Agent",
  className,
}: WizardNavigationProps) {
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;

  return (
    <div
      className={cn(
        "flex items-center justify-between pt-6 border-t border-border",
        className
      )}
    >
      {/* Previous button */}
      <button
        onClick={onPrevious}
        disabled={isFirstStep || isSubmitting}
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-lg transition",
          isFirstStep
            ? "text-muted-foreground cursor-not-allowed"
            : "text-foreground hover:text-foreground hover:bg-accent"
        )}
      >
        <ArrowLeft className="h-4 w-4" />
        {previousLabel}
      </button>

      {/* Step indicator */}
      <div className="text-sm text-muted-foreground">
        Step {currentStep + 1} of {totalSteps}
      </div>

      {/* Next/Submit button */}
      {isLastStep ? (
        <button
          onClick={onSubmit}
          disabled={!canProceed || isSubmitting}
          className={cn(
            "flex items-center gap-2 px-6 py-2 bg-purple-600 text-white rounded-lg transition font-medium",
            canProceed && !isSubmitting
              ? "hover:bg-purple-700"
              : "opacity-50 cursor-not-allowed"
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              {submitLabel}
            </>
          )}
        </button>
      ) : (
        <button
          onClick={onNext}
          disabled={!canProceed}
          className={cn(
            "flex items-center gap-2 px-6 py-2 bg-purple-600 text-white rounded-lg transition font-medium",
            canProceed
              ? "hover:bg-purple-700"
              : "opacity-50 cursor-not-allowed"
          )}
        >
          {nextLabel}
          <ArrowRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
