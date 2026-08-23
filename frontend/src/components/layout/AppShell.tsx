"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";

interface AppShellProps {
    children: React.ReactNode;
    user?: {
        id?: string | null;
        name?: string | null;
        email?: string | null;
    } | null;
    logout?: () => void;
}

import { AppTopbar } from "./AppTopbar";
import { BreadcrumbOverrideProvider, type Breadcrumb } from "@/components/ui/page";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { Button } from "../ui/button";

export function AppShell({ children, user, logout }: AppShellProps) {
    // Chromeless / embedded mode for the macOS desktop app: when loaded with
    // ?embed=true the native app's own sidebar is the navigation, so we hide the
    // web sidebar + mobile header and render content full-width. The flag is
    // persisted so client-side route changes within the embed stay chromeless.
    const [embedded, setEmbedded] = useState(false);
    // A page that knows more than the pathname does (a sprint's name, a
    // candidate's) publishes its trail here and the topbar renders it instead of
    // the derived one. Kept in the shell so there is exactly one breadcrumb on
    // screen — see BreadcrumbOverrideProvider.
    const [crumbOverride, setCrumbOverride] = useState<Breadcrumb[] | null>(null);
    const onCrumbChange = useCallback((trail: Breadcrumb[] | null) => setCrumbOverride(trail), []);
    useEffect(() => {
        try {
            const isEmbed =
                new URLSearchParams(window.location.search).get("embed") === "true" ||
                window.localStorage.getItem("aexy_embed") === "1";
            if (isEmbed) {
                window.localStorage.setItem("aexy_embed", "1");
                setEmbedded(true);
            }
        } catch {
            /* SSR / no storage — render normal chrome */
        }
    }, []);

    return (
        <div className="flex h-screen overflow-hidden bg-background">
            {/* UX-A11Y-007: skip-to-content link. Hidden until focused;
                keyboard users can Tab once on page load and jump past
                the sidebar + header straight into #main-content. Helps
                screen readers and motor-impaired users avoid the 30+
                tab stops in the sidebar. */}
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground focus:shadow-lg focus-visible:ring-2 focus-visible:ring-ring"
            >
                Skip to main content
            </a>
            {!embedded && <Sidebar user={user} logout={logout} className="hidden md:flex" />}

            {/*
                The scroll container is this column, not <main>, so the topbar can
                stick to the top of it while the page scrolls underneath. <main>
                keeps the id and tabIndex the skip link targets.
            */}
            <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
                {!embedded && (
                    <AppTopbar
                        userId={user?.id}
                        breadcrumbs={crumbOverride}
                        // The mobile nav used to be a second 64px bar of its own,
                        // holding a hamburger and the word "Aexy" — 128px of
                        // chrome above the fold once the topbar existed, and the
                        // top bar said nothing about the page you were on. The
                        // trigger moves in here instead.
                        leading={
                            <Sheet>
                                <SheetTrigger asChild>
                                    <Button variant="ghost" size="icon" className="-ml-1 md:hidden">
                                        <Menu className="h-5 w-5" />
                                        <span className="sr-only">Toggle menu</span>
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="left" className="w-[240px] max-w-[85vw] p-0">
                                    <Sidebar user={user} logout={logout} className="h-full w-full border-none" />
                                </SheetContent>
                            </Sheet>
                        }
                    />
                )}
                <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
                    {/*
                        Deliberately no padding or width here: `PageShell` owns
                        both. This used to be `<div className="mx-0 p-0">`, which
                        is why 277 pages each invented their own and the app ended
                        up with seven content widths and five padding scales.
                    */}
                    <ErrorBoundary>
                        <BreadcrumbOverrideProvider onChange={onCrumbChange}>
                            {children}
                        </BreadcrumbOverrideProvider>
                    </ErrorBoundary>
                </main>
            </div>
        </div>
    );
}
