"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Palette,
  Loader2,
  AlertCircle,
  Code,
  Wand2,
  FileText,
  Variable,
  User,
  Building2,
  Calendar,
  Link,
  Hash,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { useEmailTemplates } from "@/hooks/useEmailMarketing";
import { EmailTemplateCreate, EmailTemplateType } from "@/lib/api";

// Available template variables organized by category
const VARIABLE_CATEGORIES = [
  {
    name: "Recipient",
    icon: User,
    variables: [
      { name: "first_name", description: "Recipient's first name" },
      { name: "last_name", description: "Recipient's last name" },
      { name: "full_name", description: "Recipient's full name" },
      { name: "email", description: "Recipient's email address" },
    ],
  },
  {
    name: "Company",
    icon: Building2,
    variables: [
      { name: "company_name", description: "Your company name" },
      { name: "company_address", description: "Company address" },
      { name: "company_phone", description: "Company phone number" },
      { name: "company_website", description: "Company website URL" },
    ],
  },
  {
    name: "Links",
    icon: Link,
    variables: [
      { name: "unsubscribe_url", description: "Unsubscribe link" },
      { name: "preferences_url", description: "Email preferences link" },
      { name: "view_in_browser_url", description: "View in browser link" },
    ],
  },
  {
    name: "Date & Time",
    icon: Calendar,
    variables: [
      { name: "current_date", description: "Current date" },
      { name: "current_year", description: "Current year" },
    ],
  },
  {
    name: "Custom",
    icon: Hash,
    variables: [
      { name: "custom_field_1", description: "Custom field 1" },
      { name: "custom_field_2", description: "Custom field 2" },
    ],
  },
];

