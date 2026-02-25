"use client";

import { CRMAttribute } from "@/lib/api";
import { getFieldTypeOrFallback } from "./registry";
import { AttributeConfig, ConditionalFormatRule, FieldDisplayConfig, FieldSurface } from "./types";
// Ensure all field types are registered
import "./register";

type FieldRendererProps = {
  value: unknown;
  surface?: FieldSurface;
  displayConfig?: FieldDisplayConfig;
} & (
  | { attribute: CRMAttribute; type?: never; config?: never }
  | { type: string; config?: Record<string, unknown>; attribute?: never }
);

/**
 * Evaluate conditional formatting rules against a value.
 * Returns the style from the first matching rule, or null.
 */
function evaluateConditionalFormat(
  value: unknown,
  rules?: ConditionalFormatRule[]
): ConditionalFormatRule["style"] | null {
  if (!rules || rules.length === 0) return null;

  for (const rule of rules) {
    const numVal = typeof value === "number" ? value : parseFloat(String(value));
    const strVal = String(value ?? "");

    let matches = false;
    switch (rule.operator) {
      case "equals":
        matches = value === rule.value || strVal === String(rule.value);
        break;
      case "not_equals":
        matches = value !== rule.value && strVal !== String(rule.value);
        break;
      case "gt":
        matches = !isNaN(numVal) && numVal > Number(rule.value);
        break;
      case "lt":
        matches = !isNaN(numVal) && numVal < Number(rule.value);
        break;
      case "gte":
        matches = !isNaN(numVal) && numVal >= Number(rule.value);
        break;
      case "lte":
        matches = !isNaN(numVal) && numVal <= Number(rule.value);
        break;
      case "contains":
        matches = strVal.toLowerCase().includes(String(rule.value ?? "").toLowerCase());
        break;
      case "is_empty":
        matches = value === null || value === undefined || value === "";
        break;
      case "is_not_empty":
        matches = value !== null && value !== undefined && value !== "";
        break;
    }

    if (matches) return rule.style;
  }

  return null;
}

/**
 * Universal field value renderer. Replaces all per-surface switch statements.
 *
 * Usage:
 *   <FieldRenderer value={record.values[attr.slug]} attribute={attr} surface="table_cell" />
 *   <FieldRenderer value={val} attribute={attr} surface="table_cell" displayConfig={{ variant: "progress_bar" }} />
 *   <FieldRenderer value={val} type="text" config={{}} surface="table_cell" />
 */
export function FieldRenderer({ value, surface = "detail_view", displayConfig, ...rest }: FieldRendererProps) {
  const attrType = rest.attribute ? rest.attribute.attribute_type : rest.type!;
  const rawConfig = rest.attribute ? (rest.attribute.config || {}) : (rest.config || {});
  const fieldType = getFieldTypeOrFallback(attrType);
  const View = fieldType.view;
  const config = rawConfig as AttributeConfig;

  // Resolve effective display config: explicit prop > field default
  const effectiveDisplayConfig = displayConfig;

  // Evaluate conditional formatting
  const conditionalStyle = evaluateConditionalFormat(
    value,
    effectiveDisplayConfig?.conditionalFormat
  );

  const rendered = (
    <View
      value={value}
      config={config}
      surface={surface}
      displayConfig={effectiveDisplayConfig}
    />
  );

  // Wrap with conditional formatting styles if a rule matched
  if (conditionalStyle) {
    return (
      <span
        style={{
          backgroundColor: conditionalStyle.bgColor,
          color: conditionalStyle.textColor,
          fontWeight: conditionalStyle.fontWeight,
        }}
        className="inline-flex items-center gap-1 rounded px-1"
      >
        {rendered}
      </span>
    );
  }

  return rendered;
}

interface FieldEditorProps {
  value: unknown;
  attribute: CRMAttribute;
  onChange: (value: unknown) => void;
  required?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

/**
 * Universal field value editor. Replaces all per-surface edit switch statements.
 *
 * Usage:
 *   <FieldEditor value={values[attr.slug]} attribute={attr} onChange={(v) => setValue(attr.slug, v)} />
 */
export function FieldEditor({ value, attribute, onChange, required, placeholder, autoFocus, className }: FieldEditorProps) {
  const fieldType = getFieldTypeOrFallback(attribute.attribute_type);
  const Edit = fieldType.edit;
  const config = (attribute.config || {}) as AttributeConfig;
  return (
    <Edit
      value={value}
      config={config}
      onChange={onChange}
      required={required}
      placeholder={placeholder || attribute.description || undefined}
      autoFocus={autoFocus}
      className={className}
    />
  );
}
