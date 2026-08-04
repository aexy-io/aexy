"use client";

import { LayoutGrid, List, Moon, Sun, Monitor } from "lucide-react";
import { useTranslations } from "next-intl";

import { useSidebarLayout } from "@/hooks/useSidebarLayout";
import { SidebarLayoutType } from "@/config/sidebarLayouts";
import { useTheme, ThemeMode } from "@/hooks/useTheme";
import { useDashboardPreferences } from "@/hooks/useDashboardPreferences";
import { PresetType } from "@/config/dashboardPresets";
import { PresetSelector } from "@/components/dashboard/PresetSelector";
import {
  SettingsPage,
  SettingsSection,
  SettingsChoiceCard,
} from "@/components/settings/SettingsPrimitives";

const THEME_OPTIONS: { id: ThemeMode; icon: React.ReactNode }[] = [
  { id: "dark", icon: <Moon className="h-5 w-5" /> },
  { id: "light", icon: <Sun className="h-5 w-5" /> },
  { id: "system", icon: <Monitor className="h-5 w-5" /> },
];

// The preview is illustrative, not a live render of the sidebar — two entries
// per group is enough to show the shape without going stale every time a module
// is added.
const LAYOUT_OPTIONS: {
  id: SidebarLayoutType;
  icon: React.ReactNode;
  preview: string[];
}[] = [
  {
    id: "grouped",
    icon: <LayoutGrid className="h-5 w-5" />,
    preview: ["Dashboard", "Engineering", "  Tracking", "  Planning", "People", "  Reviews", "  Hiring", "Business", "  CRM", "  Email"],
  },
  {
    id: "flat",
    icon: <List className="h-5 w-5" />,
    preview: ["Dashboard", "Tracking", "Planning", "Tickets", "Reviews", "Hiring", "CRM", "Email", "Docs", "Forms"],
  },
];

function LayoutPreview({ items, label }: { items: string[]; label: string }) {
  return (
    <span className="mt-3 block rounded-lg border border-border bg-background/60 p-3">
      <span className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="block max-h-36 space-y-1 overflow-y-auto">
        {items.map((item, idx) => {
          const isChild = item.startsWith("  ");
          const text = item.trim();
          if (!isChild && idx > 0) {
            return (
              <span
                key={idx}
                className="block pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                {text}
              </span>
            );
          }
          return (
            <span
              key={idx}
              className={`block py-0.5 text-xs ${isChild ? "pl-3 text-muted-foreground" : "text-foreground/80"}`}
            >
              {text}
            </span>
          );
        })}
      </span>
    </span>
  );
}

export default function AppearanceSettingsPage() {
  const t = useTranslations("settingsAppearance");
  const { layout, setLayout } = useSidebarLayout();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { preferences, setPreset, isUpdating } = useDashboardPreferences();
  const currentPreset: PresetType = (preferences?.preset_type as PresetType) || "developer";

  return (
    <SettingsPage title={t("title")} description={t("description")}>
      <SettingsSection
        title={t("theme.title")}
        description={t("theme.description")}
        footer={
          theme === "system"
            ? t("theme.systemHint", { mode: resolvedTheme })
            : t("theme.autosaveHint")
        }
      >
        <div className="grid gap-3 md:grid-cols-3">
          {THEME_OPTIONS.map((option) => (
            <SettingsChoiceCard
              key={option.id}
              selected={theme === option.id}
              onSelect={() => setTheme(option.id)}
              title={t(`theme.options.${option.id}.name`)}
              description={t(`theme.options.${option.id}.description`)}
              icon={option.icon}
            />
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        title={t("workspaceView.title")}
        description={t("workspaceView.description")}
        footer={t("workspaceView.hint")}
      >
        <PresetSelector
          currentPreset={currentPreset}
          onSelectPreset={(preset: PresetType) => setPreset(preset)}
          isLoading={isUpdating}
        />
      </SettingsSection>

      <SettingsSection
        title={t("sidebarLayout.title")}
        description={t("sidebarLayout.description")}
        footer={t("theme.autosaveHint")}
      >
        <div className="grid gap-4 md:grid-cols-2">
          {LAYOUT_OPTIONS.map((option) => (
            <SettingsChoiceCard
              key={option.id}
              selected={layout === option.id}
              onSelect={() => setLayout(option.id)}
              title={t(`sidebarLayout.options.${option.id}.name`)}
              description={t(`sidebarLayout.options.${option.id}.description`)}
              icon={option.icon}
            >
              <LayoutPreview items={option.preview} label={t("sidebarLayout.preview")} />
            </SettingsChoiceCard>
          ))}
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