export default function NewTemplatePage() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const { user, logout } = useAuth();
  const workspaceId = currentWorkspace?.id || null;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [subjectTemplate, setSubjectTemplate] = useState("");
  const [description, setDescription] = useState("");
  const [templateType, setTemplateType] = useState<EmailTemplateType>("code");
  const [bodyHtml, setBodyHtml] = useState("");

  // Track the last focused input and cursor position
  const lastFocusedField = useRef<"subject" | "content" | null>(null);
  const lastCursorPosition = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);

  const { createTemplate } = useEmailTemplates(workspaceId);

  const templateTypes: { value: EmailTemplateType; label: string; desc: string; icon: React.ElementType }[] = [
    { value: "code", label: "Code", desc: "Write HTML/Jinja2 directly", icon: Code },
    { value: "visual", label: "Visual", desc: "Use drag-and-drop builder", icon: Wand2 },
    { value: "mjml", label: "MJML", desc: "Use MJML responsive framework", icon: FileText },
  ];

  // Track focus and cursor position for subject input
  const handleSubjectFocus = useCallback(() => {
    lastFocusedField.current = "subject";
  }, []);

  const handleSubjectSelect = useCallback((e: React.SyntheticEvent<HTMLInputElement>) => {
    const target = e.target as HTMLInputElement;
    lastCursorPosition.current = { start: target.selectionStart || 0, end: target.selectionEnd || 0 };
  }, []);

  // Track focus and cursor position for content textarea
  const handleContentFocus = useCallback(() => {
    lastFocusedField.current = "content";
  }, []);

  const handleContentSelect = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    lastCursorPosition.current = { start: target.selectionStart || 0, end: target.selectionEnd || 0 };
  }, []);

  // Insert variable at cursor position in the last focused field
  const insertVariable = useCallback((variableName: string) => {
    const variableText = `{{${variableName}}}`;

    if (lastFocusedField.current === "subject") {
      const { start, end } = lastCursorPosition.current;
      const newValue = subjectTemplate.slice(0, start) + variableText + subjectTemplate.slice(end);
      setSubjectTemplate(newValue);

      // Restore focus and set cursor after the inserted variable
      setTimeout(() => {
        if (subjectInputRef.current) {
          subjectInputRef.current.focus();
          const newPosition = start + variableText.length;
          subjectInputRef.current.setSelectionRange(newPosition, newPosition);
        }
      }, 0);
    } else if (lastFocusedField.current === "content") {
      const { start, end } = lastCursorPosition.current;
      const newValue = bodyHtml.slice(0, start) + variableText + bodyHtml.slice(end);
      setBodyHtml(newValue);

      // Restore focus and set cursor after the inserted variable
      setTimeout(() => {
        if (contentTextareaRef.current) {
          contentTextareaRef.current.focus();
          const newPosition = start + variableText.length;
          contentTextareaRef.current.setSelectionRange(newPosition, newPosition);
        }
      }, 0);
    } else {
      // If no field was focused, append to content
      setBodyHtml((prev) => prev + variableText);
      lastFocusedField.current = "content";
      setTimeout(() => {
        if (contentTextareaRef.current) {
          contentTextareaRef.current.focus();
          const newPosition = bodyHtml.length + variableText.length;
          contentTextareaRef.current.setSelectionRange(newPosition, newPosition);
        }
      }, 0);
    }
  }, [subjectTemplate, bodyHtml]);

  const handleSubmit = async () => {
    if (!workspaceId || !name || !subjectTemplate || !bodyHtml) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const data: EmailTemplateCreate = {
        name,
        subject_template: subjectTemplate,
        body_html: bodyHtml,
        description: description || undefined,
        template_type: templateType,
      };

      const template = await createTemplate(data);
      router.push(`/email-marketing/templates/${template.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create template");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentWorkspace) {
    return (
      <div className="min-h-screen bg-slate-950">
<div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-slate-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">No Workspace Selected</h2>
            <p className="text-slate-400">Please select a workspace to create a template.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
<div className="p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <button
              onClick={() => router.push("/email-marketing/templates")}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">Create Template</h1>
              <p className="text-sm text-slate-400">Design a reusable email template</p>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
              <p className="text-red-400">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Main Content - 3 columns */}
            <div className="lg:col-span-3 space-y-6">
              {/* Template Type */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                <h2 className="text-lg font-medium text-white mb-4">Template Type</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {templateTypes.map((type) => {
                    const Icon = type.icon;
                    return (
                      <button
                        key={type.value}
                        onClick={() => setTemplateType(type.value)}
                        className={`p-4 rounded-lg border transition text-left ${
                          templateType === type.value
                            ? "bg-sky-500/20 border-sky-500 text-white"
                            : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600"
                        }`}
                      >
                        <Icon className={`h-6 w-6 mb-2 ${
                          templateType === type.value ? "text-sky-400" : "text-slate-400"
                        }`} />
                        <p className="font-medium">{type.label}</p>
                        <p className="text-xs text-slate-400 mt-1">{type.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Basic Info */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                <h2 className="text-lg font-medium text-white mb-4">Basic Information</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Template Name *</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Welcome Email"
                      className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Description</label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Brief description of the template"
                      className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Subject Line *</label>
                    <input
                      ref={subjectInputRef}
                      type="text"
                      value={subjectTemplate}
                      onChange={(e) => setSubjectTemplate(e.target.value)}
                      onFocus={handleSubjectFocus}
                      onSelect={handleSubjectSelect}
                      onKeyUp={handleSubjectSelect}
                      onClick={handleSubjectSelect}
                      placeholder="e.g., Welcome to {{company_name}}!"
                      className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Click a variable from the sidebar to insert it here
                    </p>
                  </div>
                </div>
              </div>

              {/* Content */}
              {templateType === "visual" ? (
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                  <h2 className="text-lg font-medium text-white mb-4">Visual Builder</h2>
                  <div className="h-64 flex items-center justify-center border border-dashed border-slate-700 rounded-lg">
                    <div className="text-center">
                      <Wand2 className="h-10 w-10 text-slate-600 mx-auto mb-2" />
                      <p className="text-slate-400">Visual builder will be available after creation</p>
                      <p className="text-xs text-slate-500 mt-1">Create the template first, then edit with the visual builder</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                  <h2 className="text-lg font-medium text-white mb-4">
                    {templateType === "mjml" ? "MJML Content" : "HTML Content"} *
                  </h2>
                  <textarea
                    ref={contentTextareaRef}
                    value={bodyHtml}
                    onChange={(e) => setBodyHtml(e.target.value)}
                    onFocus={handleContentFocus}
                    onSelect={handleContentSelect}
                    onKeyUp={handleContentSelect}
                    onClick={handleContentSelect}
                    placeholder={templateType === "mjml"
                      ? `<mjml>\n  <mj-body>\n    <mj-section>\n      <mj-column>\n        <mj-text>Hello {{first_name}}</mj-text>\n        <mj-text>Welcome to {{company_name}}!</mj-text>\n      </mj-column>\n    </mj-section>\n  </mj-body>\n</mjml>`
                      : `<!DOCTYPE html>\n<html>\n<body>\n  <h1>Hello {{first_name}}</h1>\n  <p>Welcome to {{company_name}}!</p>\n</body>\n</html>`
                    }
                    rows={18}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    {templateType === "mjml"
                      ? "MJML will be compiled to responsive HTML. Click a variable from the sidebar to insert it."
                      : "Click a variable from the sidebar to insert it at your cursor position"
                    }
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => router.push("/email-marketing/templates")}
                  className="px-4 py-2 text-slate-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !name || !subjectTemplate || !bodyHtml}
                  className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Palette className="h-4 w-4" />
                  )}
                  Create Template
                </button>
              </div>
            </div>

            {/* Variables Sidebar - 1 column */}
            <div className="lg:col-span-1">
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 sticky top-8">
                <div className="flex items-center gap-2 mb-4">
                  <Variable className="h-5 w-5 text-purple-400" />
                  <h3 className="text-lg font-medium text-white">Variables</h3>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Click to insert at cursor position
                </p>

                <div className="space-y-4 max-h-[calc(100vh-16rem)] overflow-y-auto">
                  {VARIABLE_CATEGORIES.map((category) => {
                    const CategoryIcon = category.icon;
                    return (
                      <div key={category.name}>
                        <div className="flex items-center gap-2 mb-2">
                          <CategoryIcon className="h-4 w-4 text-slate-500" />
                          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                            {category.name}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {category.variables.map((variable) => (
                            <button
                              key={variable.name}
                              onClick={() => insertVariable(variable.name)}
                              className="w-full text-left px-3 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 transition group"
                            >
                              <code className="text-sm text-purple-400 group-hover:text-purple-300">
                                {`{{${variable.name}}}`}
                              </code>
                              <p className="text-xs text-slate-500 mt-0.5">{variable.description}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
