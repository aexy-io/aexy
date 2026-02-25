"use client";

import { CRMAttribute } from "@/lib/api";
import { getFieldTypeOrFallback } from "./registry";
import { AttributeConfig, FieldSurface } from "./types";
// Ensure all field types are registered
import "./register";

interface FieldRendererProps {
  value: unknown;
  attribute: CRMAttribute;
  surface?: FieldSurface;
}

/**
 * Universal field value renderer. Replaces all per-surface switch statements.
 *
 * Usage:
 *   <FieldRenderer value={record.values[attr.slug]} attribute={attr} surface="table_cell" />
 */
export function FieldRenderer({ value, attribute, surface = "detail_view" }: FieldRendererProps) {
  const fieldType = getFieldTypeOrFallback(attribute.attribute_type);
  const View = fieldType.view;
  const config = (attribute.config || {}) as AttributeConfig;
  return <View value={value} config={config} surface={surface} />;
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
