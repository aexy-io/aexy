"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Type, TextCursor, MousePointer, AlertCircle, HelpCircle, Layout } from "lucide-react";
import { ColorPickerField } from "./ColorPickerField";
import type { ElementThemeSettings, ShadowOption, AlignmentOption, LogoPosition } from "@/lib/formThemeTypes";

interface ElementStyleEditorProps {
  settings: ElementThemeSettings | undefined;
  onChange: (settings: ElementThemeSettings) => void;
}

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleSection({ title, icon, children, defaultOpen = false }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center gap-3 bg-muted/50 hover:bg-muted transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm font-medium text-foreground">{title}</span>
      </button>
      {isOpen && <div className="p-4 bg-background/50 space-y-4">{children}</div>}
    </div>
  );
}

const SHADOW_OPTIONS: { value: ShadowOption; label: string }[] = [
  { value: "none", label: "None" },
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra Large" },
];

const ALIGNMENT_OPTIONS: { value: AlignmentOption; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

const LOGO_POSITION_OPTIONS: { value: LogoPosition; label: string }[] = [
  { value: "above", label: "Above Header" },
  { value: "left", label: "Left of Header" },
  { value: "right", label: "Right of Header" },
];

export function ElementStyleEditor({ settings = {}, onChange }: ElementStyleEditorProps) {
  const updateElement = <K extends keyof ElementThemeSettings>(
    key: K,
    value: Partial<ElementThemeSettings[K]>
  ) => {
    onChange({
      ...settings,
      [key]: { ...(settings[key] || {}), ...value },
    });
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">Element Styles</h3>

      {/* Form Container */}
      <CollapsibleSection title="Form Container" icon={<Layout className="w-4 h-4" />}>
        <div className="grid grid-cols-2 gap-4">
          <ColorPickerField
            label="Background"
            value={settings.form?.background_color}
            onChange={(v) => updateElement("form", { background_color: v })}
          />
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Shadow</label>
            <select
              value={settings.form?.shadow || ""}
              onChange={(e) => updateElement("form", { shadow: (e.target.value || undefined) as ShadowOption })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
            >
              <option value="">Default</option>
              {SHADOW_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Padding</label>
            <input
              type="text"
              value={settings.form?.padding || ""}
              onChange={(e) => updateElement("form", { padding: e.target.value || undefined })}
              placeholder="32px"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Max Width</label>
            <input
              type="text"
              value={settings.form?.max_width || ""}
              onChange={(e) => updateElement("form", { max_width: e.target.value || undefined })}
              placeholder="640px"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Header */}
      <CollapsibleSection title="Header" icon={<Type className="w-4 h-4" />}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Header Text</label>
            <input
              type="text"
              value={settings.header?.text || ""}
              onChange={(e) => updateElement("header", { text: e.target.value || undefined })}
              placeholder="Contact Us"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ColorPickerField
              label="Text Color"
              value={settings.header?.text_color}
              onChange={(v) => updateElement("header", { text_color: v })}
            />
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Alignment</label>
              <select
                value={settings.header?.alignment || ""}
                onChange={(e) => updateElement("header", { alignment: (e.target.value || undefined) as AlignmentOption })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
              >
                <option value="">Default</option>
                {ALIGNMENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Font Size</label>
              <input
                type="text"
                value={settings.header?.font_size || ""}
                onChange={(e) => updateElement("header", { font_size: e.target.value || undefined })}
                placeholder="28px"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Font Weight</label>
              <select
                value={settings.header?.font_weight || ""}
                onChange={(e) => updateElement("header", { font_weight: e.target.value || undefined })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
              >
                <option value="">Default</option>
                <option value="400">Normal (400)</option>
                <option value="500">Medium (500)</option>
                <option value="600">Semibold (600)</option>
                <option value="700">Bold (700)</option>
                <option value="800">Extra Bold (800)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Logo URL</label>
            <input
              type="url"
              value={settings.header?.logo_url || ""}
              onChange={(e) => updateElement("header", { logo_url: e.target.value || undefined })}
              placeholder="https://example.com/logo.png"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Logo Position</label>
            <select
              value={settings.header?.logo_position || ""}
              onChange={(e) => updateElement("header", { logo_position: (e.target.value || undefined) as LogoPosition })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
            >
              <option value="">Default (Above)</option>
              {LOGO_POSITION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </CollapsibleSection>

      {/* Labels */}
      <CollapsibleSection title="Labels" icon={<Type className="w-4 h-4" />}>
        <div className="grid grid-cols-2 gap-4">
          <ColorPickerField
            label="Text Color"
            value={settings.labels?.text_color}
            onChange={(v) => updateElement("labels", { text_color: v })}
          />
          <ColorPickerField
            label="Required Indicator"
            value={settings.labels?.required_indicator_color}
            onChange={(v) => updateElement("labels", { required_indicator_color: v })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Font Size</label>
            <input
              type="text"
              value={settings.labels?.font_size || ""}
              onChange={(e) => updateElement("labels", { font_size: e.target.value || undefined })}
              placeholder="14px"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Font Weight</label>
            <select
              value={settings.labels?.font_weight || ""}
              onChange={(e) => updateElement("labels", { font_weight: e.target.value || undefined })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
            >
              <option value="">Default</option>
              <option value="400">Normal (400)</option>
              <option value="500">Medium (500)</option>
              <option value="600">Semibold (600)</option>
              <option value="700">Bold (700)</option>
            </select>
          </div>
        </div>
      </CollapsibleSection>

      {/* Inputs */}
      <CollapsibleSection title="Input Fields" icon={<TextCursor className="w-4 h-4" />}>
        <div className="grid grid-cols-2 gap-4">
          <ColorPickerField
            label="Background"
            value={settings.inputs?.background_color}
            onChange={(v) => updateElement("inputs", { background_color: v })}
          />
          <ColorPickerField
            label="Border Color"
            value={settings.inputs?.border_color}
            onChange={(v) => updateElement("inputs", { border_color: v })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <ColorPickerField
            label="Text Color"
            value={settings.inputs?.text_color}
            onChange={(v) => updateElement("inputs", { text_color: v })}
          />
          <ColorPickerField
            label="Placeholder Color"
            value={settings.inputs?.placeholder_color}
            onChange={(v) => updateElement("inputs", { placeholder_color: v })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <ColorPickerField
            label="Focus Border"
            value={settings.inputs?.focus_border_color}
            onChange={(v) => updateElement("inputs", { focus_border_color: v })}
          />
          <ColorPickerField
            label="Focus Ring"
            value={settings.inputs?.focus_ring_color}
            onChange={(v) => updateElement("inputs", { focus_ring_color: v })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Border Radius</label>
            <input
              type="text"
              value={settings.inputs?.border_radius || ""}
              onChange={(e) => updateElement("inputs", { border_radius: e.target.value || undefined })}
              placeholder="6px"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Padding</label>
            <input
              type="text"
              value={settings.inputs?.padding || ""}
              onChange={(e) => updateElement("inputs", { padding: e.target.value || undefined })}
              placeholder="12px 16px"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Buttons */}
      <CollapsibleSection title="Buttons" icon={<MousePointer className="w-4 h-4" />}>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">Primary Button</p>
          <div className="grid grid-cols-2 gap-4">
            <ColorPickerField
              label="Background"
              value={settings.buttons?.primary?.background_color}
              onChange={(v) => updateElement("buttons", { primary: { ...settings.buttons?.primary, background_color: v } })}
            />
            <ColorPickerField
              label="Text Color"
              value={settings.buttons?.primary?.text_color}
              onChange={(v) => updateElement("buttons", { primary: { ...settings.buttons?.primary, text_color: v } })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ColorPickerField
              label="Hover Background"
              value={settings.buttons?.primary?.hover_background_color}
              onChange={(v) => updateElement("buttons", { primary: { ...settings.buttons?.primary, hover_background_color: v } })}
            />
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Border Radius</label>
              <input
                type="text"
                value={settings.buttons?.primary?.border_radius || ""}
                onChange={(e) => updateElement("buttons", { primary: { ...settings.buttons?.primary, border_radius: e.target.value || undefined } })}
                placeholder="6px"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground pt-2">Secondary Button</p>
          <div className="grid grid-cols-2 gap-4">
            <ColorPickerField
              label="Background"
              value={settings.buttons?.secondary?.background_color}
              onChange={(v) => updateElement("buttons", { secondary: { ...settings.buttons?.secondary, background_color: v } })}
            />
            <ColorPickerField
              label="Text Color"
              value={settings.buttons?.secondary?.text_color}
              onChange={(v) => updateElement("buttons", { secondary: { ...settings.buttons?.secondary, text_color: v } })}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Errors */}
      <CollapsibleSection title="Error Messages" icon={<AlertCircle className="w-4 h-4" />}>
        <div className="grid grid-cols-2 gap-4">
          <ColorPickerField
            label="Text Color"
            value={settings.errors?.text_color}
            onChange={(v) => updateElement("errors", { text_color: v })}
          />
          <ColorPickerField
            label="Background"
            value={settings.errors?.background_color}
            onChange={(v) => updateElement("errors", { background_color: v })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <ColorPickerField
            label="Border Color"
            value={settings.errors?.border_color}
            onChange={(v) => updateElement("errors", { border_color: v })}
          />
          <ColorPickerField
            label="Icon Color"
            value={settings.errors?.icon_color}
            onChange={(v) => updateElement("errors", { icon_color: v })}
          />
        </div>
      </CollapsibleSection>

      {/* Help Text */}
      <CollapsibleSection title="Help Text" icon={<HelpCircle className="w-4 h-4" />}>
        <div className="grid grid-cols-2 gap-4">
          <ColorPickerField
            label="Text Color"
            value={settings.help_text?.text_color}
            onChange={(v) => updateElement("help_text", { text_color: v })}
          />
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Font Size</label>
            <input
              type="text"
              value={settings.help_text?.font_size || ""}
              onChange={(e) => updateElement("help_text", { font_size: e.target.value || undefined })}
              placeholder="12px"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
            />
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
