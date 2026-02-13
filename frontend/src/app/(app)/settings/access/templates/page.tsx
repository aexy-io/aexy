"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Package,
  Plus,
  Loader2,
  Trash2,
  Edit2,
  Shield,
  Code,
  Heart,
  Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAppAccessTemplates } from "@/hooks/useAppAccess";
import { getAllApps, SYSTEM_BUNDLES, AppAccessConfig } from "@/config/appDefinitions";

// Icon mapping for templates
const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  Code: <Code className="h-5 w-5" />,
  Heart: <Heart className="h-5 w-5" />,
  Briefcase: <Briefcase className="h-5 w-5" />,
  Shield: <Shield className="h-5 w-5" />,
  Package: <Package className="h-5 w-5" />,
};

interface TemplateFormData {
  name: string;
  description: string;
  icon: string;
  color: string;
  appConfig: Record<string, AppAccessConfig>;
}

export default function AccessTemplatesPage() {
  const { currentWorkspaceId } = useWorkspace();
  const workspaceId = currentWorkspaceId || "";

  const {
    templates,
    isLoading,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    isCreating,
    isUpdating,
    isDeleting,
  } = useAppAccessTemplates(workspaceId);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<string | null>(null);
  const [formData, setFormData] = useState<TemplateFormData>({
    name: "",
    description: "",
    icon: "Package",
    color: "#6366f1",
    appConfig: {},
  });

  const apps = getAllApps();

  const handleCreate = async () => {
    try {
      await createTemplate({
        name: formData.name,
        description: formData.description || undefined,
        icon: formData.icon,
        color: formData.color,
        app_config: formData.appConfig,
      });
      setShowCreateModal(false);
      resetForm();
    } catch (error) {
      console.error("Failed to create template:", error);
    }
  };

  const handleUpdate = async () => {
    if (!editingTemplate) return;
    try {
      await updateTemplate({
        templateId: editingTemplate,
        data: {
          name: formData.name,
          description: formData.description || undefined,
          icon: formData.icon,
          color: formData.color,
          app_config: formData.appConfig,
        },
      });
      setEditingTemplate(null);
      resetForm();
    } catch (error) {
      console.error("Failed to update template:", error);
    }
  };

  const handleDelete = async () => {
    if (!deletingTemplate) return;
    try {
      await deleteTemplate(deletingTemplate);
      setDeletingTemplate(null);
    } catch (error) {
      console.error("Failed to delete template:", error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      icon: "Package",
      color: "#6366f1",
      appConfig: {},
    });
  };

  const openEditModal = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setFormData({
      name: template.name,
      description: template.description || "",
      icon: template.icon,
      color: template.color,
      appConfig: template.app_config,
    });
    setEditingTemplate(templateId);
  };

  const toggleAppInForm = (appId: string) => {
    setFormData((prev) => ({
      ...prev,
      appConfig: {
        ...prev.appConfig,
        [appId]: {
          ...prev.appConfig[appId],
          enabled: !prev.appConfig[appId]?.enabled,
        },
      },
    }));
  };

  const systemTemplates = templates.filter((t) => t.is_system);
  const customTemplates = templates.filter((t) => !t.is_system);

  const isSaving = isCreating || isUpdating;

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link
                href="/settings/access"
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-700 rounded-lg">
                  <Package className="h-5 w-5 text-violet-400" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-white">
                    Access Templates
                  </h1>
                  <p className="text-slate-400 text-sm">
                    Create and manage app access bundles
                  </p>
                </div>
              </div>
            </div>

            <Button onClick={() => setShowCreateModal(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Template
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* System Templates */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-4">
                System Templates
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {systemTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="p-4 bg-slate-800 border border-slate-700 rounded-lg"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="p-2 rounded-lg"
                        style={{ backgroundColor: `${template.color}20` }}
                      >
                        <span style={{ color: template.color }}>
                          {TEMPLATE_ICONS[template.icon] || (
                            <Package className="h-5 w-5" />
                          )}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-white">
                            {template.name}
                          </h3>
                          <span className="px-2 py-0.5 text-xs rounded-full bg-slate-700 text-slate-300">
                            System
                          </span>
                        </div>
                        <p className="text-sm text-slate-400 mt-1">
                          {template.description}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1">
                          {Object.entries(template.app_config)
                            .filter(([, config]) => config.enabled)
                            .slice(0, 5)
                            .map(([appId]) => {
                              const app = apps.find((a) => a.id === appId);
                              return (
                                <span
                                  key={appId}
                                  className="px-2 py-0.5 text-xs rounded bg-slate-700/50 text-slate-400"
                                >
                                  {app?.name || appId}
                                </span>
                              );
                            })}
                          {Object.entries(template.app_config).filter(
                            ([, config]) => config.enabled
                          ).length > 5 && (
                            <span className="px-2 py-0.5 text-xs rounded bg-slate-700/50 text-slate-400">
                              +
                              {Object.entries(template.app_config).filter(
                                ([, config]) => config.enabled
                              ).length - 5}{" "}
                              more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Custom Templates */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-4">
                Custom Templates
              </h2>
              {customTemplates.length === 0 ? (
                <div className="text-center py-12 bg-slate-800 border border-slate-700 border-dashed rounded-lg">
                  <Package className="h-8 w-8 text-slate-500 mx-auto mb-2" />
                  <p className="text-slate-400">No custom templates yet</p>
                  <p className="text-sm text-slate-500">
                    Create a template to quickly assign app access to members
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {customTemplates.map((template) => (
                    <div
                      key={template.id}
                      className="p-4 bg-slate-800 border border-slate-700 rounded-lg"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="p-2 rounded-lg"
                          style={{ backgroundColor: `${template.color}20` }}
                        >
                          <span style={{ color: template.color }}>
                            {TEMPLATE_ICONS[template.icon] || (
                              <Package className="h-5 w-5" />
                            )}
                          </span>
                        </div>
                        <div className="flex-1">
                          <h3 className="font-medium text-white">
                            {template.name}
                          </h3>
                          {template.description && (
                            <p className="text-sm text-slate-400 mt-1">
                              {template.description}
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap gap-1">
                            {Object.entries(template.app_config)
                              .filter(([, config]) => config.enabled)
                              .slice(0, 4)
                              .map(([appId]) => {
                                const app = apps.find((a) => a.id === appId);
                                return (
                                  <span
                                    key={appId}
                                    className="px-2 py-0.5 text-xs rounded bg-slate-700/50 text-slate-400"
                                  >
                                    {app?.name || appId}
                                  </span>
                                );
                              })}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(template.id)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingTemplate(template.id)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* Create/Edit Modal */}
      <Dialog
        open={showCreateModal || !!editingTemplate}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateModal(false);
            setEditingTemplate(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Template" : "Create Template"}
            </DialogTitle>
            <DialogDescription>
              Configure which apps are included in this template.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-300">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                className="mt-1 w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-white"
                placeholder="e.g., Engineering Team"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-300">
                Description
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                className="mt-1 w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-white"
                placeholder="Optional description"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-300">Color</label>
              <div className="mt-1 flex gap-2">
                {["#2563eb", "#f43f5e", "#06b6d4", "#9333ea", "#10b981", "#f59e0b"].map(
                  (color) => (
                    <button
                      key={color}
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, color }))
                      }
                      className={`w-8 h-8 rounded-lg border-2 ${
                        formData.color === color
                          ? "border-white"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  )
                )}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-300">
                Included Apps
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {apps.map((app) => {
                  const isEnabled = formData.appConfig[app.id]?.enabled ?? false;
                  const Icon = app.icon;
                  return (
                    <button
                      key={app.id}
                      onClick={() => toggleAppInForm(app.id)}
                      disabled={app.id === "dashboard"} // Dashboard always enabled
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition ${
                        isEnabled
                          ? "bg-violet-500/20 border border-violet-500/50 text-white"
                          : "bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600"
                      } ${app.id === "dashboard" ? "opacity-50" : ""}`}
                    >
                      <Icon className="h-4 w-4" />
                      {app.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setEditingTemplate(null);
                resetForm();
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={editingTemplate ? handleUpdate : handleCreate}
              disabled={isSaving || !formData.name}
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingTemplate ? "Save Changes" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog
        open={!!deletingTemplate}
        onOpenChange={(open) => !open && setDeletingTemplate(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this template? This action cannot
              be undone. Members who have this template applied will keep their
              current access settings.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingTemplate(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
