"use client";

import { ModuleError } from "@/components/ModuleError";

export default function McpError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ModuleError error={error} reset={reset} moduleName="MCP" />;
}
