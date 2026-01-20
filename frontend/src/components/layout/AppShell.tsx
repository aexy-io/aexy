"use client";

import { Sidebar } from "./Sidebar";
import { cn } from "@/lib/utils";

interface AppShellProps {
    children: React.ReactNode;
    user?: {
        name?: string | null;
        email?: string | null;
    } | null;
    logout?: () => void;
}

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { Button } from "../ui/button";

export function AppShell({ children, user, logout }: AppShellProps) {
    return (
        <div className="flex h-screen overflow-hidden bg-background">
            {/* Mobile Navigation */}
            <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center h-16 px-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" className="mr-2">
                            <Menu className="h-5 w-5" />
                            <span className="sr-only">Toggle menu</span>
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="p-0 w-[240px]">
                        <Sidebar user={user} logout={logout} className="border-none w-full h-full" />
                    </SheetContent>
                </Sheet>
                <div className="font-semibold text-lg">Aexy</div>
            </div>

            <Sidebar user={user} logout={logout} className="hidden md:flex" />
            <main className="flex-1 overflow-y-auto md:pt-0 pt-16">
                <div className="container mx-auto p-6 md:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
