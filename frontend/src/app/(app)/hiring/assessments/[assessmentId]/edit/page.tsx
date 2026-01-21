"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Circle, AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAssessment, useAssessmentWizard } from "@/hooks/useAssessments";
import { StepStatus } from "@/lib/api";
import Step1AssessmentDetails from "@/components/assessment-wizard/Step1AssessmentDetails";
import Step2TopicDistribution from "@/components/assessment-wizard/Step2TopicDistribution";
import Step3ScheduleSettings from "@/components/assessment-wizard/Step3ScheduleSettings";
import Step4AddCandidates from "@/components/assessment-wizard/Step4AddCandidates";
import Step5ReviewConfirm from "@/components/assessment-wizard/Step5ReviewConfirm";

const steps = [
  { number: 1, name: "Assessment Details", description: "Basic information" },
  { number: 2, name: "Topic Distribution", description: "Configure topics & questions" },
  { number: 3, name: "Schedule Time", description: "Set schedule & proctoring" },
  { number: 4, name: "Add Candidates", description: "Invite candidates" },
  { number: 5, name: "Review & Confirm", description: "Final review" },
];

function StepIndicator({
  step,
  status,
  isCurrent,
  onClick,
}: {
  step: typeof steps[0];
  status: StepStatus;
  isCurrent: boolean;
  onClick: () => void;
}) {
  const getStatusIcon = () => {
    if (status === "complete") {
      return (
        <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center">
          <Check className="w-5 h-5 text-white" />
        </div>
      );
    }
    if (status === "error") {
      return (
        <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center">
          <AlertCircle className="w-5 h-5 text-white" />
        </div>
      );
    }
    if (isCurrent) {
      return (
        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
          <span className="text-white font-semibold">{step.number}</span>
        </div>
      );
    }
    return (
      <div className="w-10 h-10 rounded-full border-2 border-gray-300 flex items-center justify-center">
        <span className="text-gray-500 font-semibold">{step.number}</span>
      </div>
    );
  };

  return (
    <button
      onClick={onClick}
      disabled={status === "incomplete" && !isCurrent}
      className={`flex items-center gap-3 ${
        status === "incomplete" && !isCurrent
          ? "opacity-50 cursor-not-allowed"
          : "cursor-pointer hover:opacity-80"
      }`}
    >
      {getStatusIcon()}
      <div className="text-left hidden md:block">
        <p
          className={`text-sm font-medium ${
            isCurrent ? "text-blue-600" : "text-gray-900"
          }`}
        >
          {step.name}
        </p>
        <p className="text-xs text-gray-500">{step.description}</p>
      </div>
    </button>
  );
}

