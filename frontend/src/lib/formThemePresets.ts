/**
 * Pre-built form theme presets.
 */

import type { FormTheme, ThemePresetDefinition, ThemePreset } from "./formThemeTypes";

// =============================================================================
// THEME PRESETS
// =============================================================================

export const THEME_PRESETS: Record<ThemePreset, ThemePresetDefinition> = {
  light: {
    id: "light",
    name: "Light",
    description: "Clean and minimal light theme",
    theme: {
      preset: "light",
      global: {
        primary_color: "#6366f1",
        secondary_color: "#8b5cf6",
        background_color: "#f8fafc",
        surface_color: "#ffffff",
        text_color: "#1e293b",
        text_secondary_color: "#64748b",
        border_color: "#e2e8f0",
        error_color: "#ef4444",
        success_color: "#22c55e",
        font_family: "Inter, system-ui, sans-serif",
        border_radius: "8px",
        spacing: "normal",
      },
      elements: {
        form: {
          background_color: "#ffffff",
          padding: "32px",
          max_width: "640px",
          shadow: "lg",
        },
        header: {
          text_color: "#1e293b",
          font_size: "28px",
          font_weight: "700",
          alignment: "center",
        },
        labels: {
          text_color: "#374151",
          font_size: "14px",
          font_weight: "500",
          required_indicator_color: "#ef4444",
        },
        inputs: {
          background_color: "#ffffff",
          border_color: "#d1d5db",
          text_color: "#1e293b",
          placeholder_color: "#9ca3af",
          focus_border_color: "#6366f1",
          focus_ring_color: "rgba(99, 102, 241, 0.2)",
          border_radius: "6px",
          padding: "12px 16px",
          font_size: "16px",
        },
        buttons: {
          primary: {
            background_color: "#6366f1",
            text_color: "#ffffff",
            hover_background_color: "#4f46e5",
            border_radius: "6px",
            padding: "12px 24px",
            font_size: "16px",
            font_weight: "600",
          },
          secondary: {
            background_color: "transparent",
            text_color: "#6366f1",
            border_color: "#6366f1",
            hover_background_color: "rgba(99, 102, 241, 0.1)",
          },
        },
        errors: {
          text_color: "#dc2626",
          background_color: "#fef2f2",
          border_color: "#fecaca",
          icon_color: "#ef4444",
        },
        help_text: {
          text_color: "#6b7280",
          font_size: "12px",
        },
      },
    },
  },

  dark: {
    id: "dark",
    name: "Dark",
    description: "Modern dark theme for low-light environments",
    theme: {
      preset: "dark",
      global: {
        primary_color: "#818cf8",
        secondary_color: "#a78bfa",
        background_color: "#0f172a",
        surface_color: "#1e293b",
        text_color: "#f1f5f9",
        text_secondary_color: "#94a3b8",
        border_color: "#334155",
        error_color: "#f87171",
        success_color: "#4ade80",
        font_family: "Inter, system-ui, sans-serif",
        border_radius: "8px",
        spacing: "normal",
      },
      elements: {
        form: {
          background_color: "#1e293b",
          padding: "32px",
          max_width: "640px",
          shadow: "xl",
        },
        header: {
          text_color: "#f1f5f9",
          font_size: "28px",
          font_weight: "700",
          alignment: "center",
        },
        labels: {
          text_color: "#e2e8f0",
          font_size: "14px",
          font_weight: "500",
          required_indicator_color: "#f87171",
        },
        inputs: {
          background_color: "#0f172a",
          border_color: "#475569",
          text_color: "#f1f5f9",
          placeholder_color: "#64748b",
          focus_border_color: "#818cf8",
          focus_ring_color: "rgba(129, 140, 248, 0.3)",
          border_radius: "6px",
          padding: "12px 16px",
          font_size: "16px",
        },
        buttons: {
          primary: {
            background_color: "#818cf8",
            text_color: "#0f172a",
            hover_background_color: "#6366f1",
            border_radius: "6px",
            padding: "12px 24px",
            font_size: "16px",
            font_weight: "600",
          },
          secondary: {
            background_color: "transparent",
            text_color: "#818cf8",
            border_color: "#818cf8",
            hover_background_color: "rgba(129, 140, 248, 0.1)",
          },
        },
        errors: {
          text_color: "#f87171",
          background_color: "rgba(248, 113, 113, 0.1)",
          border_color: "rgba(248, 113, 113, 0.3)",
          icon_color: "#f87171",
        },
        help_text: {
          text_color: "#94a3b8",
          font_size: "12px",
        },
      },
    },
  },

  minimal: {
    id: "minimal",
    name: "Minimal",
    description: "Ultra-clean with subtle styling",
    theme: {
      preset: "minimal",
      global: {
        primary_color: "#18181b",
        secondary_color: "#3f3f46",
        background_color: "#ffffff",
        surface_color: "#ffffff",
        text_color: "#18181b",
        text_secondary_color: "#71717a",
        border_color: "#e4e4e7",
        error_color: "#dc2626",
        success_color: "#16a34a",
        font_family: "Inter, system-ui, sans-serif",
        border_radius: "4px",
        spacing: "relaxed",
      },
      elements: {
        form: {
          background_color: "#ffffff",
          padding: "40px",
          max_width: "560px",
          shadow: "none",
        },
        header: {
          text_color: "#18181b",
          font_size: "24px",
          font_weight: "600",
          alignment: "left",
        },
        labels: {
          text_color: "#3f3f46",
          font_size: "13px",
          font_weight: "500",
          required_indicator_color: "#dc2626",
        },
        inputs: {
          background_color: "transparent",
          border_color: "#d4d4d8",
          text_color: "#18181b",
          placeholder_color: "#a1a1aa",
          focus_border_color: "#18181b",
          focus_ring_color: "transparent",
          border_radius: "0px",
          padding: "12px 0",
          font_size: "16px",
        },
        buttons: {
          primary: {
            background_color: "#18181b",
            text_color: "#ffffff",
            hover_background_color: "#3f3f46",
            border_radius: "4px",
            padding: "14px 28px",
            font_size: "14px",
            font_weight: "500",
          },
          secondary: {
            background_color: "transparent",
            text_color: "#18181b",
            border_color: "#18181b",
            hover_background_color: "#f4f4f5",
          },
        },
        errors: {
          text_color: "#dc2626",
          background_color: "transparent",
          border_color: "transparent",
          icon_color: "#dc2626",
        },
        help_text: {
          text_color: "#71717a",
          font_size: "12px",
        },
      },
    },
  },

  modern: {
    id: "modern",
    name: "Modern",
    description: "Bold colors and contemporary design",
    theme: {
      preset: "modern",
      global: {
        primary_color: "#0ea5e9",
        secondary_color: "#06b6d4",
        background_color: "#f0f9ff",
        surface_color: "#ffffff",
        text_color: "#0c4a6e",
        text_secondary_color: "#0369a1",
        border_color: "#bae6fd",
        error_color: "#e11d48",
        success_color: "#059669",
        font_family: "'Plus Jakarta Sans', Inter, system-ui, sans-serif",
        border_radius: "12px",
        spacing: "normal",
      },
      elements: {
        form: {
          background_color: "#ffffff",
          padding: "36px",
          max_width: "640px",
          shadow: "xl",
        },
        header: {
          text_color: "#0c4a6e",
          font_size: "32px",
          font_weight: "800",
          alignment: "center",
        },
        labels: {
          text_color: "#0369a1",
          font_size: "14px",
          font_weight: "600",
          required_indicator_color: "#e11d48",
        },
        inputs: {
          background_color: "#f0f9ff",
          border_color: "#7dd3fc",
          text_color: "#0c4a6e",
          placeholder_color: "#38bdf8",
          focus_border_color: "#0ea5e9",
          focus_ring_color: "rgba(14, 165, 233, 0.25)",
          border_radius: "10px",
          padding: "14px 18px",
          font_size: "16px",
        },
        buttons: {
          primary: {
            background_color: "#0ea5e9",
            text_color: "#ffffff",
            hover_background_color: "#0284c7",
            border_radius: "10px",
            padding: "14px 28px",
            font_size: "16px",
            font_weight: "700",
          },
          secondary: {
            background_color: "transparent",
            text_color: "#0ea5e9",
            border_color: "#0ea5e9",
            hover_background_color: "#f0f9ff",
          },
        },
        errors: {
          text_color: "#e11d48",
          background_color: "#fff1f2",
          border_color: "#fecdd3",
          icon_color: "#e11d48",
        },
        help_text: {
          text_color: "#0369a1",
          font_size: "12px",
        },
      },
    },
  },

  colorful: {
    id: "colorful",
    name: "Colorful",
    description: "Vibrant and playful color palette",
    theme: {
      preset: "colorful",
      global: {
        primary_color: "#ec4899",
        secondary_color: "#f97316",
        background_color: "#fdf4ff",
        surface_color: "#ffffff",
        text_color: "#581c87",
        text_secondary_color: "#7c3aed",
        border_color: "#f5d0fe",
        error_color: "#dc2626",
        success_color: "#22c55e",
        font_family: "'Nunito', Inter, system-ui, sans-serif",
        border_radius: "16px",
        spacing: "relaxed",
      },
      elements: {
        form: {
          background_color: "#ffffff",
          padding: "40px",
          max_width: "640px",
          shadow: "lg",
        },
        header: {
          text_color: "#581c87",
          font_size: "32px",
          font_weight: "800",
          alignment: "center",
        },
        labels: {
          text_color: "#7c3aed",
          font_size: "14px",
          font_weight: "700",
          required_indicator_color: "#ec4899",
        },
        inputs: {
          background_color: "#fdf4ff",
          border_color: "#e879f9",
          text_color: "#581c87",
          placeholder_color: "#c084fc",
          focus_border_color: "#ec4899",
          focus_ring_color: "rgba(236, 72, 153, 0.25)",
          border_radius: "12px",
          padding: "14px 18px",
          font_size: "16px",
        },
        buttons: {
          primary: {
            background_color: "#ec4899",
            text_color: "#ffffff",
            hover_background_color: "#db2777",
            border_radius: "12px",
            padding: "14px 32px",
            font_size: "16px",
            font_weight: "700",
          },
          secondary: {
            background_color: "transparent",
            text_color: "#ec4899",
            border_color: "#ec4899",
            hover_background_color: "#fdf4ff",
          },
        },
        errors: {
          text_color: "#dc2626",
          background_color: "#fef2f2",
          border_color: "#fecaca",
          icon_color: "#dc2626",
        },
        help_text: {
          text_color: "#9333ea",
          font_size: "12px",
        },
      },
    },
  },

  corporate: {
    id: "corporate",
    name: "Corporate",
    description: "Professional business styling",
    theme: {
      preset: "corporate",
      global: {
        primary_color: "#1d4ed8",
        secondary_color: "#3b82f6",
        background_color: "#f8fafc",
        surface_color: "#ffffff",
        text_color: "#1e3a5f",
        text_secondary_color: "#475569",
        border_color: "#cbd5e1",
        error_color: "#b91c1c",
        success_color: "#15803d",
        font_family: "'Source Sans Pro', Inter, system-ui, sans-serif",
        border_radius: "6px",
        spacing: "normal",
      },
      elements: {
        form: {
          background_color: "#ffffff",
          padding: "32px",
          max_width: "680px",
          shadow: "md",
        },
        header: {
          text_color: "#1e3a5f",
          font_size: "26px",
          font_weight: "700",
          alignment: "left",
        },
        labels: {
          text_color: "#334155",
          font_size: "14px",
          font_weight: "600",
          required_indicator_color: "#b91c1c",
        },
        inputs: {
          background_color: "#ffffff",
          border_color: "#94a3b8",
          text_color: "#1e3a5f",
          placeholder_color: "#94a3b8",
          focus_border_color: "#1d4ed8",
          focus_ring_color: "rgba(29, 78, 216, 0.2)",
          border_radius: "4px",
          padding: "10px 14px",
          font_size: "15px",
        },
        buttons: {
          primary: {
            background_color: "#1d4ed8",
            text_color: "#ffffff",
            hover_background_color: "#1e40af",
            border_radius: "4px",
            padding: "12px 24px",
            font_size: "15px",
            font_weight: "600",
          },
          secondary: {
            background_color: "#f1f5f9",
            text_color: "#1d4ed8",
            border_color: "#cbd5e1",
            hover_background_color: "#e2e8f0",
          },
        },
        errors: {
          text_color: "#b91c1c",
          background_color: "#fef2f2",
          border_color: "#fecaca",
          icon_color: "#b91c1c",
        },
        help_text: {
          text_color: "#64748b",
          font_size: "13px",
        },
      },
    },
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getPresetTheme(presetId: ThemePreset): FormTheme {
  return THEME_PRESETS[presetId]?.theme ?? THEME_PRESETS.light.theme;
}

export function getPresetList(): ThemePresetDefinition[] {
  return Object.values(THEME_PRESETS);
}

export function isPresetTheme(theme: FormTheme): boolean {
  return theme.preset !== null && theme.preset !== undefined;
}

// Get the default theme (light)
export function getDefaultTheme(): FormTheme {
  return THEME_PRESETS.light.theme;
}
