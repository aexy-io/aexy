"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Palette,
  Save,
  Loader2,
  AlertCircle,
  Eye,
  Copy,
  Trash2,
  Code,
  Wand2,
  FileText,
  Variable,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import {
  useEmailTemplate,
  useEmailTemplates,
  useDuplicateTemplate,
  useDeleteTemplate,
  usePreviewTemplate,
} from "@/hooks/useEmailMarketing";
import { EmailTemplateUpdate } from "@/lib/api";

export default function TemplateDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { currentWorkspace } = useWorkspace();
  const { user, logout } = useAuth();
  const templateId = params.templateId as string;
  const workspaceId = currentWorkspace?.id || null;

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, string>>({});

  // Form state
  const [name, setName] = useState("");
  const [subjectTemplate, setSubjectTemplate] = useState("");
  const [description, setDescription] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");

  const { data: template, isLoading, error, refetch } = useEmailTemplate(workspaceId, templateId);
  const { updateTemplate } = useEmailTemplates(workspaceId);
  const duplicateTemplate = useDuplicateTemplate(workspaceId);
  const deleteTemplate = useDeleteTemplate(workspaceId);
  const previewTemplate = usePreviewTemplate(workspaceId);

  // Initialize form when template loads
  useEffect(() => {
    if (template) {
      setName(template.name);
      setSubjectTemplate(template.subject_template || "");
      setDescription(template.description || "");
      setBodyHtml(template.body_html || "");

      // Initialize preview data with empty values for each variable
      if (template.variables) {
        const initialData: Record<string, string> = {};
        template.variables.forEach((v) => {
          initialData[v.name] = v.default_value || "";
        });
        setPreviewData(initialData);
      }
    }
  }, [template]);

  const handleSave = async () => {
    if (!workspaceId || !templateId) return;

    setIsSaving(true);
    try {
      const data: EmailTemplateUpdate = {
        name,
        subject_template: subjectTemplate || undefined,
        description: description || undefined,
        body_html: bodyHtml || undefined,
      };

      await updateTemplate({ templateId, data });
      setIsEditing(false);
      refetch();
    } catch (err) {
      console.error("Failed to save template:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreview = async () => {
    try {
      const result = await previewTemplate.mutateAsync({
        templateId,
        data: previewData,
      });
      setPreviewHtml(result.html);
    } catch {
      // Error handled by mutation
    }
  };

  const handleDuplicate = async () => {
    const newTemplate = await duplicateTemplate.mutateAsync(templateId);
    router.push(`/email-marketing/templates/${newTemplate.id}`);
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this template? This cannot be undone.")) {
      await deleteTemplate.mutateAsync(templateId);
      router.push("/email-marketing/templates");
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "code":
        return <Code className="h-5 w-5 text-emerald-400" />;
      case "visual":
        return <Wand2 className="h-5 w-5 text-purple-400" />;
      case "mjml":
        return <FileText className="h-5 w-5 text-amber-400" />;
      default:
        return <Palette className="h-5 w-5 text-sky-400" />;
    }
  };

  if (!currentWorkspace) {
    return (
      <div className="min-h-screen bg-background">
<div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">No Workspace Selected</h2>
            <p className="text-muted-foreground">Please select a workspace to view this template.</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
<div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <Loader2 className="h-8 w-8 text-sky-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="min-h-screen bg-background">
<div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Template Not Found</h2>
            <p className="text-muted-foreground mb-4">The template you're looking for doesn't exist.</p>
            <Link
              href="/email-marketing/templates"
              className="text-sky-400 hover:text-sky-300"
            >
              Back to Templates
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
<div className="p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-start gap-4 mb-6">
            <button
              onClick={() => router.push("/email-marketing/templates")}
              className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition mt-1"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                {getTypeIcon(template.template_type)}
                {isEditing ? (
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="text-2xl font-bold text-foreground bg-transparent border-b border-border focus:border-sky-500 focus:outline-none"
                  />
                ) : (
                  <h1 className="text-2xl font-bold text-foreground">{template.name}</h1>
                )}
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                  {template.template_type}
                </span>
              </div>
              {isEditing ? (
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add a description..."
                  className="text-muted-foreground bg-transparent border-b border-border focus:border-sky-500 focus:outline-none w-full max-w-md"
                />
              ) : (
                <p className="text-muted-foreground">{template.description || "No description"}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 text-muted-foreground hover:text-foreground transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-accent transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={handlePreview}
                    className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition"
                    title="Preview"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleDuplicate}
                    className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition"
                    title="Duplicate"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleDelete}
                    className="p-2 text-muted-foreground hover:text-red-400 hover:bg-muted rounded-lg transition"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Subject */}
              <div className="bg-background/50 border border-border rounded-xl p-6">
                <h3 className="text-lg font-medium text-foreground mb-4">Subject Line</h3>
                {isEditing ? (
                  <input
                    type="text"
                    value={subjectTemplate}
                    onChange={(e) => setSubjectTemplate(e.target.value)}
                    placeholder="Email subject..."
                    className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                ) : (
                  <p className="text-foreground">{template.subject_template || "No subject set"}</p>
                )}
              </div>

              {/* HTML Content */}
              <div className="bg-background/50 border border-border rounded-xl p-6">
                <h3 className="text-lg font-medium text-foreground mb-4">HTML Content</h3>
                {isEditing ? (
                  <textarea
                    value={bodyHtml}
                    onChange={(e) => setBodyHtml(e.target.value)}
                    rows={20}
                    className="w-full px-4 py-3 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono text-sm"
                  />
                ) : (
                  <pre className="p-4 bg-muted rounded-lg overflow-auto max-h-96 text-sm text-foreground font-mono">
                    {template.body_html || "No content"}
                  </pre>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Variables */}
              {template.variables && template.variables.length > 0 && (
                <div className="bg-background/50 border border-border rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Variable className="h-5 w-5 text-purple-400" />
                    <h3 className="text-lg font-medium text-foreground">Variables</h3>
                  </div>
                  <div className="space-y-3">
                    {template.variables.map((variable) => (
                      <div key={variable.name}>
                        <label className="block text-xs text-muted-foreground mb-1">
                          {`{{${variable.name}}}`}
                          {variable.required && <span className="text-red-400 ml-1">*</span>}
                        </label>
                        {variable.description && (
                          <p className="text-xs text-muted-foreground mb-1">{variable.description}</p>
                        )}
                        <input
                          type="text"
                          value={previewData[variable.name] || ""}
                          onChange={(e) =>
                            setPreviewData((prev) => ({ ...prev, [variable.name]: e.target.value }))
                          }
                          placeholder={variable.default_value || `Enter ${variable.name}...`}
                          className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handlePreview}
                    disabled={previewTemplate.isPending}
                    className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition disabled:opacity-50"
                  >
                    {previewTemplate.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Eye className="h-4 w-4" />
                        Preview with Data
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Metadata */}
              <div className="bg-background/50 border border-border rounded-xl p-6">
                <h3 className="text-lg font-medium text-foreground mb-4">Details</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span className="text-foreground capitalize">{template.template_type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <span className={template.is_active ? "text-emerald-400" : "text-muted-foreground"}>
                      {template.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span className="text-foreground">{new Date(template.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Updated</span>
                    <span className="text-foreground">{new Date(template.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {previewHtml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-background border border-border rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-b border-border">
              <h3 className="text-lg font-medium text-foreground">Template Preview</h3>
              <button
                onClick={() => setPreviewHtml(null)}
                className="p-2 text-muted-foreground hover:text-foreground transition"
              >
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[calc(90vh-4rem)]">
              <div
                className="bg-white rounded-lg overflow-hidden"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
