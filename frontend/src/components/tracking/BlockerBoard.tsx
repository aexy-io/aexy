"use client";

import { AlertTriangle, CheckCircle2, ArrowUp } from "lucide-react";
import { Blocker } from "@/lib/api";
import { BlockerCard } from "./BlockerCard";

interface BlockerBoardProps {
  blockers: Blocker[];
  isLoading?: boolean;
  onResolve?: (blockerId: string, notes?: string) => Promise<void>;
  onEscalate?: (blockerId: string, escalateToId: string, notes?: string) => Promise<void>;
  teamMembers?: Array<{ id: string; name: string }>;
  isResolving?: boolean;
  isEscalating?: boolean;
}

export function BlockerBoard({
  blockers,
  isLoading = false,
  onResolve,
  onEscalate,
  teamMembers = [],
  isResolving = false,
  isEscalating = false,
}: BlockerBoardProps) {
  const activeBlockers = blockers.filter((b) => b.status === "active");
  const escalatedBlockers = blockers.filter((b) => b.status === "escalated");
  const resolvedBlockers = blockers.filter((b) => b.status === "resolved");

  const columns = [
    {
      id: "active",
      title: "Active",
      icon: AlertTriangle,
      color: "text-red-400",
      bgColor: "bg-red-900/20",
      borderColor: "border-red-700/50",
      blockers: activeBlockers,
    },
    {
      id: "escalated",
      title: "Escalated",
      icon: ArrowUp,
      color: "text-purple-400",
      bgColor: "bg-purple-900/20",
      borderColor: "border-purple-700/50",
      blockers: escalatedBlockers,
    },
    {
      id: "resolved",
      title: "Resolved",
      icon: CheckCircle2,
      color: "text-green-400",
      bgColor: "bg-green-900/20",
      borderColor: "border-green-700/50",
      blockers: resolvedBlockers,
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {columns.map((column) => (
          <div key={column.id} className="bg-muted rounded-xl border border-border p-4">
            <div className="h-6 bg-accent rounded w-1/3 mb-4 animate-pulse" />
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="bg-accent rounded-lg p-4 animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {columns.map((column) => {
        const Icon = column.icon;
        return (
          <div key={column.id} className="bg-muted/50 rounded-xl border border-border">
            {/* Column Header */}
            <div className={`px-4 py-3 border-b ${column.borderColor} ${column.bgColor} rounded-t-xl`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${column.color}`} />
                  <span className={`font-medium ${column.color}`}>{column.title}</span>
                </div>
                <span className={`text-sm ${column.color}`}>
                  {column.blockers.length}
                </span>
              </div>
            </div>

            {/* Column Content */}
            <div className="p-3 space-y-3 max-h-[600px] overflow-y-auto">
              {column.blockers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Icon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No {column.title.toLowerCase()} blockers</p>
                </div>
              ) : (
                column.blockers.map((blocker) => (
                  <BlockerCard
                    key={blocker.id}
                    blocker={blocker}
                    onResolve={
                      column.id === "active" && onResolve
                        ? (notes) => onResolve(blocker.id, notes)
                        : undefined
                    }
                    onEscalate={
                      column.id === "active" && onEscalate
                        ? (escalateToId, notes) => onEscalate(blocker.id, escalateToId, notes)
                        : undefined
                    }
                    teamMembers={teamMembers}
                    isResolving={isResolving}
                    isEscalating={isEscalating}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
