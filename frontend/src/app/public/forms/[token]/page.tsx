"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  Mail,
  User,
} from "lucide-react";
import { publicFormsApi, TicketFormField } from "@/lib/api";
import { VALIDATION_PRESETS, ValidationType } from "@/lib/formsApi";
import type { FormTheme, ThankYouPageConfig, ThankYouButton } from "@/lib/formThemeTypes";
import { normalizeTheme, getDefaultThankYouPage } from "@/lib/formThemeTypes";
import { themeToCSSSVariables, normalizeThankYouPage, tipTapToHtml, getThankYouTheme } from "@/lib/formThemeUtils";

interface FormData {
  submitter_email: string;
  submitter_name: string;
  field_values: Record<string, unknown>;
}

interface PublicForm {
  id: string;
  name: string;
  description?: string;
  auth_mode: string;
  require_email: boolean;
  theme: FormTheme;
  thank_you_page?: ThankYouPageConfig;
  fields: TicketFormField[];
}

function FieldRenderer({
  field,
  value,
  onChange,
  error,
}: {
  field: TicketFormField;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
}) {
  const baseInputClass =
    "w-full px-4 py-3 bg-white border rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition";
  const errorClass = error ? "border-red-500" : "border-gray-200";

  switch (field.field_type) {
    case "text":
    case "email":
      return (
        <input
          type={field.field_type}
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || ""}
          className={`${baseInputClass} ${errorClass}`}
          required={field.is_required}
        />
      );

    case "number":
      return (
        <input
          type="number"
          value={(value as number) || ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}
          placeholder={field.placeholder || ""}
          className={`${baseInputClass} ${errorClass}`}
          required={field.is_required}
        />
      );

    case "textarea":
      return (
        <textarea
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || ""}
          rows={4}
          className={`${baseInputClass} ${errorClass} resize-none`}
          required={field.is_required}
        />
      );

    case "select":
      return (
        <select
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          className={`${baseInputClass} ${errorClass}`}
          required={field.is_required}
        >
          <option value="">{field.placeholder || "Select an option..."}</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );

    case "multiselect":
      const selectedValues = (value as string[]) || [];
      return (
        <div className="space-y-2">
          {field.options?.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg cursor-pointer hover:border-purple-300 transition"
            >
              <input
                type="checkbox"
                checked={selectedValues.includes(option.value)}
                onChange={(e) => {
                  if (e.target.checked) {
                    onChange([...selectedValues, option.value]);
                  } else {
                    onChange(selectedValues.filter((v) => v !== option.value));
                  }
                }}
                className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="text-gray-700">{option.label}</span>
            </label>
          ))}
        </div>
      );

    case "checkbox":
      return (
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={(value as boolean) || false}
            onChange={(e) => onChange(e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
          />
          <span className="text-gray-700">Yes</span>
        </label>
      );

    case "date":
      return (
        <input
          type="date"
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          className={`${baseInputClass} ${errorClass}`}
          required={field.is_required}
        />
      );

    case "file":
      return (
        <div className={`${baseInputClass} ${errorClass} p-0`}>
          <input
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onChange(file.name);
              }
            }}
            className="w-full p-4 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-100 file:text-purple-700 hover:file:bg-purple-200 file:cursor-pointer"
          />
        </div>
      );

    default:
      return (
        <input
          type="text"
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || ""}
          className={`${baseInputClass} ${errorClass}`}
          required={field.is_required}
        />
      );
  }
}

