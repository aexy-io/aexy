/**
 * Utility functions for applying form themes.
 */

import type {
  FormTheme,
  GlobalThemeSettings,
  ElementThemeSettings,
  ThankYouPageConfig,
} from "./formThemeTypes";
import { normalizeTheme, getDefaultThankYouPage } from "./formThemeTypes";
import { getPresetTheme } from "./formThemePresets";

// =============================================================================
// CSS VARIABLE GENERATION
// =============================================================================

/**
 * Converts a FormTheme to CSS custom properties (variables).
 * Returns an object that can be spread onto a style prop.
 */
export function themeToCSSSVariables(theme: FormTheme | unknown): Record<string, string> {
  const normalized = normalizeTheme(theme);
  const vars: Record<string, string> = {};

  // If using a preset, merge preset values with any overrides
  let effectiveTheme = normalized;
  if (normalized.preset) {
    const presetTheme = getPresetTheme(normalized.preset);
    effectiveTheme = mergeThemes(presetTheme, normalized);
  }

  const g = effectiveTheme.global;
  const el = effectiveTheme.elements;

  // Global colors
  if (g?.primary_color) vars["--form-primary"] = g.primary_color;
  if (g?.secondary_color) vars["--form-secondary"] = g.secondary_color;
  if (g?.background_color) vars["--form-background"] = g.background_color;
  if (g?.surface_color) vars["--form-surface"] = g.surface_color;
  if (g?.text_color) vars["--form-text"] = g.text_color;
  if (g?.text_secondary_color) vars["--form-text-secondary"] = g.text_secondary_color;
  if (g?.border_color) vars["--form-border"] = g.border_color;
  if (g?.error_color) vars["--form-error"] = g.error_color;
  if (g?.success_color) vars["--form-success"] = g.success_color;
  if (g?.font_family) vars["--form-font-family"] = g.font_family;
  if (g?.border_radius) vars["--form-border-radius"] = g.border_radius;

  // Spacing
  if (g?.spacing) {
    const spacingValues = { compact: "16px", normal: "24px", relaxed: "32px" };
    vars["--form-spacing"] = spacingValues[g.spacing] || "24px";
  }

  // Form container
  if (el?.form?.background_color) vars["--form-container-bg"] = el.form.background_color;
  if (el?.form?.padding) vars["--form-container-padding"] = el.form.padding;
  if (el?.form?.max_width) vars["--form-container-max-width"] = el.form.max_width;
  if (el?.form?.shadow) {
    const shadows = {
      none: "none",
      sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
      lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
      xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
    };
    vars["--form-container-shadow"] = shadows[el.form.shadow] || "none";
  }

  // Header
  if (el?.header?.text_color) vars["--form-header-color"] = el.header.text_color;
  if (el?.header?.font_size) vars["--form-header-size"] = el.header.font_size;
  if (el?.header?.font_weight) vars["--form-header-weight"] = el.header.font_weight;
  if (el?.header?.alignment) vars["--form-header-align"] = el.header.alignment;

  // Labels
  if (el?.labels?.text_color) vars["--form-label-color"] = el.labels.text_color;
  if (el?.labels?.font_size) vars["--form-label-size"] = el.labels.font_size;
  if (el?.labels?.font_weight) vars["--form-label-weight"] = el.labels.font_weight;
  if (el?.labels?.required_indicator_color) vars["--form-required-color"] = el.labels.required_indicator_color;

  // Inputs
  if (el?.inputs?.background_color) vars["--form-input-bg"] = el.inputs.background_color;
  if (el?.inputs?.border_color) vars["--form-input-border"] = el.inputs.border_color;
  if (el?.inputs?.text_color) vars["--form-input-text"] = el.inputs.text_color;
  if (el?.inputs?.placeholder_color) vars["--form-input-placeholder"] = el.inputs.placeholder_color;
  if (el?.inputs?.focus_border_color) vars["--form-input-focus-border"] = el.inputs.focus_border_color;
  if (el?.inputs?.focus_ring_color) vars["--form-input-focus-ring"] = el.inputs.focus_ring_color;
  if (el?.inputs?.border_radius) vars["--form-input-radius"] = el.inputs.border_radius;
  if (el?.inputs?.padding) vars["--form-input-padding"] = el.inputs.padding;
  if (el?.inputs?.font_size) vars["--form-input-size"] = el.inputs.font_size;

  // Primary button
  if (el?.buttons?.primary?.background_color) vars["--form-btn-primary-bg"] = el.buttons.primary.background_color;
  if (el?.buttons?.primary?.text_color) vars["--form-btn-primary-text"] = el.buttons.primary.text_color;
  if (el?.buttons?.primary?.hover_background_color) vars["--form-btn-primary-hover-bg"] = el.buttons.primary.hover_background_color;
  if (el?.buttons?.primary?.border_radius) vars["--form-btn-primary-radius"] = el.buttons.primary.border_radius;
  if (el?.buttons?.primary?.padding) vars["--form-btn-primary-padding"] = el.buttons.primary.padding;
  if (el?.buttons?.primary?.font_size) vars["--form-btn-primary-size"] = el.buttons.primary.font_size;
  if (el?.buttons?.primary?.font_weight) vars["--form-btn-primary-weight"] = el.buttons.primary.font_weight;

  // Secondary button
  if (el?.buttons?.secondary?.background_color) vars["--form-btn-secondary-bg"] = el.buttons.secondary.background_color;
  if (el?.buttons?.secondary?.text_color) vars["--form-btn-secondary-text"] = el.buttons.secondary.text_color;
  if (el?.buttons?.secondary?.border_color) vars["--form-btn-secondary-border"] = el.buttons.secondary.border_color;
  if (el?.buttons?.secondary?.hover_background_color) vars["--form-btn-secondary-hover-bg"] = el.buttons.secondary.hover_background_color;

  // Errors
  if (el?.errors?.text_color) vars["--form-error-text"] = el.errors.text_color;
  if (el?.errors?.background_color) vars["--form-error-bg"] = el.errors.background_color;
  if (el?.errors?.border_color) vars["--form-error-border"] = el.errors.border_color;
  if (el?.errors?.icon_color) vars["--form-error-icon"] = el.errors.icon_color;

  // Help text
  if (el?.help_text?.text_color) vars["--form-help-color"] = el.help_text.text_color;
  if (el?.help_text?.font_size) vars["--form-help-size"] = el.help_text.font_size;

  return vars;
}

