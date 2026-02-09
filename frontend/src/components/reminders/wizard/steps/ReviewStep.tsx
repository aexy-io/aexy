"use client";

import {
  ReminderCategory,
  ReminderPriority,
  ReminderFrequency,
  ReminderAssignmentStrategy,
} from "@/lib/api";
import { ReminderCategoryBadge } from "@/components/reminders/shared/ReminderCategoryBadge";
import { ReminderPriorityBadge } from "@/components/reminders/shared/ReminderPriorityBadge";
import { FrequencyBadge } from "@/components/reminders/shared/RecurrenceDisplay";
import {
  Calendar,
  Clock,
  User,
  Users,
  Bell,
  AlertTriangle,
  Check,
} from "lucide-react";
import { format, parseISO } from "date-fns";

const ASSIGNMENT_STRATEGY_LABELS: Record<ReminderAssignmentStrategy, string> = {
  fixed: "Fixed Owner",
  round_robin: "Round Robin",
  on_call: "On-Call",
  domain_mapping: "Domain-Based",
  custom_rule: "Custom Rule",
};

interface ReviewStepProps {
  title: string;
  description: string;
  category: ReminderCategory;
  priority: ReminderPriority;
  frequency: ReminderFrequency;
  cronExpression: string;
  startDate: string;
  endDate: string;
  timezone: string;
  assignmentStrategy: ReminderAssignmentStrategy;
  defaultOwnerName: string;
  defaultTeamName: string;
  requiresAcknowledgment: boolean;
  onEdit: (step: number) => void;
}

export function ReviewStep({
  title,
  description,
  category,
  priority,
  frequency,
  cronExpression,
  startDate,
  endDate,
  timezone,
  assignmentStrategy,
  defaultOwnerName,
  defaultTeamName,
  requiresAcknowledgment,
  onEdit,
}: ReviewStepProps) {
  const sections = [
    {
      title: "Basic Information",
      step: 0,
      content: (
        <div className="space-y-3">
          <div>
            <span className="text-xs text-slate-500 block">Title</span>
            <span className="text-white">{title || "Not set"}</span>
          </div>
          {description && (
            <div>
              <span className="text-xs text-slate-500 block">Description</span>
              <span className="text-slate-300 text-sm">{description}</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div>
              <span className="text-xs text-slate-500 block mb-1">Category</span>
              <ReminderCategoryBadge category={category} />
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-1">Priority</span>
              <ReminderPriorityBadge priority={priority} />
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Schedule",
      step: 1,
      content: (
        <div className="space-y-3">
          <div>
            <span className="text-xs text-slate-500 block mb-1">Frequency</span>
            <FrequencyBadge frequency={frequency} />
            {frequency === "custom" && cronExpression && (
              <span className="ml-2 text-sm text-slate-400 font-mono">
                ({cronExpression})
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-slate-300">
              <Calendar className="h-4 w-4 text-slate-500" />
              <span className="text-sm">
                Starts: {startDate ? format(parseISO(startDate), "MMM d, yyyy") : "Not set"}
              </span>
            </div>
            {endDate && (
              <div className="flex items-center gap-2 text-slate-300">
                <Calendar className="h-4 w-4 text-slate-500" />
                <span className="text-sm">
                  Ends: {format(parseISO(endDate), "MMM d, yyyy")}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <Clock className="h-4 w-4 text-slate-500" />
            <span className="text-sm">Timezone: {timezone}</span>
          </div>
        </div>
      ),
    },
    {
      title: "Assignment",
      step: 2,
      content: (
        <div className="space-y-3">
          <div>
            <span className="text-xs text-slate-500 block">Strategy</span>
            <span className="text-white">
              {ASSIGNMENT_STRATEGY_LABELS[assignmentStrategy]}
            </span>
          </div>
          {assignmentStrategy === "fixed" && defaultOwnerName && (
            <div className="flex items-center gap-2 text-slate-300">
              <User className="h-4 w-4 text-slate-500" />
              <span className="text-sm">Assigned to: {defaultOwnerName}</span>
            </div>
          )}
          {["round_robin", "on_call", "domain_mapping"].includes(assignmentStrategy) &&
            defaultTeamName && (
              <div className="flex items-center gap-2 text-slate-300">
                <Users className="h-4 w-4 text-slate-500" />
                <span className="text-sm">Team: {defaultTeamName}</span>
              </div>
            )}
          <div className="flex items-center gap-2 text-slate-300">
            <Bell className="h-4 w-4 text-slate-500" />
            <span className="text-sm">
              Acknowledgment: {requiresAcknowledgment ? "Required" : "Not required"}
            </span>
          </div>
        </div>
      ),
    },
  ];

  // Validation warnings
  const warnings: string[] = [];
  if (!title) warnings.push("Title is required");
  if (!startDate) warnings.push("Start date is required");
  if (frequency === "custom" && !cronExpression) warnings.push("Cron expression is required for custom frequency");
  if (assignmentStrategy === "fixed" && !defaultOwnerName) warnings.push("Please select an owner");
  if (["round_robin", "on_call", "domain_mapping"].includes(assignmentStrategy) && !defaultTeamName) {
    warnings.push("Please select a team");
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white mb-2">Review</h2>
        <p className="text-slate-400">
          Review your reminder configuration before creating
        </p>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/50 rounded-lg">
          <div className="flex items-center gap-2 text-amber-400 mb-2">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">Please fix the following issues:</span>
          </div>
          <ul className="list-disc list-inside text-sm text-amber-300 space-y-1">
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-4">
        {sections.map((section) => (
          <div
            key={section.step}
            className="p-4 bg-slate-800/50 rounded-lg border border-slate-700"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-white">{section.title}</h3>
              <button
                onClick={() => onEdit(section.step)}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Edit
              </button>
            </div>
            {section.content}
          </div>
        ))}
      </div>

      {/* Ready to create */}
      {warnings.length === 0 && (
        <div className="p-4 bg-green-500/10 border border-green-500/50 rounded-lg flex items-center gap-3">
          <Check className="h-5 w-5 text-green-400" />
          <span className="text-green-300">
            Everything looks good! Click &quot;Create Reminder&quot; to finish.
          </span>
        </div>
      )}
    </div>
  );
}
