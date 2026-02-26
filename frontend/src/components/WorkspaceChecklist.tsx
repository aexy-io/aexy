"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  FolderGit2,
  Users,
  Bot,
  Zap,
  Calendar,
  Link2,
  MessageSquare,
  LayoutDashboard,
  GraduationCap,
  UserPlus,
  ClipboardCheck,
  CalendarOff,
  Ticket,
  Building2,
  FileText,
  Layers,
} from "lucide-react";
import type { PresetType } from "@/config/dashboardPresets";
import type { DashboardPreferences } from "@/lib/api";

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  href: string;
  completed: boolean;
}

type ChecklistItemDef = Omit<ChecklistItem, "completed">;

// Shared items reused across presets
const SHARED_ITEMS: Record<string, ChecklistItemDef> = {
  "connect-repo": {
    id: "connect-repo",
    label: "Connect a repository",
    description: "Sync your GitHub repos for analysis",
    icon: FolderGit2,
    href: "/settings/repositories",
  },
  "invite-team": {
    id: "invite-team",
    label: "Invite team members",
    description: "Collaborate with your team",
    icon: Users,
    href: "/settings/organization",
  },
  "create-agent": {
    id: "create-agent",
    label: "Create an AI agent",
    description: "Automate tasks with intelligent agents",
    icon: Bot,
    href: "/agents/new",
  },
  "setup-automation": {
    id: "setup-automation",
    label: "Set up an automation",
    description: "Automate your workflows across modules",
    icon: Zap,
    href: "/automations/new",
  },
  "connect-calendar": {
    id: "connect-calendar",
    label: "Connect your calendar",
    description: "Enable booking and scheduling",
    icon: Calendar,
    href: "/booking/calendars",
  },
  "add-integration": {
    id: "add-integration",
    label: "Add an integration",
    description: "Connect Slack, Jira, Linear, or more",
    icon: Link2,
    href: "/settings/integrations",
  },
  "submit-standup": {
    id: "submit-standup",
    label: "Submit first standup",
    description: "Share what you're working on today",
    icon: MessageSquare,
    href: "/standups",
  },
  "set-learning-goal": {
    id: "set-learning-goal",
    label: "Set a learning goal",
    description: "Track your growth and skill development",
    icon: GraduationCap,
    href: "/goals",
  },
  "create-sprint": {
    id: "create-sprint",
    label: "Create a sprint",
    description: "Plan and track your team's work",
    icon: LayoutDashboard,
    href: "/sprints/new",
  },
  "setup-standups": {
    id: "setup-standups",
    label: "Set up standups",
    description: "Configure daily standup check-ins",
    icon: MessageSquare,
    href: "/standups/settings",
  },
  "setup-backlog": {
    id: "setup-backlog",
    label: "Set up a backlog",
    description: "Organize and prioritize upcoming work",
    icon: Layers,
    href: "/backlog",
  },
  "setup-hiring": {
    id: "setup-hiring",
    label: "Set up hiring pipeline",
    description: "Configure stages for recruiting candidates",
    icon: UserPlus,
    href: "/hiring",
  },
  "create-review-cycle": {
    id: "create-review-cycle",
    label: "Create a review cycle",
    description: "Set up performance review periods",
    icon: ClipboardCheck,
    href: "/reviews/new",
  },
  "configure-leave": {
    id: "configure-leave",
    label: "Configure leave policies",
    description: "Set up time-off and leave management",
    icon: CalendarOff,
    href: "/leave/settings",
  },
  "setup-tickets": {
    id: "setup-tickets",
    label: "Set up ticket pipeline",
    description: "Configure support ticket stages",
    icon: Ticket,
    href: "/tickets/settings",
  },
  "setup-crm": {
    id: "setup-crm",
    label: "Set up CRM pipeline",
    description: "Configure your sales pipeline stages",
    icon: Building2,
    href: "/crm/settings",
  },
  "setup-forms": {
    id: "setup-forms",
    label: "Set up forms",
    description: "Create intake forms for data collection",
    icon: FileText,
    href: "/forms/new",
  },
};

