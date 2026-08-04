"use client";

/**
 * CRM objects — the schema behind Companies, People, Deals and any custom object.
 *
 * This page used to live at `/crm/settings` and render its own full-height chrome:
 * a 256px left column carrying a two-item section switcher (Objects /
 * Integrations) *and* the object list, plus its own breadcrumb and `<h1>`. Inside
 * the Settings shell that would be a third navigation tree stacked beside the
 * shell's own sidebar, so the section switcher is gone — Integrations is now a
 * real page at `/settings/crm/integrations` — and the object list is a plain
 * column of this one.
 */

import { useEffect, useState } from "react";
import {
  Database,
  DollarSign,
  Building2,
  Edit2,
  FolderKanban,
  LayoutGrid,
  Link2,
  Palette,
  Save,
  Settings,
  Target,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useCRMObjects, useCRMAttributes } from "@/hooks/useCRM";
import {
  CRMObject,
  CRMAttribute,
  CRMAttributeType,
  CRMObjectType,
} from "@/lib/api";
import { AttributeList } from "@/components/crm/AttributeList";
import { CreateAttributeModal } from "@/components/crm/CreateAttributeModal";
import { ColorPicker } from "@/components/crm/ColorPicker";
import { AppAccessGuard } from "@/components/guards/AppAccessGuard";
import {
  SettingsEmptyState,
  SettingsPage,
  SettingsRow,
  SettingsRowGroup,
  SettingsSection,
  SettingsSkeleton,
} from "@/components/settings/SettingsPrimitives";

type SettingsTab = "configuration" | "appearance" | "attributes";

const objectTypeIcons: Record<CRMObjectType, React.ReactNode> = {
  company: <Building2 className="h-5 w-5" />,
  person: <Users className="h-5 w-5" />,
  deal: <DollarSign className="h-5 w-5" />,
  lead: <Target className="h-5 w-5" />,
  project: <FolderKanban className="h-5 w-5" />,
  custom: <LayoutGrid className="h-5 w-5" />,
};

function objectIcon(object: CRMObject): React.ReactNode {
  return objectTypeIcons[object.object_type as CRMObjectType] || objectTypeIcons.custom;
}

// ------------------------------------------------------------- configuration

function ConfigurationTab({
  object,
  onUpdate,
  isUpdating,
}: {
  object: CRMObject;
  onUpdate: (data: { name: string; plural_name: string; description: string }) => Promise<void>;
  isUpdating: boolean;
}) {
  const t = useTranslations("settingsCrm");
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(object.name);
  const [pluralName, setPluralName] = useState(object.plural_name);
  const [description, setDescription] = useState(object.description || "");

  // The selected object changes without this component unmounting, so the draft
  // has to follow it — otherwise switching from Companies to People shows the
  // Companies name in the People form.
  useEffect(() => {
    setIsEditing(false);
    setName(object.name);
    setPluralName(object.plural_name);
    setDescription(object.description || "");
  }, [object.id, object.name, object.plural_name, object.description]);

  const handleSave = async () => {
    await onUpdate({ name, plural_name: pluralName, description });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setName(object.name);
    setPluralName(object.plural_name);
    setDescription(object.description || "");
    setIsEditing(false);
  };

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <>
      <SettingsSection
        title={t("config.basics")}
        description={t("config.basicsDetail")}
        actions={
          !isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
            >
              <Edit2 className="h-3.5 w-3.5" aria-hidden />
              {t("config.edit")}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancel}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                {t("config.cancel")}
              </button>
              <button
                onClick={handleSave}
                disabled={isUpdating}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" aria-hidden />
                {isUpdating ? t("config.saving") : t("config.save")}
              </button>
            </div>
          )
        }
      >
        <SettingsRowGroup>
          <SettingsRow
            label={t("config.nameSingular")}
            htmlFor={isEditing ? "crm-object-name" : undefined}
            control={
              isEditing ? undefined : (
                <span className="text-sm text-muted-foreground">{object.name}</span>
              )
            }
          >
            {isEditing && (
              <input
                id="crm-object-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={cn(inputClass, "mt-2")}
              />
            )}
          </SettingsRow>

          <SettingsRow
            label={t("config.namePlural")}
            htmlFor={isEditing ? "crm-object-plural" : undefined}
            control={
              isEditing ? undefined : (
                <span className="text-sm text-muted-foreground">{object.plural_name}</span>
              )
            }
          >
            {isEditing && (
              <input
                id="crm-object-plural"
                type="text"
                value={pluralName}
                onChange={(e) => setPluralName(e.target.value)}
                className={cn(inputClass, "mt-2")}
              />
            )}
          </SettingsRow>

          <SettingsRow label={t("config.description")} htmlFor={isEditing ? "crm-object-desc" : undefined}>
            {isEditing ? (
              <textarea
                id="crm-object-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className={cn(inputClass, "mt-2 resize-none")}
              />
            ) : (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {object.description || t("config.noDescription")}
              </p>
            )}
          </SettingsRow>
        </SettingsRowGroup>
      </SettingsSection>

      <SettingsSection title={t("config.type")}>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            {objectIcon(object)}
          </span>
          <div>
            <p className="text-sm font-medium capitalize text-foreground">{object.object_type}</p>
            <p className="text-sm text-muted-foreground">
              {object.is_system ? t("config.systemObject") : t("config.customObject")}
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t("config.stats")} flush>
        <dl className="grid gap-px bg-border sm:grid-cols-3">
          {[
            { label: t("config.records"), value: object.record_count },
            { label: t("config.attributes"), value: object.attributes?.length || 0 },
            {
              label: t("config.created"),
              value: new Date(object.created_at).toLocaleDateString(),
            },
          ].map((stat) => (
            <div key={stat.label} className="bg-surface px-5 py-4">
              <dd className="text-xl font-semibold text-foreground">{stat.value}</dd>
              <dt className="mt-0.5 text-xs text-muted-foreground">{stat.label}</dt>
            </div>
          ))}
        </dl>
      </SettingsSection>
    </>
  );
}

