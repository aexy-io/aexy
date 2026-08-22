"use client";

import { useAuth } from "@/hooks/useAuth";
import { usePageVisitTracker } from "@/hooks/usePageVisitTracker";
import { useRecentApps } from "@/hooks/useRecentApps";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceAppToggleGuard } from "@/components/layout/WorkspaceAppToggleGuard";
import { GlobalShortcuts } from "@/components/GlobalShortcuts";
import { CommandPalette } from "@/components/CommandPalette";
import { FeedbackComposer } from "@/components/feedback/FeedbackComposer";
import { KeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { ChatWebSocketProvider } from "@/contexts/ChatWebSocketContext";
import { FloatingChatWidget } from "@/components/chat/FloatingChatWidget";
import { WorkspaceSearchPalette } from "@/components/search/WorkspaceSearchPalette";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { user, logout, isLoading, isAuthenticated, isResolved } = useAuth();

    // Track page visits for frequently-used sidebar section
    usePageVisitTracker();
    // Record recent-app visits for the docs sidebar's "Recent" strip.
    // Side-effect only — the docs sidebar reads from the same store
    // without re-recording on its own renders.
    useRecentApps();

    useEffect(() => {
        if (isResolved && !isAuthenticated) {
            // WS-075: clear React Query cache before the redirect fires so
            // ghost-cached workspace data from a prior session can't be
            // momentarily visible during the unresolved → unauthenticated
            // transition. `logout()` already does this, but a logout that
            // happened in another tab won't have cleared this tab's cache.
            queryClient.clear();
            router.push("/");
            return;
        }
        // Community-only accounts (signed in via a public forum) are walled off
        // from the internal app. The API enforces this server-side; here we just
        // avoid rendering the app shell for them and send them to the forum.
        if (isResolved && isAuthenticated && user?.account_type === "community") {
            router.replace("/community");
        }
    }, [isResolved, isAuthenticated, user?.account_type, router, queryClient]);

    // Show skeleton until auth state is definitively resolved
    if (!isResolved || isLoading) {
        return (
            <div className="flex">
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
        <ChatWebSocketProvider>
            <AppShell user={user} logout={logout}>
                <GlobalShortcuts />
                <CommandPalette />
                <KeyboardShortcutsHelp />
                <WorkspaceSearchPalette />
                {/* Mounted once for the whole app: opened from the command palette,
                    and from the access grid when somebody asks for an app we gate. */}
                <FeedbackComposer />
                <WorkspaceAppToggleGuard>{children}</WorkspaceAppToggleGuard>
                <FloatingChatWidget />
            </AppShell>
        </ChatWebSocketProvider>
    );
}
