import { CRMAttributeType } from "@/lib/api";

/**
 * Config stored on the backend CRMAttribute.config field.
 * Typed version of Record<string, unknown>.
 */
export interface AttributeConfig {
  // Select / multi_select / status
  options?: { value: string; label: string; color?: string }[];

  // Number / currency
  format?: string; // 'plain' | 'percent' | 'currency'
  precision?: number; // decimal places
  currency_code?: string; // 'USD', 'EUR', etc.

  // Rating
  max_rating?: number; // default 5
  rating_icon?: string; // 'star' | 'heart' | 'circle'

  // Date
  date_format?: string; // 'relative' | 'YYYY-MM-DD' | etc.

  // Record reference
  reference_object_id?: string;

  // Generic
  [key: string]: unknown;
}

/**
 * Surfaces where field values are rendered.
 */
export type FieldSurface =
  | "table_cell"
  | "detail_view"
  | "detail_edit"
  | "form_input"
  | "highlights"
  | "kanban_card";

/**
 * Conditional formatting rule — evaluated top-to-bottom, first match wins.
 */
export interface ConditionalFormatRule {
  operator:
    | "equals"
    | "not_equals"
    | "gt"
    | "lt"
    | "gte"
    | "lte"
    | "contains"
    | "is_empty"
    | "is_not_empty";
  value?: unknown;
  style: {
    bgColor?: string;
    textColor?: string;
    fontWeight?: "normal" | "bold";
    icon?: string;
  };
}

/**
 * Per-field display configuration — stored in saved view column config.
 * Different views of the same table can display the same field differently.
 */
export interface FieldDisplayConfig {
  /** Override display variant (e.g., 'progress_bar', 'pill', 'relative') */
  variant?: string;
  /** Column width in table view (pixels) */
  width?: number;
  /** Conditional formatting rules */
  conditionalFormat?: ConditionalFormatRule[];
  /** Number/currency: show +/- sign */
  showSign?: boolean;
  /** Number/currency: abbreviate large numbers (1.2M) */
  abbreviate?: boolean;
  /** Date: override format */
  dateFormat?: string;
  /** Rating: override icon */
  ratingIcon?: string;
  /** Rating: override max */
  maxRating?: number;
  /** Select: override option colors */
  colorMap?: Record<string, string>;
}

/**
 * Props passed to every field view (display) component.
 */
export interface FieldViewProps {
  value: unknown;
  config: AttributeConfig;
  surface: FieldSurface;
  displayConfig?: FieldDisplayConfig;
}

/**
 * Props passed to every field edit (input) component.
 */
export interface FieldEditProps {
  value: unknown;
  config: AttributeConfig;
  onChange: (value: unknown) => void;
  required?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

/**
 * A display variant definition for a field type.
 */
export interface DisplayVariant {
  id: string;
  label: string;
  description?: string;
}

/**
 * A registered field type definition.
 */
export interface FieldTypeDefinition {
  type: CRMAttributeType;
  label: string;
  /** React component for displaying the value */
  view: React.ComponentType<FieldViewProps>;
  /** React component for editing the value */
  edit: React.ComponentType<FieldEditProps>;
  /** Supported display variants for this field type */
  variants?: DisplayVariant[];
  /** Default variant per surface */
  defaultVariant?: Partial<Record<FieldSurface, string>>;
}
