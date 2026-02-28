"use client";

import { cn } from "@/lib/utils";

interface PresenceIndicatorProps {
  status: "online" | "away" | "offline";
  className?: string;
}

export function PresenceIndicator({ status, className }: PresenceIndicatorProps) {
  return (
    <span
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full border border-background",
        status === "online" && "bg-green-500",
        status === "away" && "bg-yellow-500",
        status === "offline" && "bg-muted-foreground/40",
        className
      )}
    />
  );
}
