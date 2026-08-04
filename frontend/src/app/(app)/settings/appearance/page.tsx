"use client";

import { LayoutGrid, List, Moon, Sun, Monitor } from "lucide-react";
import { useTranslations } from "next-intl";

import { useSidebarLayout } from "@/hooks/useSidebarLayout";
import { SidebarLayoutType } from "@/config/sidebarLayouts";
import { useTheme, ThemeMode } from "@/hooks/useTheme";
import { useDashboardPreferences } from "@/hooks/useDashboardPreferences";
import { useSidebarPersona } from "@/hooks/useSidebarPersona";
import { PERSONA_LABELS } from "@/config/appDefinitions";
import { PresetType } from "@/config/dashboardPresets";
import { PresetSelector } from "@/components/dashboard/PresetSelector";
import {
  SettingsPage,
  SettingsSection,
  SettingsChoiceCard,
} from "@/components/settings/SettingsPrimitives";

// The sidebar views on offer. "custom" is absent on purpose: it means "I
// rearranged my dashboard widgets", which says nothing about navigation.
const SIDEBAR_VIEW_OPTIONS = [
  "developer",
  "manager",
  "product",
  "hr",
  "support",
  "sales",
  "admin",
];

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
  const { chosenPersona, suggestedPersona, isPersonaDerived, setPersona } =
    useSidebarPersona();

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

      {/* The sidebar view, separate from the dashboard preset above. They used to
          be the same field, so navigation was decided by which *widgets* someone
          had picked — and since that defaults to "developer", everyone navigated
          as a developer until they found this page. */}
      <SettingsSection
        title={t("sidebarView.title")}
        description={t("sidebarView.description")}
        footer={
          isPersonaDerived && suggestedPersona
            ? t("sidebarView.derivedHint", {
                view: PERSONA_LABELS[suggestedPersona] || suggestedPersona,
              })
            : t("sidebarView.chosenHint")
        }
      >
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setPersona(null)}
            className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
              !chosenPersona
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {suggestedPersona
              ? t("sidebarView.followDepartment", {
                  view: PERSONA_LABELS[suggestedPersona] || suggestedPersona,
                })
              : t("sidebarView.followDepartmentUnset")}
          </button>
          {SIDEBAR_VIEW_OPTIONS.map((option) => (
            <button
              key={option}
              onClick={() => setPersona(option)}
              className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                chosenPersona === option
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {PERSONA_LABELS[option] || option}
            </button>
          ))}
        </div>
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
