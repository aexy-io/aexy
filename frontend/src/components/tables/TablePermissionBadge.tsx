"use client";

import {
  Eye,
  MessageSquare,
  Pencil,
  Settings,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TablePermission } from "@/lib/api";

const PERMISSION_CONFIG: Record<
  TablePermission,
  { label: string; icon: React.ReactNode; color: string; bg: string }
> = {
  view: {
    label: "Viewer",
    icon: <Eye className="h-3 w-3" />,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
  },
  comment: {
    label: "Commenter",
    icon: <MessageSquare className="h-3 w-3" />,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10 border-cyan-500/20",
  },
  edit: {
    label: "Editor",
    icon: <Pencil className="h-3 w-3" />,
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/20",
  },
  manage: {
    label: "Manager",
    icon: <Settings className="h-3 w-3" />,
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/20",
  },
  admin: {
    label: "Admin",
    icon: <Shield className="h-3 w-3" />,
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/20",
  },
};

interface TablePermissionBadgeProps {
  permission: TablePermission;
  showLabel?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function TablePermissionBadge({
  permission,
  showLabel = true,
  size = "sm",
  className,
}: TablePermissionBadgeProps) {
  const config = PERMISSION_CONFIG[permission];
  if (!config) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        config.bg,
        config.color,
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        className
      )}
    >
      {config.icon}
      {showLabel && <span>{config.label}</span>}
    </div>
  );
}

/** Simple permission label for dropdowns/selects */
export function getPermissionLabel(permission: TablePermission): string {
  return PERMISSION_CONFIG[permission]?.label ?? permission;
}

/** Ordered list of permissions from lowest to highest */
export const PERMISSION_LEVELS: TablePermission[] = [
  "view",
  "comment",
  "edit",
  "manage",
  "admin",
];
