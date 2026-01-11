"use client";

import React from "react";
import { AlertOctagon, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface BlockedBadgeProps {
  blockedBy?: {
    id: string;
    key: string;
    title: string;
  };
  isBlocking?: boolean;
  blockingCount?: number;
  onClick?: () => void;
  size?: "sm" | "md";
  className?: string;
}

export function BlockedBadge({
  blockedBy,
  isBlocking = false,
  blockingCount = 0,
  onClick,
  size = "sm",
  className,
}: BlockedBadgeProps) {
  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-xs gap-1",
    md: "px-2 py-1 text-sm gap-1.5",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
  };

  if (blockedBy) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        className={cn(
          "inline-flex items-center font-medium rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors",
          sizeClasses[size],
          className
        )}
        title={`Blocked by: ${blockedBy.key} - ${blockedBy.title}`}
      >
        <AlertOctagon className={iconSizes[size]} />
        <span>Blocked by {blockedBy.key}</span>
      </button>
    );
  }

  if (isBlocking && blockingCount > 0) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        className={cn(
          "inline-flex items-center font-medium rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors",
          sizeClasses[size],
          className
        )}
        title={`Blocking ${blockingCount} item(s)`}
      >
        <Link2 className={iconSizes[size]} />
        <span>Blocking {blockingCount}</span>
      </button>
    );
  }

  return null;
}
