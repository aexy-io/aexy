"use client";

import { ReminderAssignmentStrategy } from "@/lib/api";
import { User, Users, RefreshCw, Phone, Settings, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

const ASSIGNMENT_STRATEGIES: {
  value: ReminderAssignmentStrategy;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "fixed",
    label: "Fixed Owner",
    description: "Always assign to a specific person",
    icon: <User className="h-5 w-5" />,
  },
  {
    value: "round_robin",
    label: "Round Robin",
    description: "Rotate between team members",
    icon: <RefreshCw className="h-5 w-5" />,
  },
  {
    value: "on_call",
    label: "On-Call",
    description: "Assign to whoever is on-call",
    icon: <Phone className="h-5 w-5" />,
  },
  {
    value: "domain_mapping",
    label: "Domain-Based",
    description: "Assign based on domain expertise",
    icon: <Settings className="h-5 w-5" />,
  },
];

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

interface Team {
  id: string;
  name: string;
}

interface AssignmentStepProps {
  assignmentStrategy: ReminderAssignmentStrategy;
  setAssignmentStrategy: (strategy: ReminderAssignmentStrategy) => void;
  defaultOwnerId: string;
  setDefaultOwnerId: (id: string) => void;
  defaultTeamId: string;
  setDefaultTeamId: (id: string) => void;
  requiresAcknowledgment: boolean;
  setRequiresAcknowledgment: (requires: boolean) => void;
  teamMembers: TeamMember[];
  teams: Team[];
}

export function AssignmentStep({
  assignmentStrategy,
  setAssignmentStrategy,
  defaultOwnerId,
  setDefaultOwnerId,
  defaultTeamId,
  setDefaultTeamId,
  requiresAcknowledgment,
  setRequiresAcknowledgment,
  teamMembers,
  teams,
}: AssignmentStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Assignment</h2>
        <p className="text-muted-foreground">
          Configure who will be responsible for this reminder
        </p>
      </div>

      {/* Assignment Strategy */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-3">
          Assignment Strategy
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ASSIGNMENT_STRATEGIES.map((strategy) => (
            <button
              key={strategy.value}
              onClick={() => setAssignmentStrategy(strategy.value)}
              className={cn(
                "p-4 rounded-lg border text-left transition-all flex items-start gap-3",
                assignmentStrategy === strategy.value
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-border hover:border-border"
              )}
            >
              <div
                className={cn(
                  "p-2 rounded-lg",
                  assignmentStrategy === strategy.value
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-accent text-muted-foreground"
                )}
              >
                {strategy.icon}
              </div>
              <div>
                <span className="text-sm font-medium text-foreground block">
                  {strategy.label}
                </span>
                <p className="text-xs text-muted-foreground mt-1">{strategy.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Fixed Owner Selection */}
      {assignmentStrategy === "fixed" && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Select Owner
          </label>
          <select
            value={defaultOwnerId}
            onChange={(e) => setDefaultOwnerId(e.target.value)}
            className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none appearance-none"
          >
            <option value="">Select a team member...</option>
            {teamMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name} ({member.email})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Team Selection for round_robin, on_call, domain_mapping */}
      {["round_robin", "on_call", "domain_mapping"].includes(assignmentStrategy) && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Select Team
          </label>
          <select
            value={defaultTeamId}
            onChange={(e) => setDefaultTeamId(e.target.value)}
            className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none appearance-none"
          >
            <option value="">Select a team...</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Requires Acknowledgment */}
      <div className="p-4 bg-muted/50 rounded-lg border border-border">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={requiresAcknowledgment}
            onChange={(e) => setRequiresAcknowledgment(e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-border bg-accent text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
          />
          <div>
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-medium text-foreground">
                Require Acknowledgment
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              When enabled, the assignee must acknowledge receipt before the reminder is considered in-progress.
              This helps track response times and ensures accountability.
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}