export default function PublicFormPage() {
  const params = useParams();
  const token = params.token as string;

  const [form, setForm] = useState<PublicForm | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<{
    submission_id?: string;
    ticket_number?: number;
    success_message?: string;
    redirect_url?: string;
    requires_email_verification: boolean;
  } | null>(null);

  const [formData, setFormData] = useState<FormData>({
    submitter_email: "",
    submitter_name: "",
    field_values: {},
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadForm = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await publicFormsApi.get(token);
        setForm(data as PublicForm);
      } catch (err) {
        setError("Form not found or is no longer available.");
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      loadForm();
    }
  }, [token]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // Validate email if required
    if (form?.require_email && !formData.submitter_email) {
      errors["submitter_email"] = "Email is required";
    } else if (formData.submitter_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.submitter_email)) {
      errors["submitter_email"] = "Please enter a valid email address";
    }

    // Validate each field
    form?.fields?.forEach((field) => {
      if (!field.is_visible) return;

      const value = formData.field_values[field.field_key];
      const strValue = value?.toString() || "";
      const rules = field.validation_rules || {};

      // Check required
      if (field.is_required) {
        if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
          errors[field.field_key] = rules.custom_message || `${field.name} is required`;
          return;
        }
      }

      // Skip further validation if value is empty and not required
      if (!strValue && !field.is_required) return;

      // Validation type preset
      if (rules.validation_type && rules.validation_type !== "custom") {
        const preset = VALIDATION_PRESETS[rules.validation_type as ValidationType];
        if (preset && preset.pattern) {
          const regex = new RegExp(preset.pattern);
          if (!regex.test(strValue)) {
            errors[field.field_key] = rules.custom_message || preset.message;
            return;
          }
        }
      }

      // Custom pattern validation
      if (rules.pattern) {
        try {
          const regex = new RegExp(rules.pattern);
          if (!regex.test(strValue)) {
            errors[field.field_key] = rules.pattern_message || rules.custom_message || "Invalid format";
            return;
          }
        } catch (e) {
          // Invalid regex, skip validation
        }
      }

      // Min length
      if (rules.min_length !== undefined && rules.min_length !== null && strValue.length < rules.min_length) {
        errors[field.field_key] = rules.custom_message || `${field.name} must be at least ${rules.min_length} characters`;
        return;
      }

      // Max length
      if (rules.max_length !== undefined && rules.max_length !== null && strValue.length > rules.max_length) {
        errors[field.field_key] = rules.custom_message || `${field.name} must be at most ${rules.max_length} characters`;
        return;
      }

      // Number validation
      if (field.field_type === "number" && strValue) {
        const numValue = parseFloat(strValue);
        if (isNaN(numValue)) {
          errors[field.field_key] = rules.custom_message || "Please enter a valid number";
          return;
        }
        if (rules.min !== undefined && rules.min !== null && numValue < rules.min) {
          errors[field.field_key] = rules.custom_message || `${field.name} must be at least ${rules.min}`;
          return;
        }
        if (rules.max !== undefined && rules.max !== null && numValue > rules.max) {
          errors[field.field_key] = rules.custom_message || `${field.name} must be at most ${rules.max}`;
          return;
        }
      }

      // Date validation
      if ((field.field_type === "date" || field.field_type === "datetime") && strValue) {
        const dateValue = new Date(strValue);
        if (rules.min_date) {
          const minDate = new Date(rules.min_date);
          if (dateValue < minDate) {
            errors[field.field_key] = rules.custom_message || `${field.name} must be on or after ${rules.min_date}`;
            return;
          }
        }
        if (rules.max_date) {
          const maxDate = new Date(rules.max_date);
          if (dateValue > maxDate) {
            errors[field.field_key] = rules.custom_message || `${field.name} must be on or before ${rules.max_date}`;
            return;
          }
        }
      }
    });

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const result = await publicFormsApi.submit(token, {
        submitter_email: formData.submitter_email || undefined,
        submitter_name: formData.submitter_name || undefined,
        field_values: formData.field_values,
      });

      setSubmissionResult(result);
      setSubmitted(true);

      if (result.redirect_url) {
        window.location.href = result.redirect_url;
      }
    } catch (err) {
      setError("Failed to submit form. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFieldChange = (fieldKey: string, value: unknown) => {
    setFormData({
      ...formData,
      field_values: {
        ...formData.field_values,
        [fieldKey]: value,
      },
    });
    // Clear error when user starts typing
    if (fieldErrors[fieldKey]) {
      setFieldErrors({ ...fieldErrors, [fieldKey]: "" });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading form...</p>
        </div>
      </div>
    );
  }

  if (error && !form) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Form Unavailable</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted && submissionResult) {
    const thankYouConfig = form?.thank_you_page
      ? normalizeThankYouPage(form.thank_you_page)
      : getDefaultThankYouPage();
    const formTheme = form ? normalizeTheme(form.theme) : {};
    const thankYouTheme = getThankYouTheme(thankYouConfig, formTheme);
    const cssVars = themeToCSSSVariables(thankYouTheme);
    const content = thankYouConfig.content;
    const layout = thankYouConfig.layout;
    const messageHtml = tipTapToHtml(content?.message);

    const handleButtonClick = (button: ThankYouButton) => {
      switch (button.action) {
        case "reload":
          setSubmitted(false);
          setFormData({ submitter_email: "", submitter_name: "", field_values: {} });
          break;
        case "redirect":
          if (button.url) window.location.href = button.url;
          break;
        case "close":
          window.close();
          break;
      }
    };

    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{
          ...cssVars,
          backgroundColor: "var(--form-background, #f8fafc)",
          color: "var(--form-text, #1e293b)",
          fontFamily: "var(--form-font-family, Inter, system-ui, sans-serif)",
        } as React.CSSProperties}
      >
        <div
          className="text-center animate-fade-in"
          style={{
            maxWidth: layout?.max_width || "480px",
            padding: layout?.padding || "24px",
            textAlign: layout?.alignment || "center",
          }}
        >
          {/* Success Icon */}
          <CheckCircle
            className="mx-auto mb-4"
            style={{
              width: "64px",
              height: "64px",
              color: "var(--form-success, #22c55e)"
            }}
          />

          {/* Image (top) */}
          {content?.image?.url && content.image.position === "top" && (
            <div className="mb-4">
              <img
                src={content.image.url}
                alt={content.image.alt || ""}
                style={{ maxWidth: content.image.max_width || "200px" }}
                className="inline-block"
              />
            </div>
          )}

          {/* Message */}
          {messageHtml ? (
            <div
              className="prose max-w-none mb-4"
              style={{ color: "var(--form-text)" }}
              dangerouslySetInnerHTML={{ __html: messageHtml }}
            />
          ) : (
            <>
              <h1
                className="text-2xl font-bold mb-2"
                style={{ color: "var(--form-text)" }}
              >
                Submission Received!
              </h1>
              <p style={{ color: "var(--form-text-secondary, #64748b)" }} className="mb-4">
                {submissionResult.success_message || "Thank you for your submission. We'll get back to you soon."}
              </p>
            </>
          )}

          {/* Ticket Number */}
          {content?.show_ticket_number !== false && submissionResult.ticket_number && (
            <div
              className="rounded-lg p-4 inline-block mb-4"
              style={{
                backgroundColor: "var(--form-surface, #ffffff)",
                border: "1px solid var(--form-border, #e2e8f0)",
              }}
            >
              <p
                className="text-sm mb-1"
                style={{ color: "var(--form-text-secondary)" }}
              >
                {content?.ticket_number_label || "Your Reference Number"}
              </p>
              <p
                className="text-2xl font-mono font-bold"
                style={{ color: "var(--form-primary, #6366f1)" }}
              >
                TKT-{submissionResult.ticket_number}
              </p>
            </div>
          )}

          {/* Image (bottom) */}
          {content?.image?.url && content.image.position === "bottom" && (
            <div className="mb-4">
              <img
                src={content.image.url}
                alt={content.image.alt || ""}
                style={{ maxWidth: content.image.max_width || "200px" }}
                className="inline-block"
              />
            </div>
          )}

          {/* Email Verification Notice */}
          {submissionResult.requires_email_verification && (
            <div
              className="mt-4 p-4 rounded-lg border"
              style={{
                backgroundColor: "rgba(234, 179, 8, 0.1)",
                borderColor: "rgba(234, 179, 8, 0.3)",
              }}
            >
              <Mail className="h-6 w-6 mx-auto mb-2" style={{ color: "#eab308" }} />
              <p className="text-sm" style={{ color: "#ca8a04" }}>
                Please check your email to verify your submission.
              </p>
            </div>
          )}

          {/* Buttons */}
          {content?.buttons && content.buttons.length > 0 && (
            <div
              className="flex gap-3 flex-wrap mt-6"
              style={{ justifyContent: layout?.alignment === "left" ? "flex-start" : "center" }}
            >
              {content.buttons.map((button, index) => (
                <button
                  key={button.id || index}
                  type="button"
                  onClick={() => handleButtonClick(button)}
                  className="px-4 py-2 rounded-lg transition-colors"
                  style={
                    button.style === "primary"
                      ? {
                          backgroundColor: "var(--form-btn-primary-bg, var(--form-primary, #6366f1))",
                          color: "var(--form-btn-primary-text, #fff)",
                          borderRadius: "var(--form-border-radius, 6px)",
                        }
                      : button.style === "link"
                      ? {
                          color: "var(--form-primary, #6366f1)",
                          backgroundColor: "transparent",
                          textDecoration: "underline",
                        }
                      : {
                          backgroundColor: "transparent",
                          color: "var(--form-primary, #6366f1)",
                          border: "1px solid var(--form-primary, #6366f1)",
                          borderRadius: "var(--form-border-radius, 6px)",
                        }
                  }
                >
                  {button.text}
                </button>
              ))}
            </div>
          )}
        </div>

        <style jsx>{`
          @keyframes fade-in {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in {
            animation: fade-in 0.5s ease-out;
          }
        `}</style>
      </div>
    );
  }

  if (!form) return null;

  const visibleFields = form.fields?.filter((f) => f.is_visible) || [];
  const sortedFields = [...visibleFields].sort((a, b) => a.position - b.position);

  // Apply theme
  const theme = normalizeTheme(form.theme);
  const cssVars = themeToCSSSVariables(theme);
  const headerSettings = theme.elements?.header;
  const logoUrl = headerSettings?.logo_url || (form.theme as { logo_url?: string })?.logo_url;

  return (
    <div
      className="min-h-screen py-12 px-4"
      style={{
        ...cssVars,
        backgroundColor: "var(--form-background, #f8fafc)",
        color: "var(--form-text, #1e293b)",
        fontFamily: "var(--form-font-family, Inter, system-ui, sans-serif)",
      } as React.CSSProperties}
    >
      <div
        className="mx-auto"
        style={{ maxWidth: "var(--form-container-max-width, 640px)" }}
      >
        {/* Header */}
        <div
          className="mb-8"
          style={{ textAlign: (headerSettings?.alignment || "center") as React.CSSProperties["textAlign"] }}
        >
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Logo"
              className="h-12 mb-4"
              style={{ display: "inline-block" }}
            />
          )}
          <h1
            className="font-bold"
            style={{
              color: "var(--form-header-color, var(--form-text))",
              fontSize: "var(--form-header-size, 28px)",
              fontWeight: "var(--form-header-weight, 700)" as React.CSSProperties["fontWeight"],
            }}
          >
            {headerSettings?.text || form.name}
          </h1>
          {form.description && (
            <p
              className="mt-2"
              style={{ color: "var(--form-text-secondary, #64748b)" }}
            >
              {form.description}
            </p>
          )}
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-xl"
          style={{
            backgroundColor: "var(--form-container-bg, var(--form-surface, #ffffff))",
            boxShadow: "var(--form-container-shadow, 0 1px 3px 0 rgb(0 0 0 / 0.1))",
            border: "1px solid var(--form-border, #e2e8f0)",
            padding: "var(--form-container-padding, 32px)",
            borderRadius: "var(--form-border-radius, 12px)",
          }}
        >
          {/* Contact Info */}
          <div className="space-y-6 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="h-4 w-4 inline mr-1" />
                Your Name
              </label>
              <input
                type="text"
                value={formData.submitter_name}
                onChange={(e) => setFormData({ ...formData, submitter_name: e.target.value })}
                placeholder="Enter your name"
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Mail className="h-4 w-4 inline mr-1" />
                Email Address
                {form.require_email && <span className="text-red-500 ml-1">*</span>}
              </label>
              <input
                type="email"
                value={formData.submitter_email}
                onChange={(e) => {
                  setFormData({ ...formData, submitter_email: e.target.value });
                  if (fieldErrors["submitter_email"]) {
                    setFieldErrors({ ...fieldErrors, submitter_email: "" });
                  }
                }}
                placeholder="you@example.com"
                required={form.require_email}
                className={`w-full px-4 py-3 bg-white border rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition ${
                  fieldErrors["submitter_email"] ? "border-red-500" : "border-gray-200"
                }`}
              />
              {fieldErrors["submitter_email"] && (
                <p className="text-red-500 text-sm mt-1">{fieldErrors["submitter_email"]}</p>
              )}
            </div>
          </div>

          {/* Divider */}
          {sortedFields.length > 0 && (
            <div className="border-t border-gray-200 my-8" />
          )}

          {/* Dynamic Fields */}
          <div className="space-y-6">
            {sortedFields.map((field) => (
              <div key={field.id}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {field.name}
                  {field.is_required && <span className="text-red-500 ml-1">*</span>}
                </label>
                <FieldRenderer
                  field={field}
                  value={formData.field_values[field.field_key]}
                  onChange={(value) => handleFieldChange(field.field_key, value)}
                  error={fieldErrors[field.field_key]}
                />
                {field.help_text && (
                  <p className="text-gray-500 text-sm mt-1">{field.help_text}</p>
                )}
                {fieldErrors[field.field_key] && (
                  <p className="text-red-500 text-sm mt-1">{fieldErrors[field.field_key]}</p>
                )}
              </div>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="mt-6 p-4 bg-red-50 rounded-lg border border-red-200 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Submit */}
          <div className="mt-8">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: "var(--form-btn-primary-bg, var(--form-primary, #6366f1))",
                color: "var(--form-btn-primary-text, #ffffff)",
                borderRadius: "var(--form-btn-primary-radius, var(--form-border-radius, 8px))",
                padding: "var(--form-btn-primary-padding, 16px 24px)",
                fontSize: "var(--form-btn-primary-size, 16px)",
                fontWeight: "var(--form-btn-primary-weight, 600)" as React.CSSProperties["fontWeight"],
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-5 w-5" />
                  Submit
                </>
              )}
            </button>
          </div>
        </form>

        {/* Footer */}
        <p className="text-center text-gray-400 text-sm mt-6">
          Powered by Aexy
        </p>
      </div>
    </div>
  );
}
