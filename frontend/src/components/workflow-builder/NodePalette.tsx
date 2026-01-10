"use client";

import { useState } from "react";
import {
  Zap,
  Play,
  GitBranch,
  Clock,
  Bot,
  Merge,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  FileText,
  Webhook,
  Mail,
  Calendar,
  MousePointer,
  FileEdit,
  FilePlus,
  Trash2,
  MessageSquare,
  Phone,
  CheckSquare,
  ListPlus,
  ListMinus,
  UserPlus,
  Target,
  Sparkles,
  Database,
  Bell,
} from "lucide-react";

interface NodePaletteProps {
  onAddNode: (type: string, subtype?: string) => void;
  onDragStart?: (event: React.DragEvent, type: string, subtype?: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface NodeCategory {
  type: string;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  subtypes: { value: string; label: string; icon: React.ElementType }[];
}

const nodeCategories: NodeCategory[] = [
  {
    type: "trigger",
    label: "Triggers",
    icon: Zap,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/20",
    subtypes: [
      { value: "record_created", label: "Record Created", icon: FilePlus },
      { value: "record_updated", label: "Record Updated", icon: FileEdit },
      { value: "record_deleted", label: "Record Deleted", icon: Trash2 },
      { value: "field_changed", label: "Field Changed", icon: FileText },
      { value: "stage_changed", label: "Stage Changed", icon: GitBranch },
      { value: "scheduled", label: "Scheduled", icon: Calendar },
      { value: "webhook_received", label: "Webhook Received", icon: Webhook },
      { value: "form_submitted", label: "Form Submitted", icon: FileText },
      { value: "email_received", label: "Email Received", icon: Mail },
      { value: "manual", label: "Manual", icon: MousePointer },
    ],
  },
  {
    type: "action",
    label: "Actions",
    icon: Play,
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
    subtypes: [
      { value: "update_record", label: "Update Record", icon: FileEdit },
      { value: "create_record", label: "Create Record", icon: FilePlus },
      { value: "delete_record", label: "Delete Record", icon: Trash2 },
      { value: "send_email", label: "Send Email", icon: Mail },
      { value: "send_slack", label: "Send Slack", icon: MessageSquare },
      { value: "send_sms", label: "Send SMS", icon: Phone },
      { value: "create_task", label: "Create Task", icon: CheckSquare },
      { value: "add_to_list", label: "Add to List", icon: ListPlus },
      { value: "remove_from_list", label: "Remove from List", icon: ListMinus },
      { value: "enroll_sequence", label: "Enroll in Sequence", icon: GitBranch },
      { value: "unenroll_sequence", label: "Unenroll from Sequence", icon: GitBranch },
      { value: "webhook_call", label: "Webhook Call", icon: Webhook },
      { value: "assign_owner", label: "Assign Owner", icon: UserPlus },
    ],
  },
  {
    type: "condition",
    label: "Conditions",
    icon: GitBranch,
    color: "text-amber-400",
    bgColor: "bg-amber-500/20",
    subtypes: [],
  },
  {
    type: "wait",
    label: "Wait",
    icon: Clock,
    color: "text-violet-400",
    bgColor: "bg-violet-500/20",
    subtypes: [
      { value: "duration", label: "Wait Duration", icon: Clock },
      { value: "datetime", label: "Wait Until Date", icon: Calendar },
      { value: "event", label: "Wait for Event", icon: Bell },
    ],
  },
  {
    type: "agent",
    label: "AI Agents",
    icon: Bot,
    color: "text-pink-400",
    bgColor: "bg-pink-500/20",
    subtypes: [
      { value: "sales_outreach", label: "Sales Outreach", icon: Target },
      { value: "lead_scoring", label: "Lead Scoring", icon: Sparkles },
      { value: "email_drafter", label: "Email Drafter", icon: Mail },
      { value: "data_enrichment", label: "Data Enrichment", icon: Database },
      { value: "custom", label: "Custom Agent", icon: Bot },
    ],
  },
  {
    type: "branch",
    label: "Branch",
    icon: Merge,
    color: "text-indigo-400",
    bgColor: "bg-indigo-500/20",
    subtypes: [],
  },
  {
    type: "join",
    label: "Join",
    icon: GitBranch,
    color: "text-teal-400",
    bgColor: "bg-teal-500/20",
    subtypes: [
      { value: "all", label: "Wait for All", icon: Merge },
      { value: "any", label: "Wait for Any", icon: Merge },
      { value: "count", label: "Wait for Count", icon: Merge },
    ],
  },
];

export function NodePalette({ onAddNode, onDragStart, isCollapsed, onToggleCollapse }: NodePaletteProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["trigger"]));

