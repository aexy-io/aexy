"use client";

import { useState } from "react";
import {
  Globe,
  User,
  Users,
  Filter,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TableRowAccessMode } from "@/lib/api";

const ROW_ACCESS_OPTIONS: {
  mode: TableRowAccessMode;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    mode: "all",
    label: "All rows visible",
    description: "Everyone with table access sees all rows",
    icon: <Globe className="h-4 w-4" />,
  },
  {
    mode: "owner_only",
    label: "Own rows only",
    description: "Each person only sees rows they created or own",
    icon: <User className="h-4 w-4" />,
  },
  {
    mode: "team_filtered",
    label: "Team filtered",
    description: "See rows owned by your team members",
    icon: <Users className="h-4 w-4" />,
  },
  {
    mode: "rule_based",
    label: "Rule-based",
    description: "Per-collaborator row filters applied",
    icon: <Filter className="h-4 w-4" />,
  },
];

interface RowAccessConfigProps {
  currentMode: TableRowAccessMode;
  onChangeMode: (mode: TableRowAccessMode) => Promise<void>;
  isUpdating?: boolean;
  disabled?: boolean;
}

export function RowAccessConfig({
  currentMode,
  onChangeMode,
  isUpdating = false,
  disabled = false,
}: RowAccessConfigProps) {
  const [pendingMode, setPendingMode] = useState<TableRowAccessMode | null>(null);

  const handleSelect = async (mode: TableRowAccessMode) => {
    if (mode === currentMode || disabled || isUpdating) return;
    setPendingMode(mode);
    try {
      await onChangeMode(mode);
    } finally {
      setPendingMode(null);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-medium text-foreground">Row-level access</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Controls which rows each collaborator can see. Enforced at the database level.
        </p>
      </div>
      <div className="space-y-1.5">
        {ROW_ACCESS_OPTIONS.map((option) => {
          const isSelected = currentMode === option.mode;
          const isPending = pendingMode === option.mode;

          return (
            <button
              key={option.mode}
              onClick={() => handleSelect(option.mode)}
              disabled={disabled || isUpdating}
              className={cn(
                "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors",
                isSelected
                  ? "border-purple-500/50 bg-purple-500/5"
                  : "border-transparent hover:border-border hover:bg-accent",
                (disabled || isUpdating) && "opacity-60 cursor-not-allowed"
              )}
            >
              <div
                className={cn(
                  "mt-0.5 p-1.5 rounded-md",
                  isSelected
                    ? "bg-purple-500/20 text-purple-400"
                    : "bg-accent text-muted-foreground"
                )}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : option.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      isSelected ? "text-foreground" : "text-foreground/80"
                    )}
                  >
                    {option.label}
                  </span>
                  {isSelected && (
                    <span className="text-[10px] font-medium text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{option.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
