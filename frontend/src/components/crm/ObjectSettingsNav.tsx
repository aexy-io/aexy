"use client";

import { useState } from "react";
import {
  Settings,
  Palette,
  Database,
  ChevronLeft,
  Building2,
  Users,
  DollarSign,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CRMObject, CRMObjectType } from "@/lib/api";

export type SettingsTab = "configuration" | "appearance" | "attributes";

interface Tab {
  id: SettingsTab;
  label: string;
  icon: React.ReactNode;
}

const tabs: Tab[] = [
  { id: "configuration", label: "Configuration", icon: <Settings className="h-4 w-4" /> },
  { id: "appearance", label: "Appearance", icon: <Palette className="h-4 w-4" /> },
  { id: "attributes", label: "Attributes", icon: <Database className="h-4 w-4" /> },
];

const objectTypeIcons: Record<CRMObjectType, React.ReactNode> = {
  company: <Building2 className="h-5 w-5" />,
  person: <Users className="h-5 w-5" />,
  deal: <DollarSign className="h-5 w-5" />,
  custom: <LayoutGrid className="h-5 w-5" />,
};

interface ObjectSettingsNavProps {
  object: CRMObject;
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onBack?: () => void;
  className?: string;
}

export function ObjectSettingsNav({
  object,
  activeTab,
  onTabChange,
  onBack,
  className,
}: ObjectSettingsNavProps) {
  const icon = objectTypeIcons[object.object_type as CRMObjectType] || objectTypeIcons.custom;

  return (
    <div className={cn("bg-muted/50 border-b border-border", className)}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/50">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 -ml-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-purple-400"
            style={{ backgroundColor: object.color ? `${object.color}20` : "rgba(168, 85, 247, 0.2)" }}
          >
            {icon}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{object.name}</h2>
            <p className="text-sm text-muted-foreground">
              {object.record_count} records • {object.attributes?.length || 0} attributes
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "text-foreground border-purple-500"
                : "text-muted-foreground border-transparent hover:text-foreground hover:border-border"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Vertical navigation for sidebar layout
export function ObjectSettingsNavVertical({
  objects,
  selectedObject,
  onSelectObject,
  className,
}: {
  objects: CRMObject[];
  selectedObject: CRMObject | null;
  onSelectObject: (object: CRMObject) => void;
  className?: string;
}) {
  return (
    <div className={cn("bg-muted/30 border-r border-border w-64", className)}>
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Objects
        </h3>
      </div>
      <div className="p-2 space-y-1">
        {objects.map((object) => {
          const icon = objectTypeIcons[object.object_type as CRMObjectType] || objectTypeIcons.custom;
          const isSelected = selectedObject?.id === object.id;

          return (
            <button
              key={object.id}
              onClick={() => onSelectObject(object)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                isSelected
                  ? "bg-purple-500/20 text-foreground"
                  : "text-foreground hover:bg-accent/50"
              )}
            >
              <div className={cn("text-muted-foreground", isSelected && "text-purple-400")}>
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{object.name}</div>
                <div className="text-xs text-muted-foreground">
                  {object.record_count} records
                </div>
              </div>
              {object.is_system && (
                <span className="px-1.5 py-0.5 bg-accent rounded text-xs text-muted-foreground">
                  System
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
