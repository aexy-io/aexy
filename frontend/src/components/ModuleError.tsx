"use client";

import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface ModuleErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  moduleName?: string;
}

export function ModuleError({ error, reset, moduleName }: ModuleErrorProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="flex items-center justify-center min-h-[400px] p-6">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <AlertTriangle className="h-7 w-7 text-red-500" />
        </div>

        <h2 className="text-lg font-semibold text-foreground mb-2">
          {moduleName ? `${moduleName} encountered an error` : "Something went wrong"}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          An unexpected error occurred. You can try again or go back to the dashboard.
        </p>

        <div className="flex items-center justify-center gap-3 mb-4">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground bg-accent rounded-lg hover:bg-accent/80 transition-colors"
          >
            <Home className="h-4 w-4" />
            Dashboard
          </a>
        </div>

        <div>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showDetails ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {showDetails ? "Hide" : "Show"} error details
          </button>

          {showDetails && (
            <div className="mt-3 p-3 bg-muted rounded-lg text-left">
              <p className="text-xs font-mono text-muted-foreground break-all">
                {error.message}
              </p>
              {error.digest && (
                <p className="text-xs font-mono text-muted-foreground/60 mt-1">
                  Digest: {error.digest}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