function WizardProgress({
  currentStep,
  stepStatus,
  onStepClick,
}: {
  currentStep: number;
  stepStatus: Record<string, StepStatus>;
  onStepClick: (step: number) => void;
}) {
  return (
    <div className="bg-white border-b px-6 py-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.number} className="flex items-center">
              <StepIndicator
                step={step}
                status={stepStatus[`step${step.number}`]}
                isCurrent={currentStep === step.number}
                onClick={() => onStepClick(step.number)}
              />
              {index < steps.length - 1 && (
                <div
                  className={`hidden md:block w-16 lg:w-24 h-0.5 mx-4 ${
                    stepStatus[`step${step.number}`] === "complete"
                      ? "bg-green-600"
                      : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AssessmentWizardPage() {
  const params = useParams();
  const router = useRouter();
  const assessmentId = params.assessmentId as string;

  const { user, isLoading: authLoading, logout } = useAuth();
  const { currentWorkspaceId, workspacesLoading } = useWorkspace();

  const { assessment, isLoading: assessmentLoading } = useAssessment(
    assessmentId,
    currentWorkspaceId || undefined
  );

  const {
    wizardStatus,
    isLoadingStatus,
    saveStep1,
    saveStep2,
    saveStep3,
    saveStep4,
    saveStep5,
    isSaving,
  } = useAssessmentWizard(assessmentId, currentWorkspaceId);

  const [currentStep, setCurrentStep] = useState(1);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"saved" | "saving" | "error" | null>(null);

  useEffect(() => {
    if (wizardStatus) {
      setCurrentStep(wizardStatus.current_step);
    }
  }, [wizardStatus]);

  useEffect(() => {
    if (isSaving) {
      setAutoSaveStatus("saving");
    } else {
      setAutoSaveStatus("saved");
      const timer = setTimeout(() => setAutoSaveStatus(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [isSaving]);

  const handleStepClick = (step: number) => {
    // Allow navigation to completed steps or current step
    if (!wizardStatus) return;
    const stepKey = `step${step}` as keyof typeof wizardStatus.step_status;
    if (
      wizardStatus.step_status[stepKey] === "complete" ||
      step === currentStep ||
      step <= currentStep
    ) {
      setCurrentStep(step);
    }
  };

  const handleNextStep = () => {
    if (currentStep < 5) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  if (authLoading || workspacesLoading || assessmentLoading || isLoadingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Assessment not found
          </h2>
          <Link
            href="/hiring/assessments"
            className="text-blue-600 hover:text-blue-700"
          >
            Back to assessments
          </Link>
        </div>
      </div>
    );
  }

  const stepStatus = wizardStatus?.step_status || {
    step1: "incomplete" as StepStatus,
    step2: "incomplete" as StepStatus,
    step3: "incomplete" as StepStatus,
    step4: "incomplete" as StepStatus,
    step5: "incomplete" as StepStatus,
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link
                href="/hiring/assessments"
                className="text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">
                  {assessment.title || "Untitled Assessment"}
                </h1>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                    Draft
                  </span>
                  {autoSaveStatus && (
                    <span className="text-xs text-gray-400">
                      {autoSaveStatus === "saving" ? (
                        <span className="flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Saving...
                        </span>
                      ) : autoSaveStatus === "saved" ? (
                        "Saved"
                      ) : (
                        "Error saving"
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handlePrevStep}
                disabled={currentStep === 1}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              {currentStep < 5 ? (
                <button
                  onClick={handleNextStep}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Next Step
                </button>
              ) : (
                <button
                  onClick={() => router.push(`/hiring/assessments/${assessmentId}/publish`)}
                  disabled={!wizardStatus?.can_publish}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Publish Assessment
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Progress */}
      <WizardProgress
        currentStep={currentStep}
        stepStatus={stepStatus as unknown as Record<string, StepStatus>}
        onStepClick={handleStepClick}
      />

      {/* Step Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {currentStep === 1 && (
            <Step1AssessmentDetails
              assessment={assessment}
              onSave={saveStep1}
              onNext={handleNextStep}
            />
          )}
          {currentStep === 2 && (
            <Step2TopicDistribution
              assessment={assessment}
              assessmentId={assessmentId}
              organizationId={currentWorkspaceId!}
              onSave={saveStep2}
              onNext={handleNextStep}
              onPrev={handlePrevStep}
            />
          )}
          {currentStep === 3 && (
            <Step3ScheduleSettings
              assessment={assessment}
              onSave={saveStep3}
              onNext={handleNextStep}
              onPrev={handlePrevStep}
            />
          )}
          {currentStep === 4 && (
            <Step4AddCandidates
              assessment={assessment}
              assessmentId={assessmentId}
              organizationId={currentWorkspaceId!}
              onSave={saveStep4}
              onNext={handleNextStep}
              onPrev={handlePrevStep}
            />
          )}
          {currentStep === 5 && (
            <Step5ReviewConfirm
              assessment={assessment}
              assessmentId={assessmentId}
              organizationId={currentWorkspaceId!}
              onSave={saveStep5}
              onPublish={() => router.push(`/hiring/assessments/${assessmentId}/publish`)}
              onPrev={handlePrevStep}
            />
          )}
        </div>
      </div>
    </div>
  );
}
