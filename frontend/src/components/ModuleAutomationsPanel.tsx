"use client";

import { useRouter } from "next/navigation";
import {
  Zap,
  Plus,
  Play,
  Pause,
  Trash2,
  Clock,
  Edit2,
  ExternalLink,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAutomations } from "@/hooks/useAutomations";
import { Automation, AutomationModule } from "@/lib/api";

interface ModuleAutomationsPanelProps {
  module: AutomationModule;
  moduleLabel: string;
  /** Compact mode shows a summary card with link instead of full list */
  compact?: boolean;
}

function AutomationRow({
  automation,
  onToggle,
  onDelete,
  onEdit,
}: {
  automation: Automation;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      onClick={onEdit}
      className="flex items-center justify-between p-3 bg-muted/50 border border-border rounded-lg hover:border-blue-500/50 transition-colors cursor-pointer group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`p-1.5 rounded-md shrink-0 ${
            automation.is_active
              ? "bg-green-500/20 text-green-400"
              : "bg-accent text-muted-foreground"
          }`}
        >
          <Zap className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-foreground group-hover:text-blue-400 transition-colors truncate">
            {automation.name}
          </h4>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{automation.trigger_type.replace(/[._]/g, " ")}</span>
            <span>
              {automation.actions.length} action
              {automation.actions.length !== 1 ? "s" : ""}
            </span>
            {automation.total_runs > 0 && (
              <span className="flex items-center gap-1">
                <Play className="h-2.5 w-2.5" />
                {automation.total_runs} runs
              </span>
            )}
          </div>
        </div>
      </div>
      <div
        className="flex items-center gap-1 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onEdit}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-blue-500/20 hover:text-blue-400 transition-colors"
          title="Edit"
        >
          <Edit2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onToggle}
          className={`p-1.5 rounded-md transition-colors ${
            automation.is_active
              ? "text-green-400 hover:bg-green-500/20"
              : "text-muted-foreground hover:bg-muted"
          }`}
          title={automation.is_active ? "Pause" : "Activate"}
        >
          {automation.is_active ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-red-500/20 hover:text-red-400 transition-colors"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function ModuleAutomationsPanel({
  module,
  moduleLabel,
  compact = false,
}: ModuleAutomationsPanelProps) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const { automations, isLoading, toggleAutomation, deleteAutomation } =
    useAutomations(workspaceId, { module });

  const activeCount = automations.filter((a) => a.is_active).length;
  const totalRuns = automations.reduce((sum, a) => sum + (a.total_runs || 0), 0);

  const handleCreate = () => {
    router.push(`/automations/new?module=${module}`);
  };

  const handleViewAll = () => {
    router.push(`/automations?module=${module}`);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Delete this automation?")) {
      await deleteAutomation(id);
    }
  };

  // Compact mode: summary card with link
  if (compact) {
    return (
      <div className="bg-muted/50 border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-400" />
            <h3 className="text-sm font-medium text-foreground">Automations</h3>
          </div>
          <button
            onClick={handleCreate}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Create
          </button>
        </div>
        {isLoading ? (
          <div className="h-12 bg-accent rounded-lg animate-pulse" />
        ) : automations.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No automations yet.{" "}
            <button onClick={handleCreate} className="text-blue-400 hover:underline">
              Create one
            </button>{" "}
            to automate {moduleLabel.toLowerCase()} workflows.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
              <span>
                <span className="text-foreground font-medium">{automations.length}</span>{" "}
                automation{automations.length !== 1 ? "s" : ""}
              </span>
              <span>
                <span className="text-green-400 font-medium">{activeCount}</span> active
              </span>
              {totalRuns > 0 && (
                <span>
                  <span className="text-foreground font-medium">{totalRuns}</span> total runs
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {automations.slice(0, 3).map((a) => (
                <div
                  key={a.id}
                  onClick={() => router.push(`/automations/${a.id}`)}
                  className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-accent/50 cursor-pointer text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        a.is_active ? "bg-green-400" : "bg-muted-foreground"
                      }`}
                    />
                    <span className="text-foreground truncate">{a.name}</span>
                  </div>
                  <span className="text-muted-foreground shrink-0 ml-2">
                    {a.trigger_type.replace(/[._]/g, " ")}
                  </span>
                </div>
              ))}
            </div>
            {automations.length > 3 && (
              <button
                onClick={handleViewAll}
                className="flex items-center gap-1 mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                View all {automations.length} automations
                <ExternalLink className="h-3 w-3" />
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  // Full mode: complete list with management
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {moduleLabel} Automations
          </h3>
          <p className="text-sm text-muted-foreground">
            Automate workflows triggered by {moduleLabel.toLowerCase()} events
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleViewAll}
            className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in Automations
          </button>
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Automation
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : automations.length === 0 ? (
        <div className="text-center py-12 bg-muted/30 border border-dashed border-border rounded-xl">
          <Zap className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h4 className="text-foreground font-medium mb-1">
            No {moduleLabel.toLowerCase()} automations yet
          </h4>
          <p className="text-sm text-muted-foreground mb-4">
            Create automations to react to {moduleLabel.toLowerCase()} events automatically
          </p>
          <button
            onClick={handleCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            Create Automation
          </button>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="flex items-center gap-6 mb-4 text-sm">
            <span className="text-muted-foreground">
              <span className="text-foreground font-medium">{automations.length}</span>{" "}
              automation{automations.length !== 1 ? "s" : ""}
            </span>
            <span className="text-muted-foreground">
              <span className="text-green-400 font-medium">{activeCount}</span> active
            </span>
            {totalRuns > 0 && (
              <span className="text-muted-foreground">
                <span className="text-foreground font-medium">{totalRuns}</span> total runs
              </span>
            )}
          </div>

          {/* List */}
          <div className="space-y-2">
            {automations.map((automation) => (
              <AutomationRow
                key={automation.id}
                automation={automation}
                onToggle={() => toggleAutomation(automation.id)}
                onDelete={() => handleDelete(automation.id)}
                onEdit={() => router.push(`/automations/${automation.id}`)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
