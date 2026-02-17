"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { ReminderWizardProgress, WizardStep } from "./ReminderWizardProgress";
import { BasicInfoStep, ScheduleStep, AssignmentStep, ReviewStep } from "./steps";
import { useReminders } from "@/hooks/useReminders";
import { useTeams } from "@/hooks/useTeams";
import {
  ReminderCategory,
  ReminderPriority,
  ReminderFrequency,
  ReminderAssignmentStrategy,
  ReminderCreate,
} from "@/lib/api";
import { format } from "date-fns";
import { useWorkspaceMembers } from "@/hooks/useWorkspace";

const WIZARD_STEPS: WizardStep[] = [
  { id: "basic", title: "Basic Info", description: "Title & category" },
  { id: "schedule", title: "Schedule", description: "Frequency & timing" },
  { id: "assignment", title: "Assignment", description: "Owner & team" },
  { id: "review", title: "Review", description: "Final review" },
];

interface ReminderCreationWizardProps {
  workspaceId: string;
  onClose?: () => void;
  onSuccess?: (reminderId: string) => void;
}

export function ReminderCreationWizard({
  workspaceId,
  onClose,
  onSuccess,
}: ReminderCreationWizardProps) {
  const router = useRouter();
  const { createReminder, isCreating } = useReminders(workspaceId);
  const { teams } = useTeams(workspaceId);
  const {members} = useWorkspaceMembers(workspaceId)
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Form state - Basic Info
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ReminderCategory>("compliance");
  const [priority, setPriority] = useState<ReminderPriority>("medium");

  // Form state - Schedule
  const [frequency, setFrequency] = useState<ReminderFrequency>("monthly");
  const [cronExpression, setCronExpression] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState("");
  const [timezone, setTimezone] = useState("UTC");

  // Form state - Assignment
  const [assignmentStrategy, setAssignmentStrategy] =
    useState<ReminderAssignmentStrategy>("fixed");
  const [defaultOwnerId, setDefaultOwnerId] = useState("");
  const [defaultTeamId, setDefaultTeamId] = useState("");
  const [requiresAcknowledgment, setRequiresAcknowledgment] = useState(true);

  // Derived values for review
  const defaultOwner = members?.find((m: any) => m.developer_id === defaultOwnerId);
  const defaultTeam = teams?.find((t: any) => t.id === defaultTeamId);

  // Validation for each step
  const canProceed = (): boolean => {
    switch (currentStep) {
      case 0: // Basic Info
        return title.trim().length > 0;
      case 1: // Schedule
        if (frequency === "custom") {
          return cronExpression.trim().length > 0 && startDate.length > 0;
        }
        return startDate.length > 0;
      case 2: // Assignment
        if (assignmentStrategy === "fixed") {
          return true; // Owner is optional
        }
        return true; // Team is optional
      case 3: // Review
        return title.trim().length > 0 && startDate.length > 0;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (canProceed() && currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
      setError(null);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setError(null);
    }
  };

  const handleGoToStep = (step: number) => {
    setCurrentStep(step);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!canProceed()) return;

    setError(null);

    try {
      const reminderData: ReminderCreate = {
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        priority,
        frequency,
        cron_expression: frequency === "custom" ? cronExpression : undefined,
        timezone,
        start_date: startDate,
        end_date: endDate || undefined,
        assignment_strategy: assignmentStrategy,
        default_owner_id: defaultOwnerId || undefined,
        default_team_id: defaultTeamId || undefined,
        requires_acknowledgment: requiresAcknowledgment,
      };

      const newReminder = await createReminder(reminderData);

      if (onSuccess) {
        onSuccess(newReminder.id);
      } else {
        router.push(`/compliance/reminders/${newReminder.id}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create reminder");
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      router.push("/compliance/reminders");
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <BasicInfoStep
            title={title}
            setTitle={setTitle}
            description={description}
            setDescription={setDescription}
            category={category}
            setCategory={setCategory}
            priority={priority}
            setPriority={setPriority}
          />
        );
      case 1:
        return (
          <ScheduleStep
            frequency={frequency}
            setFrequency={setFrequency}
            cronExpression={cronExpression}
            setCronExpression={setCronExpression}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            timezone={timezone}
            setTimezone={setTimezone}
          />
        );
      case 2:
        return (
          <AssignmentStep
            assignmentStrategy={assignmentStrategy}
            setAssignmentStrategy={setAssignmentStrategy}
            defaultOwnerId={defaultOwnerId}
            setDefaultOwnerId={setDefaultOwnerId}
            defaultTeamId={defaultTeamId}
            setDefaultTeamId={setDefaultTeamId}
            requiresAcknowledgment={requiresAcknowledgment}
            setRequiresAcknowledgment={setRequiresAcknowledgment}
            teamMembers={(members || []).map((m) => ({
              id: m.developer_id,
              name: m.developer_name || m.developer_email || "Unknown",
              email: m.developer_email || "",
            }))}
            teams={(teams || []).map((t: any) => ({
              id: t.id,
              name: t.name,
            }))}
          />
        );
      case 3:
        return (
          <ReviewStep
            title={title}
            description={description}
            category={category}
            priority={priority}
            frequency={frequency}
            cronExpression={cronExpression}
            startDate={startDate}
            endDate={endDate}
            timezone={timezone}
            assignmentStrategy={assignmentStrategy}
            defaultOwnerName={defaultOwner?.developer_name || defaultOwner?.developer_email || ""}
            defaultTeamName={defaultTeam?.name || ""}
            requiresAcknowledgment={requiresAcknowledgment}
            onEdit={handleGoToStep}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-muted/50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">Create Reminder</h1>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="max-w-4xl mx-auto px-6 py-6">
        <ReminderWizardProgress
          steps={WIZARD_STEPS}
          currentStep={currentStep}
          onStepClick={handleGoToStep}
        />
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-6 py-6">
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {renderStep()}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>

          {currentStep < WIZARD_STEPS.length - 1 ? (
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-foreground bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canProceed() || isCreating}
              className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-foreground bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Reminder"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
