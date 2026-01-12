"use client";

import { Settings2 } from "lucide-react";

interface CustomizeButtonProps {
  onClick: () => void;
}

export function CustomizeButton({ onClick }: CustomizeButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 rounded-lg transition"
    >
      <Settings2 className="h-4 w-4" />
      Customize
    </button>
  );
}