// ---------------------------------------------------------------- appearance

function AppearanceTab({
  object,
  onUpdate,
}: {
  object: CRMObject;
  onUpdate: (data: { color?: string; icon?: string }) => Promise<void>;
}) {
  const t = useTranslations("settingsCrm");
  const [color, setColor] = useState(object.color || "#a855f7");

  useEffect(() => {
    setColor(object.color || "#a855f7");
  }, [object.id, object.color]);

  const handleColorChange = async (newColor: string) => {
    setColor(newColor);
    await onUpdate({ color: newColor });
  };

  return (
    <>
      <SettingsSection title={t("appearance.color")} description={t("appearance.colorDetail")}>
        <div className="flex items-center gap-4">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: color }}
          >
            {objectIcon(object)}
          </span>
          <ColorPicker value={color} onChange={handleColorChange} size="lg" />
        </div>
      </SettingsSection>

      <SettingsSection title={t("appearance.icon")} description={t("appearance.iconDetail")}>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            {objectIcon(object)}
          </span>
          <span className="text-sm capitalize text-foreground">
            {t("appearance.typeIcon", { type: object.object_type })}
          </span>
        </div>
      </SettingsSection>
    </>
  );
}

// ---------------------------------------------------------------- attributes

function AttributesTab({ objectId }: { objectId: string }) {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const { attributes, isLoading, createAttribute, deleteAttribute, isCreating } =
    useCRMAttributes(workspaceId, objectId);

  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleCreate = async (data: {
    name: string;
    attribute_type: CRMAttributeType;
    description?: string;
    is_required: boolean;
    is_unique: boolean;
    config?: Record<string, unknown>;
  }) => {
    await createAttribute(data);
  };

  return (
    <>
      {/*
        No `onReorder` and no `onEdit`: the list makes rows draggable when it is
        given a reorder handler, and there is no endpoint to persist an order, so
        the previous version let you drag a row and silently lose the result on
        reload. The same went for edit — it set a state nothing rendered. Both
        affordances are hidden until they have something behind them.
      */}
      <AttributeList
        attributes={attributes}
        onDelete={(attribute: CRMAttribute) => deleteAttribute(attribute.id)}
        onAdd={() => setShowCreateModal(true)}
        isLoading={isLoading}
      />

      <CreateAttributeModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreate}
        isCreating={isCreating}
        workspaceId={workspaceId}
      />
    </>
  );
}

// --------------------------------------------------------------------- page

