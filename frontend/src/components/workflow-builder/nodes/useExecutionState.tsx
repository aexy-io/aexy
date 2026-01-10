"use client";

import { CheckCircle2, XCircle, Loader2, AlertCircle, SkipForward } from "lucide-react";

export type ExecutionStatus = "idle" | "pending" | "running" | "success" | "failed" | "skipped";

interface ExecutionStateData {
  executionStatus?: ExecutionStatus;
  executionDurationMs?: number;
  hasError?: boolean;
  errorMessage?: string;
}

interface ExecutionStateResult {
  isRunning: boolean;
  isSuccess: boolean;
  isFailed: boolean;
  isSkipped: boolean;
  getStatusStyles: (baseColor: string, selectedStyle: string, defaultStyle: string) => string;
  StatusIndicator: React.ReactNode;
  DurationBadge: React.ReactNode;
}

export function useExecutionState(data: ExecutionStateData): ExecutionStateResult {
  const executionStatus = data.executionStatus || "idle";
  const isRunning = executionStatus === "running";
  const isSuccess = executionStatus === "success";
  const isFailed = executionStatus === "failed";
  const isSkipped = executionStatus === "skipped";
  const hasError = data.hasError;

  const getStatusStyles = (baseColor: string, selectedStyle: string, defaultStyle: string) => {
    if (isRunning) return "border-blue-400 shadow-blue-500/30 animate-pulse";
    if (isSuccess) return `border-${baseColor}-400 shadow-${baseColor}-500/30`;
    if (isFailed) return "border-red-500 shadow-red-500/30";
    if (isSkipped) return "border-slate-500 shadow-slate-500/20 opacity-60";
    if (hasError) return "border-red-500 shadow-red-500/20";
    return selectedStyle || defaultStyle;
  };

  const StatusIndicator = (
    <>
      {isRunning && (
        <div className="absolute -top-2 -right-2 p-1 bg-blue-500 rounded-full animate-pulse z-10">
          <Loader2 className="h-3 w-3 text-white animate-spin" />
        </div>
      )}
      {isSuccess && (
        <div className="absolute -top-2 -right-2 p-1 bg-emerald-500 rounded-full z-10">
          <CheckCircle2 className="h-3 w-3 text-white" />
        </div>
      )}
      {isFailed && (
        <div className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full z-10">
          <XCircle className="h-3 w-3 text-white" />
        </div>
      )}
      {isSkipped && (
        <div className="absolute -top-2 -right-2 p-1 bg-slate-500 rounded-full z-10">
          <SkipForward className="h-3 w-3 text-white" />
        </div>
      )}
      {hasError && !isRunning && !isSuccess && !isFailed && !isSkipped && (
        <div className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full z-10" title={data.errorMessage}>
          <AlertCircle className="h-3 w-3 text-white" />
        </div>
      )}
    </>
  );

  const DurationBadge = isSuccess && data.executionDurationMs !== undefined ? (
    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-slate-800/90 border border-emerald-500/30 rounded text-[9px] text-emerald-400 font-medium whitespace-nowrap z-10">
      {data.executionDurationMs}ms
    </div>
  ) : null;

  return {
    isRunning,
    isSuccess,
    isFailed,
    isSkipped,
    getStatusStyles,
    StatusIndicator,
    DurationBadge,
  };
}
