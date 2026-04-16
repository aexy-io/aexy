"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface JsonBlockProps {
  content: Record<string, unknown>;
}

export function JsonBlock({ content }: JsonBlockProps) {
  const [expanded, setExpanded] = useState(true);
  const data = content.data || content;
  const jsonStr = typeof data === "string" ? data : JSON.stringify(data, null, 2);

  return (
    <div className="py-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        JSON
      </button>
      {expanded && (
        <pre className="text-xs bg-muted/50 p-3 rounded-md overflow-x-auto font-mono max-h-96 overflow-y-auto">
          {jsonStr}
        </pre>
      )}
    </div>
  );
}
