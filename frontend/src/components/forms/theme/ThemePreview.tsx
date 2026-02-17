"use client";

import { Monitor, Smartphone } from "lucide-react";
import { useState } from "react";
import { themeToCSSSVariables, getFormContainerStyles, getFormCardStyles } from "@/lib/formThemeUtils";
import type { FormTheme } from "@/lib/formThemeTypes";
import type { FormField } from "@/lib/formsApi";

interface ThemePreviewProps {
  theme: FormTheme;
  formName: string;
  fields: FormField[];
}

export function ThemePreview({ theme, formName, fields }: ThemePreviewProps) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  const cssVars = themeToCSSSVariables(theme);
  const containerStyles = getFormContainerStyles(theme);
  const cardStyles = getFormCardStyles();

  // Get header text from theme or use form name
  const headerText = theme.elements?.header?.text || formName;
  const logoUrl = theme.elements?.header?.logo_url;
  const headerAlignment = theme.elements?.header?.alignment || "center";

  // Take first 3 fields for preview
  const previewFields = fields.slice(0, 3);

  return (
    <div className="space-y-3">
      {/* Device Toggle */}
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={() => setDevice("desktop")}
          className={`p-2 rounded ${device === "desktop" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Monitor className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setDevice("mobile")}
          className={`p-2 rounded ${device === "mobile" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Smartphone className="w-4 h-4" />
        </button>
      </div>

      {/* Preview Container */}
      <div
        className={`rounded-lg overflow-hidden transition-all ${
          device === "mobile" ? "w-[280px] mx-auto" : "w-full"
        }`}
        style={{
          height: device === "mobile" ? "480px" : "400px",
        }}
      >
        <div
          className="h-full overflow-auto p-4"
          style={containerStyles}
        >
          <div
            className="mx-auto"
            style={{
              ...cardStyles,
              maxWidth: device === "mobile" ? "100%" : undefined,
            }}
          >
            {/* Logo */}
            {logoUrl && (
              <div
                className="mb-4"
                style={{ textAlign: headerAlignment }}
              >
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="h-10 inline-block"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}

            {/* Header */}
            <h1
              className="mb-6"
              style={{
                color: "var(--form-header-color, var(--form-text))",
                fontSize: "var(--form-header-size, 24px)",
                fontWeight: "var(--form-header-weight, 700)" as React.CSSProperties["fontWeight"],
                textAlign: headerAlignment,
              }}
            >
              {headerText}
            </h1>

            {/* Fields */}
            <div className="space-y-4">
              {previewFields.length > 0 ? (
                previewFields.map((field) => (
                  <div key={field.id}>
                    <label
                      className="block mb-1.5"
                      style={{
                        color: "var(--form-label-color, var(--form-text))",
                        fontSize: "var(--form-label-size, 14px)",
                        fontWeight: "var(--form-label-weight, 500)" as React.CSSProperties["fontWeight"],
                      }}
                    >
                      {field.name}
                      {field.is_required && (
                        <span style={{ color: "var(--form-required-color, var(--form-error))" }}> *</span>
                      )}
                    </label>
                    {field.field_type === "textarea" ? (
                      <textarea
                        placeholder={field.placeholder || ""}
                        className="w-full border outline-none transition-all"
                        style={{
                          backgroundColor: "var(--form-input-bg, #fff)",
                          borderColor: "var(--form-input-border, #d1d5db)",
                          color: "var(--form-input-text, var(--form-text))",
                          borderRadius: "var(--form-input-radius, 6px)",
                          padding: "var(--form-input-padding, 12px 16px)",
                          fontSize: "var(--form-input-size, 16px)",
                          resize: "none",
                          height: "80px",
                        }}
                        readOnly
                      />
                    ) : field.field_type === "select" ? (
                      <select
                        className="w-full border outline-none transition-all appearance-none"
                        style={{
                          backgroundColor: "var(--form-input-bg, #fff)",
                          borderColor: "var(--form-input-border, #d1d5db)",
                          color: "var(--form-input-placeholder, #9ca3af)",
                          borderRadius: "var(--form-input-radius, 6px)",
                          padding: "var(--form-input-padding, 12px 16px)",
                          fontSize: "var(--form-input-size, 16px)",
                        }}
                      >
                        <option>{field.placeholder || "Select..."}</option>
                      </select>
                    ) : (
                      <input
                        type={field.field_type === "email" ? "email" : "text"}
                        placeholder={field.placeholder || ""}
                        className="w-full border outline-none transition-all"
                        style={{
                          backgroundColor: "var(--form-input-bg, #fff)",
                          borderColor: "var(--form-input-border, #d1d5db)",
                          color: "var(--form-input-text, var(--form-text))",
                          borderRadius: "var(--form-input-radius, 6px)",
                          padding: "var(--form-input-padding, 12px 16px)",
                          fontSize: "var(--form-input-size, 16px)",
                        }}
                        readOnly
                      />
                    )}
                    {field.help_text && (
                      <p
                        className="mt-1"
                        style={{
                          color: "var(--form-help-color, var(--form-text-secondary))",
                          fontSize: "var(--form-help-size, 12px)",
                        }}
                      >
                        {field.help_text}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                // Placeholder fields if no fields exist
                <>
                  <div>
                    <label
                      className="block mb-1.5"
                      style={{
                        color: "var(--form-label-color, var(--form-text))",
                        fontSize: "var(--form-label-size, 14px)",
                        fontWeight: "var(--form-label-weight, 500)" as React.CSSProperties["fontWeight"],
                      }}
                    >
                      Full Name
                      <span style={{ color: "var(--form-required-color, var(--form-error))" }}> *</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Enter your name"
                      className="w-full border outline-none"
                      style={{
                        backgroundColor: "var(--form-input-bg, #fff)",
                        borderColor: "var(--form-input-border, #d1d5db)",
                        color: "var(--form-input-text, var(--form-text))",
                        borderRadius: "var(--form-input-radius, 6px)",
                        padding: "var(--form-input-padding, 12px 16px)",
                        fontSize: "var(--form-input-size, 16px)",
                      }}
                      readOnly
                    />
                  </div>
                  <div>
                    <label
                      className="block mb-1.5"
                      style={{
                        color: "var(--form-label-color, var(--form-text))",
                        fontSize: "var(--form-label-size, 14px)",
                        fontWeight: "var(--form-label-weight, 500)" as React.CSSProperties["fontWeight"],
                      }}
                    >
                      Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      className="w-full border outline-none"
                      style={{
                        backgroundColor: "var(--form-input-bg, #fff)",
                        borderColor: "var(--form-input-border, #d1d5db)",
                        color: "var(--form-input-text, var(--form-text))",
                        borderRadius: "var(--form-input-radius, 6px)",
                        padding: "var(--form-input-padding, 12px 16px)",
                        fontSize: "var(--form-input-size, 16px)",
                      }}
                      readOnly
                    />
                  </div>
                </>
              )}
            </div>

            {/* Submit Button */}
            <div className="mt-6">
              <button
                type="button"
                className="w-full transition-colors"
                style={{
                  backgroundColor: "var(--form-btn-primary-bg, var(--form-primary, #6366f1))",
                  color: "var(--form-btn-primary-text, #fff)",
                  borderRadius: "var(--form-btn-primary-radius, var(--form-border-radius, 6px))",
                  padding: "var(--form-btn-primary-padding, 12px 24px)",
                  fontSize: "var(--form-btn-primary-size, 16px)",
                  fontWeight: "var(--form-btn-primary-weight, 600)" as React.CSSProperties["fontWeight"],
                }}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