  const toggleCategory = (type: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const handleAddNode = (category: NodeCategory, subtype?: string) => {
    onAddNode(category.type, subtype);
  };

  const handleDragStart = (
    event: React.DragEvent,
    category: NodeCategory,
    subtype?: string
  ) => {
    // Set drag data for React Flow
    const nodeData = {
      type: category.type,
      subtype: subtype,
    };
    event.dataTransfer.setData("application/reactflow", JSON.stringify(nodeData));
    event.dataTransfer.effectAllowed = "move";

    // Call parent handler if provided
    if (onDragStart) {
      onDragStart(event, category.type, subtype);
    }
  };

  // Collapsed mode for mobile - just show icons
  if (isCollapsed) {
    return (
      <div className="w-14 bg-slate-800/50 border-r border-slate-700 flex flex-col">
        <button
          onClick={onToggleCollapse}
          className="p-3 border-b border-slate-700 hover:bg-slate-700/50"
          title="Expand palette"
        >
          <ChevronRight className="h-5 w-5 text-slate-400" />
        </button>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {nodeCategories.map((category) => (
            <button
              key={category.type}
              onClick={() => onAddNode(category.type)}
              className={`w-full p-2 rounded-lg hover:bg-slate-700/50 flex items-center justify-center ${category.bgColor}`}
              title={category.label}
            >
              <category.icon className={`h-5 w-5 ${category.color}`} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-slate-800/50 border-r border-slate-700 overflow-y-auto hidden md:block">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold">Node Palette</h3>
          <p className="text-xs text-slate-400 mt-1">
            Drag nodes to canvas or click to add
          </p>
        </div>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white lg:hidden"
            title="Collapse palette"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="p-2">
        {nodeCategories.map((category) => {
          const isExpanded = expandedCategories.has(category.type);
          const hasSubtypes = category.subtypes.length > 0;

          return (
            <div key={category.type} className="mb-1">
              <button
                onClick={() => {
                  if (hasSubtypes) {
                    toggleCategory(category.type);
                  } else {
                    handleAddNode(category);
                  }
                }}
                draggable={!hasSubtypes}
                onDragStart={(e) => {
                  if (!hasSubtypes) {
                    handleDragStart(e, category);
                  }
                }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                  hover:bg-slate-700/50 transition-colors group
                  ${hasSubtypes ? "" : "cursor-grab active:cursor-grabbing"}
                `}
              >
                <div className={`p-1.5 rounded-lg ${category.bgColor}`}>
                  <category.icon className={`h-4 w-4 ${category.color}`} />
                </div>
                <span className="text-slate-200 font-medium text-sm flex-1 text-left">
                  {category.label}
                </span>
                {hasSubtypes && (
                  <span className="text-slate-400">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </span>
                )}
              </button>

              {hasSubtypes && isExpanded && (
                <div className="ml-4 mt-1 space-y-0.5">
                  {category.subtypes.map((subtype) => (
                    <button
                      key={subtype.value}
                      onClick={() => handleAddNode(category, subtype.value)}
                      draggable
                      onDragStart={(e) => handleDragStart(e, category, subtype.value)}
                      className={`
                        w-full flex items-center gap-2 px-3 py-2 rounded-lg
                        hover:bg-slate-700/50 transition-colors
                        cursor-grab active:cursor-grabbing
                      `}
                    >
                      <subtype.icon className={`h-3.5 w-3.5 ${category.color}`} />
                      <span className="text-slate-300 text-sm">
                        {subtype.label}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