/**
 * Deep merge two themes, with overrides taking precedence.
 */
export function mergeThemes(base: FormTheme, overrides: FormTheme): FormTheme {
  return {
    preset: overrides.preset ?? base.preset,
    global: { ...base.global, ...overrides.global } as GlobalThemeSettings,
    elements: mergeElements(base.elements, overrides.elements),
    custom_css: overrides.custom_css ?? base.custom_css,
  };
}

function mergeElements(
  base?: ElementThemeSettings,
  overrides?: ElementThemeSettings
): ElementThemeSettings | undefined {
  if (!base && !overrides) return undefined;
  if (!base) return overrides;
  if (!overrides) return base;

  return {
    form: { ...base.form, ...overrides.form },
    header: { ...base.header, ...overrides.header },
    labels: { ...base.labels, ...overrides.labels },
    inputs: { ...base.inputs, ...overrides.inputs },
    buttons: {
      primary: { ...base.buttons?.primary, ...overrides.buttons?.primary },
      secondary: { ...base.buttons?.secondary, ...overrides.buttons?.secondary },
    },
    errors: { ...base.errors, ...overrides.errors },
    help_text: { ...base.help_text, ...overrides.help_text },
  };
}

// =============================================================================
// THANK YOU PAGE HELPERS
// =============================================================================

/**
 * Normalize thank you page config from API.
 */
export function normalizeThankYouPage(config: unknown): ThankYouPageConfig {
  if (!config || typeof config !== "object" || Object.keys(config).length === 0) {
    return getDefaultThankYouPage();
  }
  return config as ThankYouPageConfig;
}

/**
 * Get the effective theme for the thank you page.
 * Uses form theme if use_form_theme is true, otherwise uses custom theme.
 */
export function getThankYouTheme(
  thankYouConfig: ThankYouPageConfig,
  formTheme: FormTheme
): FormTheme {
  if (thankYouConfig.use_form_theme !== false) {
    return formTheme;
  }
  return thankYouConfig.theme ?? formTheme;
}

// =============================================================================
// TIP TAP HELPERS
// =============================================================================

