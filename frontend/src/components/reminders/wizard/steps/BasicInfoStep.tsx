"use client";

import { ReminderCategory, ReminderPriority } from "@/lib/api";
import { ReminderCategoryBadge } from "@/components/reminders/shared/ReminderCategoryBadge";
import { ReminderPriorityBadge } from "@/components/reminders/shared/ReminderPriorityBadge";
import { cn } from "@/lib/utils";

const CATEGORIES: { value: ReminderCategory; description: string }[] = [
  { value: "compliance", description: "Regulatory compliance tasks" },
  { value: "review", description: "Periodic reviews and assessments" },
  { value: "audit", description: "Internal or external audits" },
  { value: "security", description: "Security checks and updates" },
  { value: "training", description: "Training and certifications" },
  { value: "maintenance", description: "System maintenance tasks" },
  { value: "reporting", description: "Reports and documentation" },
  { value: "custom", description: "Custom reminder type" },
];

const PRIORITIES: { value: ReminderPriority; description: string }[] = [
  { value: "critical", description: "Must be completed immediately" },
  { value: "high", description: "Important, complete soon" },
  { value: "medium", description: "Standard priority" },
  { value: "low", description: "Can be done when convenient" },
];

interface BasicInfoStepProps {
  title: string;
  setTitle: (title: string) => void;
  description: string;
  setDescription: (description: string) => void;
  category: ReminderCategory;
  setCategory: (category: ReminderCategory) => void;
  priority: ReminderPriority;
  setPriority: (priority: ReminderPriority) => void;
}

export function BasicInfoStep({
  title,
  setTitle,
  description,
  setDescription,
  category,
  setCategory,
  priority,
  setPriority,
}: BasicInfoStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Basic Information</h2>
        <p className="text-muted-foreground">
          Provide basic details about this reminder
        </p>
      </div>

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Title <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Quarterly Security Review"
          className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what needs to be done..."
          rows={3}
          className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
        />
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-3">
          Category <span className="text-red-400">*</span>
        </label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={cn(
                "p-3 rounded-lg border text-left transition-all",
                category === cat.value
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-border hover:border-border"
              )}
            >
              <ReminderCategoryBadge category={cat.value} size="sm" />
              <p className="text-xs text-muted-foreground mt-2">{cat.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Priority */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-3">
          Priority <span className="text-red-400">*</span>
        </label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {PRIORITIES.map((prio) => (
            <button
              key={prio.value}
              onClick={() => setPriority(prio.value)}
              className={cn(
                "p-3 rounded-lg border text-left transition-all",
                priority === prio.value
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-border hover:border-border"
              )}
            >
              <ReminderPriorityBadge priority={prio.value} size="sm" />
              <p className="text-xs text-muted-foreground mt-2">{prio.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