function CRMObjectSettings() {
  const t = useTranslations("settingsCrm");
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const { objects, isLoading, updateObject, deleteObject, isUpdating, isDeleting } =
    useCRMObjects(workspaceId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("configuration");

  // Resolve from the live list rather than holding a copy, so an edit is
  // reflected here as soon as the query invalidates.
  const selectedObject = objects.find((o) => o.id === selectedId) || objects[0] || null;

  const handleUpdateObject = async (data: Record<string, unknown>) => {
    if (selectedObject) {
      await updateObject({ objectId: selectedObject.id, data });
    }
  };

  const handleDeleteObject = async () => {
    if (!selectedObject || selectedObject.is_system) return;
    if (!confirm(t("deleteConfirm", { name: selectedObject.name }))) return;
    await deleteObject(selectedObject.id);
    setSelectedId(null);
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: "configuration", label: t("tabs.configuration"), icon: <Settings className="h-4 w-4" /> },
    { id: "appearance", label: t("tabs.appearance"), icon: <Palette className="h-4 w-4" /> },
    { id: "attributes", label: t("tabs.attributes"), icon: <Database className="h-4 w-4" /> },
  ];

  return (
    <SettingsPage
      title={t("title")}
      description={t("description")}
      width="wide"
      actions={
        <Link
          href="/settings/crm/integrations"
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
        >
          <Link2 className="h-4 w-4" aria-hidden />
          {t("integrations.title")}
        </Link>
      }
    >
      {isLoading ? (
        <SettingsSkeleton rows={2} />
      ) : objects.length === 0 ? (
        <SettingsSection>
          <SettingsEmptyState
            icon={<Database className="h-8 w-8" aria-hidden />}
            title={t("empty.title")}
            description={t("empty.description")}
          />
        </SettingsSection>
      ) : (
        // `grid-cols-1` is not redundant: without it the mobile grid has no
        // explicit template, so its single implicit column sizes to `auto` —
        // i.e. max-content — and the object list pushed the section 16px past a
        // 375px viewport, where an ancestor clipped it.
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
          {/* Object list */}
          <SettingsSection title={t("objects")} flush>
            <ul className="divide-y divide-border">
              {objects.map((object) => {
                const isSelected = selectedObject?.id === object.id;
                return (
                  <li key={object.id}>
                    <button
                      onClick={() => {
                        setSelectedId(object.id);
                        setActiveTab("configuration");
                      }}
                      aria-current={isSelected ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                        isSelected ? "bg-accent" : "hover:bg-surface-hover"
                      )}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground [&>svg]:h-4 [&>svg]:w-4"
                        style={{
                          backgroundColor: object.color ? `${object.color}20` : undefined,
                        }}
                      >
                        {objectIcon(object)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {object.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {t("recordCount", { count: object.record_count })}
                        </span>
                      </span>
                      {object.is_system && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {t("system")}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </SettingsSection>

          {/* Selected object */}
          {selectedObject && (
            <div className="space-y-5">
              {/*
                Scrolls rather than stretching the page: three tabs do not fit in
                375px, and a flex row that overflows widens its grid column, which
                pushed the whole settings body past the viewport on mobile.
              */}
              <div
                role="tablist"
                aria-label={t("tabsLabel")}
                className="flex gap-1 overflow-x-auto border-b border-border"
              >
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                      activeTab === tab.id
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                    )}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === "configuration" && (
                <ConfigurationTab
                  object={selectedObject}
                  onUpdate={handleUpdateObject}
                  isUpdating={isUpdating}
                />
              )}
              {activeTab === "appearance" && (
                <AppearanceTab object={selectedObject} onUpdate={handleUpdateObject} />
              )}
              {activeTab === "attributes" && <AttributesTab objectId={selectedObject.id} />}

              {!selectedObject.is_system && (
                <SettingsSection
                  title={t("danger.title")}
                  description={t("danger.description", { name: selectedObject.name })}
                >
                  <button
                    onClick={handleDeleteObject}
                    disabled={isDeleting}
                    className="inline-flex items-center gap-2 rounded-md border border-destructive/40 px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    {isDeleting ? t("danger.deleting") : t("danger.delete")}
                  </button>
                </SettingsSection>
              )}
            </div>
          )}
        </div>
      )}
    </SettingsPage>
  );
}

export default function CRMSettingsPage() {
  return (
    <AppAccessGuard appId="crm">
      <CRMObjectSettings />
    </AppAccessGuard>
  );
}