/**
 * Convert TipTap JSON to plain HTML string for rendering.
 */
export function tipTapToHtml(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";

  const document = doc as { type: string; content?: unknown[] };
  if (document.type !== "doc" || !document.content) return "";

  return renderNodes(document.content);
}

function renderNodes(nodes: unknown[]): string {
  return nodes.map(renderNode).join("");
}

function renderNode(node: unknown): string {
  if (!node || typeof node !== "object") return "";

  const n = node as {
    type: string;
    attrs?: Record<string, unknown>;
    content?: unknown[];
    text?: string;
    marks?: { type: string; attrs?: Record<string, unknown> }[];
  };

  if (n.type === "text") {
    let text = escapeHtml(n.text || "");
    if (n.marks) {
      for (const mark of n.marks) {
        switch (mark.type) {
          case "bold":
            text = `<strong>${text}</strong>`;
            break;
          case "italic":
            text = `<em>${text}</em>`;
            break;
          case "underline":
            text = `<u>${text}</u>`;
            break;
          case "link":
            text = `<a href="${escapeHtml(String(mark.attrs?.href || "#"))}" target="_blank" rel="noopener">${text}</a>`;
            break;
        }
      }
    }
    return text;
  }

  const children = n.content ? renderNodes(n.content) : "";

  switch (n.type) {
    case "paragraph":
      return `<p>${children}</p>`;
    case "heading": {
      const level = (n.attrs?.level as number) || 1;
      return `<h${level}>${children}</h${level}>`;
    }
    case "bulletList":
      return `<ul>${children}</ul>`;
    case "orderedList":
      return `<ol>${children}</ol>`;
    case "listItem":
      return `<li>${children}</li>`;
    case "hardBreak":
      return "<br>";
    default:
      return children;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// =============================================================================
// STYLE GENERATION
// =============================================================================

/**
 * Generate inline styles object from CSS variables.
 */
export function getFormContainerStyles(theme: FormTheme): React.CSSProperties {
  const vars = themeToCSSSVariables(theme);

  return {
    ...vars,
    backgroundColor: "var(--form-background, #f8fafc)",
    color: "var(--form-text, #1e293b)",
    fontFamily: "var(--form-font-family, Inter, system-ui, sans-serif)",
  } as React.CSSProperties;
}

/**
 * Generate styles for the form card/container.
 */
export function getFormCardStyles(): React.CSSProperties {
  return {
    backgroundColor: "var(--form-container-bg, var(--form-surface, #ffffff))",
    padding: "var(--form-container-padding, 32px)",
    maxWidth: "var(--form-container-max-width, 640px)",
    boxShadow: "var(--form-container-shadow, 0 10px 15px -3px rgb(0 0 0 / 0.1))",
    borderRadius: "var(--form-border-radius, 8px)",
  };
}

/**
 * Generate styles for form inputs.
 */
export function getInputStyles(): React.CSSProperties {
  return {
    backgroundColor: "var(--form-input-bg, #ffffff)",
    borderColor: "var(--form-input-border, #d1d5db)",
    color: "var(--form-input-text, var(--form-text))",
    borderRadius: "var(--form-input-radius, var(--form-border-radius, 6px))",
    padding: "var(--form-input-padding, 12px 16px)",
    fontSize: "var(--form-input-size, 16px)",
  };
}

/**
 * Generate styles for primary button.
 */
export function getPrimaryButtonStyles(): React.CSSProperties {
  return {
    backgroundColor: "var(--form-btn-primary-bg, var(--form-primary, #6366f1))",
    color: "var(--form-btn-primary-text, #ffffff)",
    borderRadius: "var(--form-btn-primary-radius, var(--form-border-radius, 6px))",
    padding: "var(--form-btn-primary-padding, 12px 24px)",
    fontSize: "var(--form-btn-primary-size, 16px)",
    fontWeight: "var(--form-btn-primary-weight, 600)" as React.CSSProperties["fontWeight"],
  };
}

/**
 * Generate styles for labels.
 */
export function getLabelStyles(): React.CSSProperties {
  return {
    color: "var(--form-label-color, var(--form-text))",
    fontSize: "var(--form-label-size, 14px)",
    fontWeight: "var(--form-label-weight, 500)" as React.CSSProperties["fontWeight"],
  };
}
