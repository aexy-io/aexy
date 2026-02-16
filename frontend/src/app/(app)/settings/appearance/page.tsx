"use client";

import { LayoutGrid, List, Check, Moon, Sun, Monitor } from "lucide-react";
import { useSidebarLayout } from "@/hooks/useSidebarLayout";
import { SidebarLayoutType, SIDEBAR_LAYOUTS } from "@/config/sidebarLayouts";
import { useTheme, ThemeMode } from "@/hooks/useTheme";

const THEME_OPTIONS: {
    id: ThemeMode;
    name: string;
    description: string;
    icon: React.ReactNode;
}[] = [
    {
        id: "dark",
        name: "Dark",
        description: "Dark background with light text",
        icon: <Moon className="h-5 w-5" />,
    },
    {
        id: "light",
        name: "Light",
        description: "Light background with dark text",
        icon: <Sun className="h-5 w-5" />,
    },
    {
        id: "system",
        name: "System",
        description: "Automatically match your system settings",
        icon: <Monitor className="h-5 w-5" />,
    },
];

const LAYOUT_OPTIONS: {
    id: SidebarLayoutType;
    name: string;
    description: string;
    icon: React.ReactNode;
    preview: string[];
}[] = [
    {
        id: "grouped",
        name: "Grouped",
        description: "Items organized by functional areas (Engineering, People, Business, Knowledge)",
        icon: <LayoutGrid className="h-5 w-5" />,
        preview: ["Dashboard", "Engineering", "  Tracking", "  Planning", "  Tickets", "People", "  Reviews", "  Hiring", "  Learning", "Business", "  CRM", "  Email", "Knowledge", "  Docs", "  Forms"],
    },
    {
        id: "flat",
        name: "Flat",
        description: "All features at the top level for quick access",
        icon: <List className="h-5 w-5" />,
        preview: ["Dashboard", "Tracking", "Planning", "Tickets", "Reviews", "Hiring", "CRM", "Learning", "Docs", "Forms"],
    },
];

export default function AppearanceSettingsPage() {
    const { layout, setLayout, isLoaded } = useSidebarLayout();
    const { theme, setTheme, resolvedTheme } = useTheme();

    const handleLayoutChange = (newLayout: SidebarLayoutType) => {
        setLayout(newLayout);
    };

    const handleThemeChange = (newTheme: ThemeMode) => {
        setTheme(newTheme);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-xl font-semibold text-foreground">Appearance</h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Customize how the application looks
                </p>
            </div>

            <div className="space-y-6">
                {/* Theme Section */}
                <div className="bg-card rounded-xl overflow-hidden border border-border">
                    <div className="p-4 border-b border-border">
                        <h3 className="text-foreground font-medium">Theme</h3>
                        <p className="text-muted-foreground text-sm mt-1">
                            Choose your preferred color scheme
                        </p>
                    </div>

                    <div className="p-4 grid gap-3 md:grid-cols-3">
                        {THEME_OPTIONS.map((option) => {
                            const isSelected = theme === option.id;

                            return (
                                <button
                                    key={option.id}
                                    onClick={() => handleThemeChange(option.id)}
                                    className={`relative p-4 rounded-lg border-2 text-left transition-all ${
                                        isSelected
                                            ? "border-primary bg-primary/10"
                                            : "border-border hover:border-border-strong bg-muted/30"
                                    }`}
                                >
                                    {/* Selected indicator */}
                                    {isSelected && (
                                        <div className="absolute top-3 right-3 p-1 bg-primary rounded-full">
                                            <Check className="h-3 w-3 text-primary-foreground" />
                                        </div>
                                    )}

                                    {/* Icon and name */}
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className={`p-2 rounded-lg ${isSelected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                                            {option.icon}
                                        </div>
                                        <h4 className="text-foreground font-medium">{option.name}</h4>
                                    </div>

                                    {/* Description */}
                                    <p className="text-muted-foreground text-sm">
                                        {option.description}
                                    </p>
                                </button>
                            );
                        })}
                    </div>

                    <div className="px-4 pb-4">
                        <p className="text-xs text-muted-foreground">
                            {theme === 'system'
                                ? `Currently using ${resolvedTheme} mode based on your system settings.`
                                : 'Changes are saved automatically and will take effect immediately.'}
                        </p>
                    </div>
                </div>

                {/* Sidebar Layout Section */}
                <div className="bg-card rounded-xl overflow-hidden border border-border">
                    <div className="p-4 border-b border-border">
                        <h3 className="text-foreground font-medium">Sidebar Layout</h3>
                        <p className="text-muted-foreground text-sm mt-1">
                            Choose how navigation items are organized in the sidebar
                        </p>
                    </div>

                    <div className="p-4 grid gap-4 md:grid-cols-2">
                        {LAYOUT_OPTIONS.map((option) => {
                            const isSelected = layout === option.id;

                            return (
                                <button
                                    key={option.id}
                                    onClick={() => handleLayoutChange(option.id)}
                                    className={`relative p-4 rounded-lg border-2 text-left transition-all ${
                                        isSelected
                                            ? "border-primary bg-primary/10"
                                            : "border-border hover:border-border-strong bg-muted/30"
                                    }`}
                                >
                                    {/* Selected indicator */}
                                    {isSelected && (
                                        <div className="absolute top-3 right-3 p-1 bg-primary rounded-full">
                                            <Check className="h-3 w-3 text-primary-foreground" />
                                        </div>
                                    )}

                                    {/* Header */}
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className={`p-2 rounded-lg ${isSelected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                                            {option.icon}
                                        </div>
                                        <div>
                                            <h4 className="text-foreground font-medium">{option.name}</h4>
                                        </div>
                                    </div>

                                    {/* Description */}
                                    <p className="text-muted-foreground text-sm mb-4">
                                        {option.description}
                                    </p>

                                    {/* Preview */}
                                    <div className="bg-muted rounded-lg p-3 border border-border">
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">
                                            Preview
                                        </p>
                                        <div className="space-y-1 max-h-40 overflow-y-auto">
                                            {option.preview.map((item, idx) => {
                                                const isSection = !item.startsWith("  ");
                                                const displayText = item.trim();

                                                if (isSection && option.id === "grouped" && idx > 0) {
                                                    return (
                                                        <p
                                                            key={idx}
                                                            className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium pt-2"
                                                        >
                                                            {displayText}
                                                        </p>
                                                    );
                                                }

                                                return (
                                                    <div
                                                        key={idx}
                                                        className={`text-xs py-0.5 ${
                                                            !isSection ? "pl-3 text-muted-foreground" : "text-foreground/80"
                                                        }`}
                                                    >
                                                        {displayText}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <div className="px-4 pb-4">
                        <p className="text-xs text-muted-foreground">
                            Changes are saved automatically and will take effect immediately.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
