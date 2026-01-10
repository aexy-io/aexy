"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/layout/AppHeader";
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
  Link2,
  Mail,
  Calendar,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
  Clock,
  Shield,
  Bot,
  Filter,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useCRMObjects, useCRMAttributes } from "@/hooks/useCRM";
import {
  CRMObject,
  CRMAttribute,
  CRMAttributeType,
  CRMObjectType,
  googleIntegrationApi,
  developerApi,
  GoogleIntegrationStatus,
  DealCreationSettings,
} from "@/lib/api";
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

const DEFAULT_DEAL_SETTINGS: DealCreationSettings = {
  auto_create_deals: false,
  deal_creation_mode: "auto",
  skip_personal_domains: true,
  default_deal_stage: "new",
  default_deal_value: null,
  criteria: {
    subject_keywords: [],
    body_keywords: [],
    from_domains: [],
  },
};

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

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
            <p className="text-2xl font-bold text-white">{object.attributes?.length || 0}</p>
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
          <ColorPicker value={color} onChange={handleColorChange} size="lg" />
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

// Integrations Tab Content
function IntegrationsTab({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<GoogleIntegrationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [syncResult, setSyncResult] = useState<{ gmail?: string; calendar?: string } | null>(null);
  const [dealSettings, setDealSettings] = useState<DealCreationSettings>(DEFAULT_DEAL_SETTINGS);
  const [showDealSettings, setShowDealSettings] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [newDomain, setNewDomain] = useState("");

  // Check for callback status
  useEffect(() => {
    const googleStatus = searchParams.get("google");
    if (googleStatus === "connected") {
      setSyncResult({ gmail: "Connected successfully!" });
    } else if (googleStatus === "error") {
      const message = searchParams.get("message") || "Connection failed";
      setSyncResult({ gmail: `Error: ${message}` });
    }
  }, [searchParams]);

  // Fetch status
  useEffect(() => {
    const fetchStatus = async () => {
      if (!workspaceId) return;
      try {
        let data = await googleIntegrationApi.getStatus(workspaceId);

        if (!data.is_connected) {
          try {
            const developerStatus = await developerApi.getGoogleStatus();
            if (developerStatus.is_connected) {
              await googleIntegrationApi.connectFromDeveloper(workspaceId);
              data = await googleIntegrationApi.getStatus(workspaceId);
            }
          } catch {
            // Continue with workspace-only status
          }
        }

        setStatus(data);
        if (data.sync_settings?.deal_settings) {
          setDealSettings({ ...DEFAULT_DEAL_SETTINGS, ...data.sync_settings.deal_settings });
        }
      } catch {
        setStatus(null);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStatus();
  }, [workspaceId]);

  const handleConnect = async () => {
    if (!workspaceId) return;
    try {
      const { auth_url } = await googleIntegrationApi.getConnectUrl(workspaceId, window.location.href);
      window.location.href = auth_url;
    } catch (error) {
      console.error("Failed to get connect URL:", error);
    }
  };

  const handleDisconnect = async () => {
    if (!workspaceId || !confirm("Are you sure you want to disconnect Google integration?")) return;
    setIsDisconnecting(true);
    try {
      await googleIntegrationApi.disconnect(workspaceId);
      setStatus(null);
    } catch (error) {
      console.error("Failed to disconnect:", error);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleGmailSync = async () => {
    if (!workspaceId) return;
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await googleIntegrationApi.gmail.sync(workspaceId, { full_sync: false });
      setSyncResult({ gmail: `Synced ${result.messages_synced} emails` });
      const newStatus = await googleIntegrationApi.getStatus(workspaceId);
      setStatus(newStatus);
    } catch (error) {
      setSyncResult({ gmail: "Sync failed" });
      console.error("Gmail sync failed:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCalendarSync = async () => {
    if (!workspaceId) return;
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await googleIntegrationApi.calendar.sync(workspaceId);
      setSyncResult({ calendar: `Synced ${result.events_synced} events` });
      const newStatus = await googleIntegrationApi.getStatus(workspaceId);
      setStatus(newStatus);
    } catch (error) {
      setSyncResult({ calendar: "Sync failed" });
      console.error("Calendar sync failed:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateSettings = async (settings: { gmail_sync_enabled?: boolean; calendar_sync_enabled?: boolean }) => {
    if (!workspaceId) return;
    try {
      const newStatus = await googleIntegrationApi.updateSettings(workspaceId, settings);
      setStatus(newStatus);
    } catch (error) {
      console.error("Failed to update settings:", error);
    }
  };

  const handleEnrichContacts = async () => {
    if (!workspaceId) return;
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await googleIntegrationApi.enrichContacts(workspaceId);
      setSyncResult({
        gmail: `Processed ${result.emails_processed} emails, created ${result.contacts_created} contacts`,
      });
    } catch (error) {
      setSyncResult({ gmail: "Enrichment failed" });
      console.error("Contact enrichment failed:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateDealSettings = async (newSettings: Partial<DealCreationSettings>) => {
    if (!workspaceId) return;
    const updatedSettings = { ...dealSettings, ...newSettings };
    setDealSettings(updatedSettings);
    try {
      const newStatus = await googleIntegrationApi.updateSettings(workspaceId, {
        sync_settings: {
          ...status?.sync_settings,
          deal_settings: updatedSettings,
        },
      });
      setStatus(newStatus);
    } catch (error) {
      console.error("Failed to update deal settings:", error);
      setDealSettings(dealSettings);
    }
  };

  const addSubjectKeyword = () => {
    if (!newKeyword.trim()) return;
    const keywords = [...dealSettings.criteria.subject_keywords, newKeyword.trim().toLowerCase()];
    handleUpdateDealSettings({
      criteria: { ...dealSettings.criteria, subject_keywords: keywords },
    });
    setNewKeyword("");
  };

  const removeSubjectKeyword = (keyword: string) => {
    const keywords = dealSettings.criteria.subject_keywords.filter((k) => k !== keyword);
    handleUpdateDealSettings({
      criteria: { ...dealSettings.criteria, subject_keywords: keywords },
    });
  };

  const addDomain = () => {
    if (!newDomain.trim()) return;
    const domains = [...dealSettings.criteria.from_domains, newDomain.trim().toLowerCase()];
    handleUpdateDealSettings({
      criteria: { ...dealSettings.criteria, from_domains: domains },
    });
    setNewDomain("");
  };

  const removeDomain = (domain: string) => {
    const domains = dealSettings.criteria.from_domains.filter((d) => d !== domain);
    handleUpdateDealSettings({
      criteria: { ...dealSettings.criteria, from_domains: domains },
    });
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-32 bg-slate-800 rounded-xl" />
        <div className="h-64 bg-slate-800 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Google Integration Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-slate-800/30 border border-slate-700/50 rounded-xl overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-700/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center shadow-lg">
                <GoogleIcon className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Google Integration</h2>
                <p className="text-slate-400">Gmail & Calendar sync for CRM</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {status?.is_connected ? (
                <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  Connected
                </span>
              ) : (
                <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-700/50 border border-slate-600 text-slate-400 text-sm">
                  <XCircle className="w-4 h-4" />
                  Not connected
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Connection status */}
        {status?.is_connected ? (
          <>
            {/* Connected email */}
            <div className="p-6 border-b border-slate-700/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-slate-400" />
                  <div>
                    <p className="text-white font-medium">{status.google_email}</p>
                    <p className="text-sm text-slate-500">Connected Google account</p>
                  </div>
                </div>
                <button
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  {isDisconnecting ? "Disconnecting..." : "Disconnect"}
                </button>
              </div>
            </div>

            {/* Sync options */}
            <div className="p-6 space-y-6">
              {/* Gmail Sync */}
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-blue-500/10 text-blue-400">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white">Gmail Sync</h3>
                    <p className="text-sm text-slate-400 mt-1">
                      Sync emails to populate contacts and track communication
                    </p>
                    {status.gmail_last_sync_at && (
                      <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Last synced: {new Date(status.gmail_last_sync_at).toLocaleString()}
                      </p>
                    )}
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {status.messages_synced} messages synced
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleGmailSync}
                    disabled={isSyncing || !status.gmail_sync_enabled}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                    Sync Now
                  </button>
                  <button
                    onClick={() => handleUpdateSettings({ gmail_sync_enabled: !status.gmail_sync_enabled })}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      status.gmail_sync_enabled ? "bg-purple-500" : "bg-slate-700"
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        status.gmail_sync_enabled ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Calendar Sync */}
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-green-500/10 text-green-400">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white">Calendar Sync</h3>
                    <p className="text-sm text-slate-400 mt-1">
                      Sync events to track meetings with contacts
                    </p>
                    {status.calendar_last_sync_at && (
                      <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Last synced: {new Date(status.calendar_last_sync_at).toLocaleString()}
                      </p>
                    )}
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {status.events_synced} events synced
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCalendarSync}
                    disabled={isSyncing || !status.calendar_sync_enabled}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                    Sync Now
                  </button>
                  <button
                    onClick={() => handleUpdateSettings({ calendar_sync_enabled: !status.calendar_sync_enabled })}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      status.calendar_sync_enabled ? "bg-purple-500" : "bg-slate-700"
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        status.calendar_sync_enabled ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* AI Enrichment */}
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-purple-500/10 text-purple-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white">AI Contact Enrichment</h3>
                    <p className="text-sm text-slate-400 mt-1">
                      Extract contact details from email signatures using AI
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleEnrichContacts}
                  disabled={isSyncing}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  Run Enrichment
                </button>
              </div>

              {/* Deal Auto-Creation */}
              <div className="border-t border-slate-700/50 pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-amber-500/10 text-amber-400">
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-medium text-white">Auto-Create Deals from Emails</h3>
                      <p className="text-sm text-slate-400 mt-1">
                        Automatically create deals when new emails are synced
                      </p>
                      {dealSettings.auto_create_deals && (
                        <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          Mode: {dealSettings.deal_creation_mode === "auto" ? "All business emails" :
                                 dealSettings.deal_creation_mode === "ai" ? "AI-detected opportunities" :
                                 "Matching criteria only"}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowDealSettings(!showDealSettings)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      Configure
                    </button>
                    <button
                      onClick={() => handleUpdateDealSettings({ auto_create_deals: !dealSettings.auto_create_deals })}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        dealSettings.auto_create_deals ? "bg-amber-500" : "bg-slate-700"
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                          dealSettings.auto_create_deals ? "left-6" : "left-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Deal Settings Panel */}
                {showDealSettings && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 ml-14 p-4 bg-slate-800/50 rounded-lg border border-slate-700/50 space-y-4"
                  >
                    {/* Creation Mode */}
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Deal Creation Mode
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => handleUpdateDealSettings({ deal_creation_mode: "auto" })}
                          className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors ${
                            dealSettings.deal_creation_mode === "auto"
                              ? "border-amber-500 bg-amber-500/10 text-amber-400"
                              : "border-slate-600 hover:border-slate-500 text-slate-400"
                          }`}
                        >
                          <Zap className="w-5 h-5" />
                          <span className="text-xs font-medium">Auto</span>
                          <span className="text-xs text-slate-500">All emails</span>
                        </button>
                        <button
                          onClick={() => handleUpdateDealSettings({ deal_creation_mode: "ai" })}
                          className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors ${
                            dealSettings.deal_creation_mode === "ai"
                              ? "border-purple-500 bg-purple-500/10 text-purple-400"
                              : "border-slate-600 hover:border-slate-500 text-slate-400"
                          }`}
                        >
                          <Bot className="w-5 h-5" />
                          <span className="text-xs font-medium">AI</span>
                          <span className="text-xs text-slate-500">Smart detection</span>
                        </button>
                        <button
                          onClick={() => handleUpdateDealSettings({ deal_creation_mode: "criteria" })}
                          className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors ${
                            dealSettings.deal_creation_mode === "criteria"
                              ? "border-blue-500 bg-blue-500/10 text-blue-400"
                              : "border-slate-600 hover:border-slate-500 text-slate-400"
                          }`}
                        >
                          <Filter className="w-5 h-5" />
                          <span className="text-xs font-medium">Criteria</span>
                          <span className="text-xs text-slate-500">Rules-based</span>
                        </button>
                      </div>
                    </div>

                    {/* Skip Personal Domains */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-300">Skip personal email domains</p>
                        <p className="text-xs text-slate-500">Gmail, Yahoo, Outlook, etc.</p>
                      </div>
                      <button
                        onClick={() => handleUpdateDealSettings({ skip_personal_domains: !dealSettings.skip_personal_domains })}
                        className={`relative w-10 h-5 rounded-full transition-colors ${
                          dealSettings.skip_personal_domains ? "bg-amber-500" : "bg-slate-700"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                            dealSettings.skip_personal_domains ? "left-5" : "left-0.5"
                          }`}
                        />
                      </button>
                    </div>

                    {/* Default Stage */}
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Default Deal Stage
                      </label>
                      <input
                        type="text"
                        value={dealSettings.default_deal_stage}
                        onChange={(e) => handleUpdateDealSettings({ default_deal_stage: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                        placeholder="new"
                      />
                    </div>

                    {/* Criteria Settings */}
                    {dealSettings.deal_creation_mode === "criteria" && (
                      <div className="space-y-4 pt-4 border-t border-slate-700">
                        <p className="text-sm font-medium text-slate-300">Filter Criteria</p>

                        {/* Subject Keywords */}
                        <div>
                          <label className="block text-xs text-slate-400 mb-2">
                            Subject Keywords (creates deal if subject contains any)
                          </label>
                          <div className="flex gap-2 mb-2">
                            <input
                              type="text"
                              value={newKeyword}
                              onChange={(e) => setNewKeyword(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && addSubjectKeyword()}
                              className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                              placeholder="e.g., quote, proposal, pricing"
                            />
                            <button
                              onClick={addSubjectKeyword}
                              className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {dealSettings.criteria.subject_keywords.map((keyword) => (
                              <span
                                key={keyword}
                                className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs"
                              >
                                {keyword}
                                <button onClick={() => removeSubjectKeyword(keyword)}>
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* From Domains */}
                        <div>
                          <label className="block text-xs text-slate-400 mb-2">
                            From Domains (creates deal if sender is from domain)
                          </label>
                          <div className="flex gap-2 mb-2">
                            <input
                              type="text"
                              value={newDomain}
                              onChange={(e) => setNewDomain(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && addDomain()}
                              className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-green-500"
                              placeholder="e.g., enterprise.com"
                            />
                            <button
                              onClick={addDomain}
                              className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {dealSettings.criteria.from_domains.map((domain) => (
                              <span
                                key={domain}
                                className="flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs"
                              >
                                {domain}
                                <button onClick={() => removeDomain(domain)}>
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Mode descriptions */}
                    <div className="pt-4 border-t border-slate-700">
                      <p className="text-xs text-slate-500">
                        {dealSettings.deal_creation_mode === "auto" && (
                          <>
                            <strong>Auto mode:</strong> Creates a deal for every new email from business domains.
                            Existing deals linked to the same company will be updated instead.
                          </>
                        )}
                        {dealSettings.deal_creation_mode === "ai" && (
                          <>
                            <strong>AI mode:</strong> Uses AI to analyze email content and only creates deals
                            for emails that indicate sales opportunities (pricing requests, proposals, demos, etc.)
                          </>
                        )}
                        {dealSettings.deal_creation_mode === "criteria" && (
                          <>
                            <strong>Criteria mode:</strong> Only creates deals when the email matches
                            your specified keywords or domains. Good for high-volume inboxes.
                          </>
                        )}
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Sync result message */}
              {syncResult && (
                <div className="mt-4 p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                  <div className="flex items-center gap-2">
                    {syncResult.gmail?.includes("Error") || syncResult.calendar?.includes("failed") ? (
                      <AlertCircle className="w-5 h-5 text-red-400" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                    )}
                    <span className="text-sm text-slate-300">
                      {syncResult.gmail || syncResult.calendar}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Error display */}
            {status.last_error && (
              <div className="px-6 pb-6">
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-400">Last Sync Error</p>
                      <p className="text-sm text-red-300/70 mt-1">{status.last_error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Not connected state */
          <div className="p-8 text-center">
            <div className="w-20 h-20 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-6">
              <GoogleIcon className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Connect Google</h3>
            <p className="text-slate-400 mb-6 max-w-md mx-auto">
              Sync your Gmail and Calendar to automatically populate your CRM with contacts,
              emails, and meetings.
            </p>

            <button
              onClick={handleConnect}
              className="inline-flex items-center gap-3 px-6 py-3 rounded-xl bg-white text-slate-900 font-medium hover:bg-slate-100 transition-all shadow-lg"
            >
              <GoogleIcon className="w-5 h-5" />
              Connect with Google
            </button>

            <div className="mt-8 text-left max-w-md mx-auto">
              <p className="text-sm text-slate-400 flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4" />
                Your data is secure
              </p>
              <ul className="space-y-2 text-xs text-slate-500">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3 text-green-400" />
                  We only read email metadata and signatures
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3 text-green-400" />
                  Your data stays in your workspace
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3 text-green-400" />
                  You can disconnect anytime
                </li>
              </ul>
            </div>
          </div>
        )}
      </motion.div>

      {/* Quick Links */}
      {status?.is_connected && (
        <div className="grid sm:grid-cols-3 gap-4">
          <button
            onClick={() => router.push("/crm/inbox")}
            className="flex items-center gap-4 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl hover:border-slate-600 transition-colors text-left"
          >
            <div className="p-3 rounded-lg bg-blue-500/10 text-blue-400">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-medium text-white">View Inbox</h3>
              <p className="text-sm text-slate-400">Browse synced emails</p>
            </div>
          </button>
          <button
            onClick={() => router.push("/crm/person")}
            className="flex items-center gap-4 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl hover:border-slate-600 transition-colors text-left"
          >
            <div className="p-3 rounded-lg bg-purple-500/10 text-purple-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-medium text-white">View People</h3>
              <p className="text-sm text-slate-400">See auto-created contacts</p>
            </div>
          </button>
          <button
            onClick={() => router.push("/crm/deal")}
            className="flex items-center gap-4 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl hover:border-slate-600 transition-colors text-left"
          >
            <div className="p-3 rounded-lg bg-amber-500/10 text-amber-400">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-medium text-white">View Deals</h3>
              <p className="text-sm text-slate-400">See auto-created deals</p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

type SettingsSection = "objects" | "integrations";

export default function CRMSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, logout } = useAuth();
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

  const [selectedSection, setSelectedSection] = useState<SettingsSection>("objects");
  const [selectedObject, setSelectedObject] = useState<CRMObject | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("configuration");

  // Check URL for section parameter
  useEffect(() => {
    const section = searchParams.get("section");
    if (section === "integrations") {
      setSelectedSection("integrations");
    }
  }, [searchParams]);

  // Auto-select first object when switching to objects section
  useEffect(() => {
    if (selectedSection === "objects" && !selectedObject && objects.length > 0 && !isLoading) {
      setSelectedObject(objects[0]);
    }
  }, [selectedSection, selectedObject, objects, isLoading]);

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
      <div className="min-h-screen bg-slate-950">
        <AppHeader user={user} logout={logout} />
        <div className="flex">
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
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <AppHeader user={user} logout={logout} />
      <div className="flex">
        {/* Sidebar */}
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

        {/* Section Navigation */}
        <div className="p-2 border-b border-slate-700">
          <button
            onClick={() => setSelectedSection("objects")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
              selectedSection === "objects"
                ? "bg-purple-500/20 text-white"
                : "text-slate-300 hover:bg-slate-700/50"
            }`}
          >
            <Database className="h-5 w-5 text-purple-400" />
            <div className="flex-1">
              <div className="font-medium">Objects</div>
              <div className="text-xs text-slate-500">Configure CRM objects</div>
            </div>
          </button>
          <button
            onClick={() => setSelectedSection("integrations")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors mt-1 ${
              selectedSection === "integrations"
                ? "bg-purple-500/20 text-white"
                : "text-slate-300 hover:bg-slate-700/50"
            }`}
          >
            <Link2 className="h-5 w-5 text-blue-400" />
            <div className="flex-1">
              <div className="font-medium">Integrations</div>
              <div className="text-xs text-slate-500">Google, Slack, etc.</div>
            </div>
          </button>
        </div>

        {/* Object list (only when objects section is selected) */}
        {selectedSection === "objects" && (
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
                      ? "bg-slate-700/50 text-white"
                      : "text-slate-300 hover:bg-slate-700/30"
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
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedSection === "integrations" ? (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-white">Integrations</h2>
              <p className="text-slate-400 mt-1">Connect external services to enhance your CRM</p>
            </div>
            {workspaceId && <IntegrationsTab workspaceId={workspaceId} />}
          </div>
        ) : selectedObject ? (
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
    </div>
  );
}
