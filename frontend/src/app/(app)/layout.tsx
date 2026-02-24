"use client";

import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/layout/AppShell";
import { GlobalShortcuts } from "@/components/GlobalShortcuts";
import { CommandPalette } from "@/components/CommandPalette";
import { KeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { redirect } from "next/navigation";
import { useEffect, useState } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const [mounted, setMounted] = useState(false);
    const { user, logout, isLoading, isAuthenticated } = useAuth();

    // Prevent hydration mismatch by only rendering after client mount
    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (mounted && !isLoading && !isAuthenticated) {
            redirect("/");
        }
    }, [mounted, isLoading, isAuthenticated]);

    // Show loading state during SSR and initial client render
    if (!mounted || isLoading) {
        return (
            <div className="min-h-screen bg-background flex">
                {/* Sidebar skeleton */}
                <div className="hidden md:flex w-[220px] flex-col border-r border-border bg-muted/30 animate-pulse">
                    <div className="p-4 space-y-2">
                        <div className="h-8 w-32 bg-accent rounded-lg mb-6" />
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                            <div key={i} className="h-8 w-full bg-accent rounded-lg" />
                        ))}
                    </div>
                </div>
                {/* Main content skeleton */}
                <div className="flex-1 animate-pulse">
                    <div className="h-14 border-b border-border flex items-center px-6">
                        <div className="h-5 w-32 bg-accent rounded" />
                        <div className="ml-auto h-8 w-8 bg-accent rounded-full" />
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="h-8 w-48 bg-accent rounded" />
                        <div className="h-4 w-96 bg-accent rounded" />
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="h-32 bg-accent rounded-xl" />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) return null;

    return (
        <AppShell user={user} logout={logout}>
            <GlobalShortcuts />
            <CommandPalette />
            <KeyboardShortcutsHelp />
            {children}
        </AppShell>
    );
}
