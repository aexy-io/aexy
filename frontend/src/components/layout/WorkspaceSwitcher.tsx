"use client";

import { useState, useRef, useEffect } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";
import {
    Check,
    ChevronsUpDown,
    Plus,
    Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface WorkspaceSwitcherProps {
    collapsed?: boolean;
}

export function WorkspaceSwitcher({ collapsed = false }: WorkspaceSwitcherProps) {
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const {
        workspaces,
        currentWorkspace,
        switchWorkspace,
        workspacesLoading,
    } = useWorkspace();

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (workspaceId: string) => {
        switchWorkspace(workspaceId);
        setOpen(false);
    };

    if (workspacesLoading) {
        return (
            <div className={cn(
                "flex items-center gap-2 px-2 py-1.5",
                collapsed && "justify-center"
            )}>
                <div className="h-8 w-8 rounded-md bg-primary/10 animate-pulse" />
                {!collapsed && (
                    <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                )}
            </div>
        );
    }

    if (collapsed) {
        return (
            <div className="relative" ref={dropdownRef}>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 mx-auto"
                    title={currentWorkspace?.name || "Select workspace"}
                    onClick={() => setOpen(!open)}
                >
                    <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                        {currentWorkspace?.name?.[0]?.toUpperCase() || "W"}
                    </div>
                </Button>

                {open && (
                    <div className="absolute left-full top-0 ml-2 z-50 w-64 rounded-md border bg-card shadow-lg p-2">
                        <WorkspaceList
                            workspaces={workspaces}
                            currentWorkspaceId={currentWorkspace?.id}
                            onSelect={handleSelect}
                        />
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="relative" ref={dropdownRef}>
            <Button
                variant="ghost"
                className="w-full justify-between px-2 py-1.5 h-auto hover:bg-accent"
                onClick={() => setOpen(!open)}
            >
                <div className="flex items-center gap-2 min-w-0">
                    <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                        {currentWorkspace?.name?.[0]?.toUpperCase() || "W"}
                    </div>
                    <div className="flex flex-col items-start min-w-0">
                        <span className="text-sm font-medium truncate max-w-[140px]">
                            {currentWorkspace?.name || "Select workspace"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                            {workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""}
                        </span>
                    </div>
                </div>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Button>

            {open && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border bg-card shadow-lg p-2">
                    <WorkspaceList
                        workspaces={workspaces}
                        currentWorkspaceId={currentWorkspace?.id}
                        onSelect={handleSelect}
                    />
                </div>
            )}
        </div>
    );
}

interface WorkspaceListProps {
    workspaces: Array<{ id: string; name: string; slug?: string }>;
    currentWorkspaceId?: string;
    onSelect: (id: string) => void;
}

function WorkspaceList({ workspaces, currentWorkspaceId, onSelect }: WorkspaceListProps) {
    return (
        <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground px-2 py-1">
                Workspaces
            </p>
            <div className="max-h-[300px] overflow-y-auto space-y-0.5">
                {workspaces.map((workspace) => (
                    <button
                        key={workspace.id}
                        onClick={() => onSelect(workspace.id)}
                        className={cn(
                            "w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors",
                            "hover:bg-accent hover:text-accent-foreground",
                            currentWorkspaceId === workspace.id && "bg-accent"
                        )}
                    >
                        <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                            {workspace.name?.[0]?.toUpperCase() || "W"}
                        </div>
                        <span className="truncate flex-1 text-left">{workspace.name}</span>
                        {currentWorkspaceId === workspace.id && (
                            <Check className="h-4 w-4 text-primary shrink-0" />
                        )}
                    </button>
                ))}
            </div>

            <div className="border-t border-border my-2" />

            <Link
                href="/settings/organization"
                className="flex items-center gap-2 px-2 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
                <Settings className="h-4 w-4" />
                <span>Manage workspaces</span>
            </Link>

            <Link
                href="/onboarding/workspace"
                className="flex items-center gap-2 px-2 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
                <Plus className="h-4 w-4" />
                <span>Create workspace</span>
            </Link>
        </div>
    );
}
