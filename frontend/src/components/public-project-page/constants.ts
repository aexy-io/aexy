import {
  FolderKanban,
  Layers,
  LayoutGrid,
  BookOpen,
  Bug,
  Target,
  Rocket,
  Map,
  Calendar,
  Vote,
  LucideIcon,
} from "lucide-react";
import { ProjectStatus } from "@/lib/api";

export const STATUS_COLORS: Record<ProjectStatus, { bg: string; text: string; dot: string }> = {
  active: { bg: "bg-green-500/10", text: "text-green-400", dot: "bg-green-500" },
  on_hold: { bg: "bg-amber-500/10", text: "text-amber-400", dot: "bg-amber-500" },
  completed: { bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-500" },
  archived: { bg: "bg-muted-foreground/10", text: "text-muted-foreground", dot: "bg-muted-foreground" },
};

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  archived: "Archived",
};

export interface TabConfig {
  id: string;
  label: string;
  icon: LucideIcon;
}

export const TAB_CONFIG: TabConfig[] = [
  { id: "overview", label: "Overview", icon: FolderKanban },
  { id: "backlog", label: "Backlog", icon: Layers },
  { id: "board", label: "Board", icon: LayoutGrid },
  { id: "stories", label: "Stories", icon: BookOpen },
  { id: "bugs", label: "Bugs", icon: Bug },
  { id: "goals", label: "Goals", icon: Target },
  { id: "releases", label: "Releases", icon: Rocket },
  { id: "timeline", label: "Timeline", icon: Calendar },
  { id: "roadmap", label: "Roadmap", icon: Vote },
  { id: "sprints", label: "Sprints", icon: Map },
];

export const PRIORITY_COLORS: Record<string, string> = {
  critical: "text-red-400 bg-red-900/30",
  high: "text-orange-400 bg-orange-900/30",
  medium: "text-yellow-400 bg-yellow-900/30",
  low: "text-muted-foreground bg-accent",
};

export const TASK_STATUS_COLORS: Record<string, string> = {
  todo: "bg-muted",
  in_progress: "bg-blue-500",
  review: "bg-purple-500",
  done: "bg-green-500",
  blocked: "bg-red-500",
};

export const SPRINT_STATUS_COLORS: Record<string, string> = {
  planning: "bg-blue-500",
  active: "bg-green-500",
  review: "bg-amber-500",
  retrospective: "bg-purple-500",
  completed: "bg-muted-foreground",
};
