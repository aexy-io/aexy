"use client";

import { ModuleError } from "@/components/ModuleError";

export default function AIAgentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ModuleError error={error} reset={reset} moduleName="AI Agents" />;
}
