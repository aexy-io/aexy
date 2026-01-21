"use client";

import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/layout/AppShell";
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
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                        <div className="w-12 h-12 border-4 border-primary/20 rounded-full"></div>
                        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
                    </div>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) return null;

    return (
        <AppShell user={user} logout={logout}>
            {children}
        </AppShell>
    );
}
