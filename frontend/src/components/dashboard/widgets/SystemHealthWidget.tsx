"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Activity,
  ChevronRight,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface HealthData {
  status: string;
  version?: string;
}

export function SystemHealthWidget() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        setIsLoading(true);
        const baseUrl =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
        const response = await fetch(`${baseUrl}/health`);
        if (response.ok) {
          const data = await response.json();
          setHealth(data);
          setError(false);
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHealth();

    // Refresh every 60 seconds
    const interval = setInterval(fetchHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-36 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const isOperational = !error && health;

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-emerald-500/10 rounded-lg shrink-0">
            <Activity className="h-4 w-4 text-emerald-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground truncate">System Health</h3>
        </div>
        <Link
          href="/settings"
          className="text-emerald-400 hover:text-emerald-300 text-xs flex items-center gap-0.5 transition whitespace-nowrap shrink-0"
        >
          Settings <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        <div className="space-y-4">
          {/* API Status */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 min-w-0">
              {isOperational ? (
                <CheckCircle className="h-4 w-4 text-emerald-400" />
              ) : (
                <XCircle className="h-4 w-4 text-red-400" />
              )}
              <div>
                <p className="text-sm font-medium text-foreground">API Status</p>
                <p className="text-xs text-muted-foreground">Backend services</p>
              </div>
            </div>
            <span
              className={`text-xs font-medium px-2 py-1 rounded-full ${
                isOperational
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-red-500/10 text-red-400"
              }`}
            >
              {isOperational ? "Operational" : "Degraded"}
            </span>
          </div>

          {/* Connection indicator */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 min-w-0">
              {isOperational ? (
                <div className="relative">
                  <div className="h-3 w-3 bg-emerald-400 rounded-full" />
                  <div className="absolute inset-0 h-3 w-3 bg-emerald-400 rounded-full animate-ping opacity-25" />
                </div>
              ) : (
                <div className="h-3 w-3 bg-red-400 rounded-full" />
              )}
              <div>
                <p className="text-sm font-medium text-foreground">Connection</p>
                <p className="text-xs text-muted-foreground">Real-time link</p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">
              {isOperational ? "Connected" : "Disconnected"}
            </span>
          </div>

          {/* Health details if available */}
          {health?.version && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground">
                API Version: <span className="text-foreground">{health.version}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
