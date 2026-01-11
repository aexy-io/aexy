/**
 * TypeScript types for form theming and thank you page configuration.
 */

// =============================================================================
// THEME TYPES
// =============================================================================

export type ThemePreset = "light" | "dark" | "minimal" | "modern" | "colorful" | "corporate";
export type SpacingOption = "compact" | "normal" | "relaxed";
export type ShadowOption = "none" | "sm" | "md" | "lg" | "xl";
export type AlignmentOption = "left" | "center" | "right";
export type LogoPosition = "above" | "left" | "right";
export type AnimationType = "fade" | "slide" | "none";
export type ButtonStyle = "primary" | "secondary" | "link";
export type ButtonAction = "reload" | "redirect" | "close";
export type ImagePosition = "top" | "bottom" | "left" | "right";

// =============================================================================
// GLOBAL THEME SETTINGS
// =============================================================================

export interface GlobalThemeSettings {
  primary_color?: string;
  secondary_color?: string;
  background_color?: string;
  surface_color?: string;
  text_color?: string;
  text_secondary_color?: string;
  border_color?: string;
  error_color?: string;
  success_color?: string;
  font_family?: string;
  border_radius?: string;
  spacing?: SpacingOption;
}

// =============================================================================
// ELEMENT-LEVEL SETTINGS
// =============================================================================

export interface FormElementSettings {
  background_color?: string;
  padding?: string;
  max_width?: string;
  shadow?: ShadowOption;
}

export interface HeaderElementSettings {
  text?: string;
  text_color?: string;
  font_size?: string;
  font_weight?: string;
  alignment?: AlignmentOption;
  logo_url?: string;
  logo_position?: LogoPosition;
}

export interface LabelElementSettings {
  text_color?: string;
  font_size?: string;
  font_weight?: string;
  required_indicator_color?: string;
}

export interface InputElementSettings {
  background_color?: string;
  border_color?: string;
  text_color?: string;
  placeholder_color?: string;
  focus_border_color?: string;
  focus_ring_color?: string;
  border_radius?: string;
  padding?: string;
  font_size?: string;
}

export interface ButtonStyleSettings {
  background_color?: string;
  text_color?: string;
  border_color?: string;
  hover_background_color?: string;
  border_radius?: string;
  padding?: string;
  font_size?: string;
  font_weight?: string;
}

export interface ButtonElementSettings {
  primary?: ButtonStyleSettings;
  secondary?: ButtonStyleSettings;
}

export interface ErrorElementSettings {
  text_color?: string;
  background_color?: string;
  border_color?: string;
  icon_color?: string;
}

export interface HelpTextElementSettings {
  text_color?: string;
  font_size?: string;
}

export interface ElementThemeSettings {
  form?: FormElementSettings;
  header?: HeaderElementSettings;
  labels?: LabelElementSettings;
  inputs?: InputElementSettings;
  buttons?: ButtonElementSettings;
  errors?: ErrorElementSettings;
  help_text?: HelpTextElementSettings;
}

// =============================================================================
// COMPLETE FORM THEME
// =============================================================================

export interface FormTheme {
  preset?: ThemePreset | null;
  global?: GlobalThemeSettings;
  elements?: ElementThemeSettings;
  custom_css?: string | null;
}

// Legacy theme format for backwards compatibility
export interface LegacyFormTheme {
  primary_color?: string;
  background_color?: string;
  logo_url?: string;
  custom_css?: string;
  header_text?: string;
  font_family?: string;
}

// =============================================================================
// THANK YOU PAGE TYPES
// =============================================================================

export interface ThankYouImage {
  url?: string;
  alt?: string;
  position?: ImagePosition;
  max_width?: string;
}

export interface ThankYouButton {
  id?: string;
  text: string;
  action: ButtonAction;
  url?: string;
  style?: ButtonStyle;
}

export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export interface TipTapDocument {
  type: "doc";
  content: TipTapNode[];
}

export interface ThankYouContent {
  message?: TipTapDocument | null;
  show_ticket_number?: boolean;
  ticket_number_label?: string;
  image?: ThankYouImage;
  buttons?: ThankYouButton[];
}

export interface ThankYouLayout {
  alignment?: "center" | "left";
  max_width?: string;
  padding?: string;
  animation?: AnimationType;
}

export interface ThankYouPageConfig {
  use_form_theme?: boolean;
  theme?: FormTheme;
  content?: ThankYouContent;
  layout?: ThankYouLayout;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

export interface ThemePresetDefinition {
  id: ThemePreset;
  name: string;
  description: string;
  theme: FormTheme;
}

// Helper to check if theme is legacy format
export function isLegacyTheme(theme: unknown): theme is LegacyFormTheme {
  if (!theme || typeof theme !== "object") return false;
  const t = theme as Record<string, unknown>;
  return (
    ("primary_color" in t || "background_color" in t || "logo_url" in t) &&
    !("global" in t) &&
    !("preset" in t)
  );
}

// Convert legacy theme to new format
export function normalizeLegacyTheme(legacy: LegacyFormTheme): FormTheme {
  return {
    preset: null,
    global: {
      primary_color: legacy.primary_color,
      background_color: legacy.background_color,
      font_family: legacy.font_family,
    },
    elements: {
      header: {
        text: legacy.header_text,
        logo_url: legacy.logo_url,
      },
    },
    custom_css: legacy.custom_css,
  };
}

// Normalize theme from API (handles both legacy and new formats)
export function normalizeTheme(theme: unknown): FormTheme {
  if (!theme) return {};
  if (isLegacyTheme(theme)) {
    return normalizeLegacyTheme(theme);
  }
  return theme as FormTheme;
}

// Get default thank you page config
export function getDefaultThankYouPage(): ThankYouPageConfig {
  return {
    use_form_theme: true,
    content: {
      message: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: "Thank You!" }],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Your submission has been received. We'll get back to you soon.",
              },
            ],
          },
        ],
      },
      show_ticket_number: true,
      ticket_number_label: "Your Reference Number",
      buttons: [],
    },
    layout: {
      alignment: "center",
      max_width: "480px",
      animation: "fade",
    },
  };
}
