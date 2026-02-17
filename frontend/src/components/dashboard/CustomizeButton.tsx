"use client";

import { Settings2 } from "lucide-react";

interface CustomizeButtonProps {
  onClick: () => void;
}

export function CustomizeButton({ onClick }: CustomizeButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-foreground hover:text-foreground bg-muted/50 hover:bg-muted border border-border/50 hover:border-border rounded-lg transition"
    >
      <Settings2 className="h-4 w-4" />
      Customize
    </button>
  );
}
