"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  Mail,
  User,
  Ticket,
} from "lucide-react";
import { publicFormsApi, TicketFormField, TicketFieldType } from "@/lib/api";

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
  theme: {
    primary_color?: string;
    background_color?: string;
    logo_url?: string;
  };
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
    ticket_number: number;
    success_message?: string;
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

    // Validate required fields
    form?.fields?.forEach((field) => {
      if (field.is_required && field.is_visible) {
        const value = formData.field_values[field.field_key];
        if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
          errors[field.field_key] = `${field.name} is required`;
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
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Submission Received!</h1>
          <p className="text-gray-600 mb-4">
            {submissionResult.success_message || "Thank you for your submission. We'll get back to you soon."}
          </p>
          <div className="bg-white rounded-lg p-4 border border-gray-200 inline-block">
            <p className="text-sm text-gray-500">Your ticket number</p>
            <p className="text-2xl font-mono font-bold text-purple-600">
              TKT-{submissionResult.ticket_number}
            </p>
          </div>
          {submissionResult.requires_email_verification && (
            <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <Mail className="h-6 w-6 text-yellow-600 mx-auto mb-2" />
              <p className="text-yellow-800 text-sm">
                Please check your email to verify your submission.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!form) return null;

  const visibleFields = form.fields?.filter((f) => f.is_visible) || [];
  const sortedFields = [...visibleFields].sort((a, b) => a.position - b.position);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          {form.theme?.logo_url && (
            <img
              src={form.theme.logo_url}
              alt="Logo"
              className="h-12 mx-auto mb-4"
            />
          )}
          <div className="flex items-center justify-center gap-2 mb-2">
            <Ticket className="h-6 w-6 text-purple-600" />
            <h1 className="text-3xl font-bold text-gray-900">{form.name}</h1>
          </div>
          {form.description && (
            <p className="text-gray-600 mt-2">{form.description}</p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
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
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
              style={form.theme?.primary_color ? { backgroundColor: form.theme.primary_color } : undefined}
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