const PRESET_CHECKLIST_ITEMS: Record<PresetType, ChecklistItemDef[]> = {
  developer: [
    SHARED_ITEMS["connect-repo"],
    SHARED_ITEMS["submit-standup"],
    SHARED_ITEMS["set-learning-goal"],
    SHARED_ITEMS["connect-calendar"],
    SHARED_ITEMS["create-agent"],
    SHARED_ITEMS["add-integration"],
  ],
  manager: [
    SHARED_ITEMS["connect-repo"],
    SHARED_ITEMS["invite-team"],
    SHARED_ITEMS["create-sprint"],
    SHARED_ITEMS["setup-standups"],
    SHARED_ITEMS["create-agent"],
    SHARED_ITEMS["add-integration"],
  ],
  product: [
    SHARED_ITEMS["create-sprint"],
    SHARED_ITEMS["setup-backlog"],
    SHARED_ITEMS["connect-calendar"],
    SHARED_ITEMS["setup-automation"],
    SHARED_ITEMS["create-agent"],
    SHARED_ITEMS["add-integration"],
  ],
  hr: [
    SHARED_ITEMS["setup-hiring"],
    SHARED_ITEMS["create-review-cycle"],
    SHARED_ITEMS["invite-team"],
    SHARED_ITEMS["configure-leave"],
    SHARED_ITEMS["connect-calendar"],
    SHARED_ITEMS["add-integration"],
  ],
  support: [
    SHARED_ITEMS["setup-tickets"],
    SHARED_ITEMS["create-agent"],
    SHARED_ITEMS["setup-forms"],
    SHARED_ITEMS["add-integration"],
    SHARED_ITEMS["connect-calendar"],
    SHARED_ITEMS["invite-team"],
  ],
  sales: [
    SHARED_ITEMS["setup-crm"],
    SHARED_ITEMS["create-agent"],
    SHARED_ITEMS["setup-forms"],
    SHARED_ITEMS["add-integration"],
    SHARED_ITEMS["connect-calendar"],
    SHARED_ITEMS["invite-team"],
  ],
  admin: [
    SHARED_ITEMS["connect-repo"],
    SHARED_ITEMS["invite-team"],
    SHARED_ITEMS["create-agent"],
    SHARED_ITEMS["setup-automation"],
    SHARED_ITEMS["connect-calendar"],
    SHARED_ITEMS["add-integration"],
  ],
  custom: [
    SHARED_ITEMS["connect-repo"],
    SHARED_ITEMS["submit-standup"],
    SHARED_ITEMS["set-learning-goal"],
    SHARED_ITEMS["connect-calendar"],
    SHARED_ITEMS["create-agent"],
    SHARED_ITEMS["add-integration"],
  ],
};

export function getChecklistItems(presetType: PresetType): ChecklistItemDef[] {
  return PRESET_CHECKLIST_ITEMS[presetType] || PRESET_CHECKLIST_ITEMS.developer;
}

interface WorkspaceChecklistProps {
  onDismiss?: () => void;
  presetType?: PresetType;
  completedIds: string[];
  onMarkComplete: (id: string) => void;
}

export function WorkspaceChecklist({
  onDismiss,
  presetType = "developer",
  completedIds,
  onMarkComplete,
}: WorkspaceChecklistProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const checklistItems = useMemo(() => getChecklistItems(presetType), [presetType]);

  const items: ChecklistItem[] = checklistItems.map((item) => ({
    ...item,
    completed: completedIds.includes(item.id),
  }));

  const completedCount = items.filter((i) => i.completed).length;
  const progress = (completedCount / items.length) * 100;

  return (
    <div className="bg-muted/30 border border-border/50 rounded-xl overflow-hidden">
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="w-8 h-8 -rotate-90">
              <circle
                cx="16"
                cy="16"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-border"
              />
              <circle
                cx="16"
                cy="16"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray={`${progress * 0.88} 88`}
                className="text-primary transition-all duration-500"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-foreground">
              {completedCount}
            </span>
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">Getting Started</h3>
            <p className="text-xs text-muted-foreground">
              {completedCount}/{items.length} completed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss?.();
            }}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border/50">
          <div className="p-2 space-y-1">
            {items.map((item) => {
              const content = (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    item.completed
                      ? "opacity-60"
                      : "hover:bg-muted/50 cursor-pointer"
                  }`}
                >
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!item.completed) onMarkComplete(item.id);
                    }}
                    className="flex-shrink-0"
                  >
                    {item.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                    ) : (
                      <Circle className="w-5 h-5 text-border hover:text-primary transition-colors" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm ${
                        item.completed
                          ? "text-muted-foreground line-through"
                          : "text-foreground"
                      }`}
                    >
                      {item.label}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.description}
                    </p>
                  </div>
                  <item.icon
                    className={`w-4 h-4 flex-shrink-0 ${
                      item.completed ? "text-border" : "text-muted-foreground"
                    }`}
                  />
                </div>
              );

              if (!item.completed) {
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => onMarkComplete(item.id)}
                  >
                    {content}
                  </Link>
                );
              }
              return content;
            })}
          </div>

          {completedCount === items.length && (
            <div className="px-4 py-3 border-t border-border/50 bg-green-500/5">
              <div className="flex items-center gap-2 text-green-400">
                <Sparkles className="w-4 h-4" />
                <span className="text-sm font-medium">
                  All done! Your workspace is ready.
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function useShouldShowWorkspaceChecklist(
  presetType: PresetType = "developer",
  preferences?: DashboardPreferences | null,
) {
  if (!preferences) return false;
  if (preferences.checklist_dismissed) return false;

  const items = getChecklistItems(presetType);
  const completedIds = preferences.checklist_progress || [];
  const completedCount = items.filter((item) => completedIds.includes(item.id)).length;

  return completedCount < items.length;
}
