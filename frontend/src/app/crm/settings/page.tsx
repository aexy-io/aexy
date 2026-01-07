"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Plus,
  Settings,
  Trash2,
  Edit2,
  Save,
  X,
  Building2,
  Users,
  DollarSign,
  LayoutGrid,
  Palette,
  Database,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useCRMObjects, useCRMAttributes } from "@/hooks/useCRM";
import { CRMObject, CRMAttribute, CRMAttributeType, CRMObjectType } from "@/lib/api";
import {
  ObjectSettingsNav,
  ObjectSettingsNavVertical,
  SettingsTab,
} from "@/components/crm/ObjectSettingsNav";
import { AttributeList } from "@/components/crm/AttributeList";
import { CreateAttributeModal } from "@/components/crm/CreateAttributeModal";
import { ColorPicker } from "@/components/crm/ColorPicker";

const objectTypeIcons: Record<CRMObjectType, React.ReactNode> = {
  company: <Building2 className="h-5 w-5" />,
  person: <Users className="h-5 w-5" />,
  deal: <DollarSign className="h-5 w-5" />,
  custom: <LayoutGrid className="h-5 w-5" />,
};

// Configuration Tab Content
function ConfigurationTab({
  object,
  onUpdate,
  isUpdating,
}: {
  object: CRMObject;
  onUpdate: (data: { name: string; plural_name: string; description: string }) => Promise<void>;
  isUpdating: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(object.name);
  const [pluralName, setPluralName] = useState(object.plural_name);
  const [description, setDescription] = useState(object.description || "");

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

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Basic Information</h3>
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
            >
              <Edit2 className="h-4 w-4" />
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancel}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isUpdating}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white rounded-lg transition-colors"
              >
                <Save className="h-4 w-4" />
                {isUpdating ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Name (singular)
            </label>
            {isEditing ? (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            ) : (
              <p className="text-white">{object.name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Name (plural)
            </label>
            {isEditing ? (
              <input
                type="text"
                value={pluralName}
                onChange={(e) => setPluralName(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            ) : (
              <p className="text-white">{object.plural_name}</p>
            )}
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Description
            </label>
            {isEditing ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
            ) : (
              <p className="text-slate-300">{object.description || "No description"}</p>
            )}
          </div>
        </div>
      </div>

      {/* Object Type */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Object Type</h3>
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-500/20 rounded-lg text-purple-400">
            {objectTypeIcons[object.object_type as CRMObjectType] || objectTypeIcons.custom}
          </div>
          <div>
            <p className="text-white font-medium capitalize">{object.object_type}</p>
            <p className="text-sm text-slate-400">
              {object.is_system ? "System object (cannot be changed)" : "Custom object"}
            </p>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Statistics</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-slate-700/30 rounded-lg">
            <p className="text-2xl font-bold text-white">{object.record_count}</p>
            <p className="text-sm text-slate-400">Records</p>
          </div>
          <div className="p-4 bg-slate-700/30 rounded-lg">
            <p className="text-2xl font-bold text-white">{object.attribute_count || 0}</p>
            <p className="text-sm text-slate-400">Attributes</p>
          </div>
          <div className="p-4 bg-slate-700/30 rounded-lg">
            <p className="text-2xl font-bold text-white">
              {new Date(object.created_at).toLocaleDateString()}
            </p>
            <p className="text-sm text-slate-400">Created</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Appearance Tab Content
function AppearanceTab({
  object,
  onUpdate,
  isUpdating,
}: {
  object: CRMObject;
  onUpdate: (data: { color?: string; icon?: string }) => Promise<void>;
  isUpdating: boolean;
}) {
  const [color, setColor] = useState(object.color || "#a855f7");

  const handleColorChange = async (newColor: string) => {
    setColor(newColor);
    await onUpdate({ color: newColor });
  };

  return (
    <div className="space-y-6">
      {/* Color */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Object Color</h3>
        <p className="text-sm text-slate-400 mb-4">
          Choose a color to identify this object throughout the CRM
        </p>
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: color }}
          >
            {objectTypeIcons[object.object_type as CRMObjectType] || objectTypeIcons.custom}
          </div>
          <ColorPicker color={color} onChange={handleColorChange} size="lg" />
        </div>
      </div>

      {/* Icon */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Object Icon</h3>
        <p className="text-sm text-slate-400 mb-4">
          Icon is determined by the object type and cannot be changed
        </p>
        <div className="flex items-center gap-3">
          <div className="p-3 bg-slate-700 rounded-lg text-slate-400">
            {objectTypeIcons[object.object_type as CRMObjectType] || objectTypeIcons.custom}
          </div>
          <span className="text-slate-300 capitalize">{object.object_type} icon</span>
        </div>
      </div>
    </div>
  );
}

// Attributes Tab Content
function AttributesTab({ objectId }: { objectId: string }) {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const {
    attributes,
    isLoading,
    createAttribute,
    updateAttribute,
    deleteAttribute,
    isCreating,
  } = useCRMAttributes(workspaceId, objectId);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAttribute, setEditingAttribute] = useState<CRMAttribute | null>(null);

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

  const handleDelete = async (attribute: CRMAttribute) => {
    await deleteAttribute(attribute.id);
  };

  const handleReorder = (reorderedAttributes: CRMAttribute[]) => {
    // TODO: Implement attribute reordering API
    console.log("Reorder attributes:", reorderedAttributes.map((a) => a.id));
  };

  return (
    <div className="space-y-4">
      <AttributeList
        attributes={attributes}
        onReorder={handleReorder}
        onEdit={setEditingAttribute}
        onDelete={handleDelete}
        onAdd={() => setShowCreateModal(true)}
        isLoading={isLoading}
      />

      <CreateAttributeModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreate}
        isCreating={isCreating}
      />
    </div>
  );
}

export default function CRMSettingsPage() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const {
    objects,
    isLoading,
    updateObject,
    deleteObject,
    isUpdating,
    isDeleting,
  } = useCRMObjects(workspaceId);

  const [selectedObject, setSelectedObject] = useState<CRMObject | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("configuration");

  // Auto-select first object
  if (!selectedObject && objects.length > 0 && !isLoading) {
    setSelectedObject(objects[0]);
  }

  const handleUpdateObject = async (data: Record<string, unknown>) => {
    if (selectedObject) {
      await updateObject({ objectId: selectedObject.id, data });
    }
  };

  const handleDeleteObject = async () => {
    if (!selectedObject) return;
    if (selectedObject.is_system) {
      alert("System objects cannot be deleted");
      return;
    }
    if (confirm("Delete this object and all its records?")) {
      await deleteObject(selectedObject.id);
      setSelectedObject(objects.find((o) => o.id !== selectedObject.id) || null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex">
        <div className="w-64 bg-slate-800/30 border-r border-slate-700 p-4">
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-slate-800 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-20 bg-slate-800 rounded-xl" />
            <div className="h-64 bg-slate-800 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Sidebar - Object list */}
      <div className="w-64 flex flex-col bg-slate-800/30 border-r border-slate-700">
        {/* Header */}
        <div className="p-4 border-b border-slate-700">
          <button
            onClick={() => router.push("/crm")}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-3"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to CRM
          </button>
          <h1 className="text-lg font-bold text-white">CRM Settings</h1>
        </div>

        {/* Object list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {objects.map((object) => {
            const icon =
              objectTypeIcons[object.object_type as CRMObjectType] || objectTypeIcons.custom;
            const isSelected = selectedObject?.id === object.id;

            return (
              <button
                key={object.id}
                onClick={() => {
                  setSelectedObject(object);
                  setActiveTab("configuration");
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                  isSelected
                    ? "bg-purple-500/20 text-white"
                    : "text-slate-300 hover:bg-slate-700/50"
                }`}
              >
                <div
                  className={`p-1.5 rounded-lg ${isSelected ? "text-purple-400" : "text-slate-400"}`}
                  style={{
                    backgroundColor: object.color ? `${object.color}20` : undefined,
                  }}
                >
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{object.name}</div>
                  <div className="text-xs text-slate-500">{object.record_count} records</div>
                </div>
                {object.is_system && (
                  <span className="px-1.5 py-0.5 bg-slate-700 rounded text-xs text-slate-500">
                    System
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedObject ? (
          <>
            {/* Object header with tabs */}
            <ObjectSettingsNav
              object={selectedObject}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === "configuration" && (
                <ConfigurationTab
                  object={selectedObject}
                  onUpdate={handleUpdateObject}
                  isUpdating={isUpdating}
                />
              )}

              {activeTab === "appearance" && (
                <AppearanceTab
                  object={selectedObject}
                  onUpdate={handleUpdateObject}
                  isUpdating={isUpdating}
                />
              )}

              {activeTab === "attributes" && (
                <AttributesTab objectId={selectedObject.id} />
              )}
            </div>

            {/* Delete object button */}
            {!selectedObject.is_system && (
              <div className="p-6 border-t border-slate-700">
                <button
                  onClick={handleDeleteObject}
                  disabled={isDeleting}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-600/30 text-red-400 rounded-lg transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  {isDeleting ? "Deleting..." : "Delete Object"}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Settings className="h-16 w-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 text-lg">Select an object to configure</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
