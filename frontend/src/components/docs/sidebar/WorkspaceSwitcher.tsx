"use client";

import { useState } from "react";
import { ChevronDown, Check, Plus, Building2 } from "lucide-react";

interface Workspace {
  id: string;
  name: string;
  avatar_url?: string | null;
}

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  onSwitch: (workspaceId: string) => void;
  onCreateWorkspace?: () => void;
}

export function WorkspaceSwitcher({
  workspaces,
  currentWorkspace,
  onSwitch,
  onCreateWorkspace,
}: WorkspaceSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);

  const getInitial = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 rounded-lg transition-colors"
      >
        {/* Workspace Avatar */}
        <div className="h-6 w-6 rounded bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center flex-shrink-0">
          {currentWorkspace?.avatar_url ? (
            <img
              src={currentWorkspace.avatar_url}
              alt=""
              className="h-6 w-6 rounded"
            />
          ) : (
            <span className="text-xs font-semibold text-foreground">
              {currentWorkspace ? getInitial(currentWorkspace.name) : "?"}
            </span>
          )}
        </div>

        {/* Workspace Name */}
        <span className="flex-1 text-left text-sm font-medium text-foreground truncate">
          {currentWorkspace?.name || "Select Workspace"}
        </span>

        {/* Chevron */}
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-2 right-2 top-full mt-1 bg-muted border border-border rounded-lg shadow-xl z-20 py-1 max-h-80 overflow-auto">
            {/* Workspace List */}
            {workspaces.map((workspace) => (
              <button
                key={workspace.id}
                onClick={() => {
                  onSwitch(workspace.id);
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent/50 transition-colors"
              >
                {/* Avatar */}
                <div className="h-6 w-6 rounded bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center flex-shrink-0">
                  {workspace.avatar_url ? (
                    <img
                      src={workspace.avatar_url}
                      alt=""
                      className="h-6 w-6 rounded"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-foreground">
                      {getInitial(workspace.name)}
                    </span>
                  )}
                </div>

                {/* Name */}
                <span className="flex-1 text-left text-sm text-foreground truncate">
                  {workspace.name}
                </span>

                {/* Checkmark */}
                {currentWorkspace?.id === workspace.id && (
                  <Check className="h-4 w-4 text-primary-400" />
                )}
              </button>
            ))}

            {/* Divider */}
            {onCreateWorkspace && workspaces.length > 0 && (
              <div className="h-px bg-accent my-1" />
            )}

            {/* Create New */}
            {onCreateWorkspace && (
              <button
                onClick={() => {
                  onCreateWorkspace();
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent/50 transition-colors text-muted-foreground"
              >
                <div className="h-6 w-6 rounded border border-dashed border-border flex items-center justify-center">
                  <Plus className="h-3.5 w-3.5" />
                </div>
                <span className="text-sm">Create workspace</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
