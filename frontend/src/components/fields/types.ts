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
 * Props passed to every field view (display) component.
 */
export interface FieldViewProps {
  value: unknown;
  config: AttributeConfig;
  surface: FieldSurface;
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
 * A registered field type definition.
 */
export interface FieldTypeDefinition {
  type: CRMAttributeType;
  label: string;
  /** React component for displaying the value */
  view: React.ComponentType<FieldViewProps>;
  /** React component for editing the value */
  edit: React.ComponentType<FieldEditProps>;
}
