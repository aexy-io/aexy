"use client";

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: "text-gray-500", bg: "bg-gray-400", label: "Pending" },
  running: { color: "text-blue-500", bg: "bg-blue-500", label: "Running" },
  completed: { color: "text-green-500", bg: "bg-green-500", label: "Completed" },
  failed: { color: "text-red-500", bg: "bg-red-500", label: "Failed" },
  waiting_human: { color: "text-yellow-500", bg: "bg-yellow-500", label: "Waiting" },
  active: { color: "text-green-500", bg: "bg-green-500", label: "Active" },
  archived: { color: "text-gray-500", bg: "bg-gray-400", label: "Archived" },
  paused: { color: "text-yellow-500", bg: "bg-yellow-500", label: "Paused" },
};

export function BlockStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${config.color}`}>
      <span
        className={`w-2 h-2 rounded-full ${config.bg} ${
          status === "running" ? "animate-pulse" : ""
        }`}
      />
      {config.label}
    </span>
  );
}
