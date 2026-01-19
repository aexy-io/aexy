"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Palette,
  Loader2,
  AlertCircle,
  Code,
  Wand2,
  FileText,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/layout/AppHeader";
import { useEmailTemplates } from "@/hooks/useEmailMarketing";
import { EmailTemplateCreate, EmailTemplateType } from "@/lib/api";

export default function NewTemplatePage() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const { user, logout } = useAuth();
  const workspaceId = currentWorkspace?.id || null;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [templateType, setTemplateType] = useState<EmailTemplateType>("code");
  const [htmlContent, setHtmlContent] = useState("");

  const { createTemplate } = useEmailTemplates(workspaceId);

  const templateTypes: { value: EmailTemplateType; label: string; desc: string; icon: React.ElementType }[] = [
    { value: "code", label: "Code", desc: "Write HTML/Jinja2 directly", icon: Code },
    { value: "visual", label: "Visual", desc: "Use drag-and-drop builder", icon: Wand2 },
    { value: "mjml", label: "MJML", desc: "Use MJML responsive framework", icon: FileText },
  ];

  const handleSubmit = async () => {
    if (!workspaceId || !name) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const data: EmailTemplateCreate = {
        name,
        subject: subject || undefined,
        description: description || undefined,
        template_type: templateType,
        html_content: htmlContent || undefined,
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
        <AppHeader user={user} logout={logout} />
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
      <AppHeader user={user} logout={logout} />
      <div className="p-8">
        <div className="max-w-3xl mx-auto">
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

          <div className="space-y-6">
            {/* Template Type */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
              <h2 className="text-lg font-medium text-white mb-4">Template Type</h2>
              <div className="grid grid-cols-3 gap-4">
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
                  <label className="block text-sm text-slate-400 mb-2">Default Subject Line</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g., Welcome to {{company_name}}!"
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Use {"{{variable}}"} syntax for dynamic content
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
                  {templateType === "mjml" ? "MJML Content" : "HTML Content"}
                </h2>
                <textarea
                  value={htmlContent}
                  onChange={(e) => setHtmlContent(e.target.value)}
                  placeholder={templateType === "mjml"
                    ? `<mjml>\n  <mj-body>\n    <mj-section>\n      <mj-column>\n        <mj-text>Hello {{name}}</mj-text>\n      </mj-column>\n    </mj-section>\n  </mj-body>\n</mjml>`
                    : `<!DOCTYPE html>\n<html>\n<body>\n  <h1>Hello {{name}}</h1>\n</body>\n</html>`
                  }
                  rows={15}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono text-sm"
                />
                <p className="text-xs text-slate-500 mt-2">
                  Use {"{{variable}}"} syntax for dynamic content. Variables will be automatically detected.
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
                disabled={isSubmitting || !name}
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
        </div>
      </div>
    </div>
  );
}
