"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Plus,
  Zap,
  Play,
  Pause,
  Trash2,
  MoreHorizontal,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Search,
  Filter,
  GitBranch,
  Webhook,
  Edit2,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { useCRMObjects, useCRMAutomations, useCRMSequences, useCRMWebhooks } from "@/hooks/useCRM";
import {
  CRMAutomation,
  CRMSequence,
  CRMWebhook,
  CRMAutomationTriggerType,
  CRMAutomationActionType,
} from "@/lib/api";

const triggerTypeLabels: Record<CRMAutomationTriggerType, string> = {
  record_created: "When record is created",
  record_updated: "When record is updated",
  record_deleted: "When record is deleted",
  field_changed: "When field changes",
  stage_changed: "When stage changes",
  note_added: "When note is added",
  task_completed: "When task is completed",
  email_replied: "When email is replied",
  scheduled: "On schedule",
  manual: "Manual trigger",
};

const actionTypeLabels: Record<CRMAutomationActionType, string> = {
  update_record: "Update record",
  create_record: "Create record",
  delete_record: "Delete record",
  add_to_list: "Add to list",
  remove_from_list: "Remove from list",
  send_email: "Send email",
  send_slack: "Send Slack message",
  webhook_call: "Call webhook",
  assign_owner: "Assign owner",
  create_task: "Create task",
  enroll_in_sequence: "Enroll in sequence",
  wait: "Wait",
};

function AutomationCard({
  automation,
  objectName,
  onToggle,
  onDelete,
  onEdit,
}: {
  automation: CRMAutomation;
  objectName?: string;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      onClick={onEdit}
      className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 hover:border-blue-500/50 transition-colors cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${automation.is_active ? "bg-green-500/20 text-green-400" : "bg-slate-700 text-slate-400"}`}>
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-white font-medium group-hover:text-blue-400 transition-colors">{automation.name}</h3>
            <p className="text-sm text-slate-400">{objectName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onEdit}
            className="p-2 rounded-lg bg-slate-700 text-slate-400 hover:bg-blue-500/20 hover:text-blue-400 transition-colors"
            title="Edit in visual builder"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={onToggle}
            className={`p-2 rounded-lg transition-colors ${
              automation.is_active
                ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                : "bg-slate-700 text-slate-400 hover:bg-slate-600"
            }`}
            title={automation.is_active ? "Pause automation" : "Activate automation"}
          >
            {automation.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded-lg bg-slate-700 text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Trigger:</span>
          <span className="text-slate-300">{triggerTypeLabels[automation.trigger_type] || automation.trigger_type}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Actions:</span>
          <span className="text-slate-300">
            {automation.actions.map((a) => actionTypeLabels[a.type] || a.type).join(", ")}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Play className="h-3 w-3" />
          {automation.run_count} runs
        </span>
        {automation.last_run_at && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Last run: {new Date(automation.last_run_at).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}

function SequenceCard({
  sequence,
  objectName,
  onToggle,
  onDelete,
}: {
  sequence: CRMSequence;
  objectName?: string;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${sequence.is_active ? "bg-purple-500/20 text-purple-400" : "bg-slate-700 text-slate-400"}`}>
            <GitBranch className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-white font-medium">{sequence.name}</h3>
            <p className="text-sm text-slate-400">{objectName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggle}
            className={`p-2 rounded-lg transition-colors ${
              sequence.is_active
                ? "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
                : "bg-slate-700 text-slate-400 hover:bg-slate-600"
            }`}
          >
            {sequence.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded-lg bg-slate-700 text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {sequence.description && <p className="text-sm text-slate-400 mb-3">{sequence.description}</p>}

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span>{sequence.steps?.length || 0} steps</span>
        <span>{sequence.enrollment_count} enrolled</span>
      </div>
    </div>
  );
}

function WebhookCard({
  webhook,
  objectName,
  onToggle,
  onDelete,
  onTest,
}: {
  webhook: CRMWebhook;
  objectName?: string;
  onToggle: () => void;
  onDelete: () => void;
  onTest: () => void;
}) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${webhook.is_active ? "bg-blue-500/20 text-blue-400" : "bg-slate-700 text-slate-400"}`}>
            <Webhook className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-white font-medium">{webhook.name}</h3>
            <p className="text-sm text-slate-400 truncate max-w-xs">{webhook.url}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onTest}
            className="p-2 rounded-lg bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white transition-colors"
            title="Send test webhook"
          >
            <Play className="h-4 w-4" />
          </button>
          <button
            onClick={onToggle}
            className={`p-2 rounded-lg transition-colors ${
              webhook.is_active
                ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                : "bg-slate-700 text-slate-400 hover:bg-slate-600"
            }`}
          >
            {webhook.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded-lg bg-slate-700 text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {webhook.events.map((event) => (
          <span key={event} className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-300">
            {event}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <CheckCircle className="h-3 w-3 text-green-400" />
          {webhook.success_count} success
        </span>
        <span className="flex items-center gap-1">
          <XCircle className="h-3 w-3 text-red-400" />
          {webhook.failure_count} failed
        </span>
      </div>
    </div>
  );
}

type TabType = "automations" | "sequences" | "webhooks";

export default function AutomationsPage() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const { user, logout } = useAuth();
  const workspaceId = currentWorkspace?.id || null;

  const { objects } = useCRMObjects(workspaceId);
  const {
    automations,
    isLoading: isLoadingAutomations,
    toggleAutomation,
    deleteAutomation,
  } = useCRMAutomations(workspaceId);
  const {
    sequences,
    isLoading: isLoadingSequences,
    toggleSequence,
    deleteSequence,
  } = useCRMSequences(workspaceId);
  const {
    webhooks,
    isLoading: isLoadingWebhooks,
    toggleWebhook,
    deleteWebhook,
    testWebhook,
  } = useCRMWebhooks(workspaceId);

  const [activeTab, setActiveTab] = useState<TabType>("automations");
  const [searchQuery, setSearchQuery] = useState("");

  const getObjectName = (objectId: string) => objects.find((o) => o.id === objectId)?.name;

  const filteredAutomations = automations.filter((a) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredSequences = sequences.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredWebhooks = webhooks.filter((w) =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDeleteAutomation = async (id: string) => {
    if (confirm("Delete this automation?")) {
      await deleteAutomation(id);
    }
  };

  const handleDeleteSequence = async (id: string) => {
    if (confirm("Delete this sequence?")) {
      await deleteSequence(id);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (confirm("Delete this webhook?")) {
      await deleteWebhook(id);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
<div className="p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push("/crm")}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">Automations</h1>
            <p className="text-sm text-slate-400">Automate your CRM workflows</p>
          </div>
          <button
            onClick={() => router.push("/crm/automations/new")}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
          >
            <Plus className="h-4 w-4" />
            Create Automation
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-800/50 border border-slate-700 rounded-xl mb-6 w-fit">
          <button
            onClick={() => setActiveTab("automations")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "automations" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <Zap className="h-4 w-4" />
            Automations ({automations.length})
          </button>
          <button
            onClick={() => setActiveTab("sequences")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "sequences" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <GitBranch className="h-4 w-4" />
            Sequences ({sequences.length})
          </button>
          <button
            onClick={() => setActiveTab("webhooks")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "webhooks" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <Webhook className="h-4 w-4" />
            Webhooks ({webhooks.length})
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeTab}...`}
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {/* Content */}
        {activeTab === "automations" && (
          <div>
            {isLoadingAutomations ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-40 bg-slate-800/50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : filteredAutomations.length === 0 ? (
              <div className="text-center py-16">
                <Zap className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">No automations yet</h3>
                <p className="text-slate-400 mb-4">Create your first automation to streamline your workflows</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredAutomations.map((automation) => (
                  <AutomationCard
                    key={automation.id}
                    automation={automation}
                    objectName={getObjectName(automation.object_id)}
                    onToggle={() => toggleAutomation(automation.id)}
                    onDelete={() => handleDeleteAutomation(automation.id)}
                    onEdit={() => router.push(`/crm/automations/${automation.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "sequences" && (
          <div>
            {isLoadingSequences ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-40 bg-slate-800/50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : filteredSequences.length === 0 ? (
              <div className="text-center py-16">
                <GitBranch className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">No sequences yet</h3>
                <p className="text-slate-400 mb-4">Create sequences to automate multi-step workflows</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredSequences.map((sequence) => (
                  <SequenceCard
                    key={sequence.id}
                    sequence={sequence}
                    objectName={getObjectName(sequence.object_id)}
                    onToggle={() => toggleSequence(sequence.id)}
                    onDelete={() => handleDeleteSequence(sequence.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "webhooks" && (
          <div>
            {isLoadingWebhooks ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-40 bg-slate-800/50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : filteredWebhooks.length === 0 ? (
              <div className="text-center py-16">
                <Webhook className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">No webhooks yet</h3>
                <p className="text-slate-400 mb-4">Create webhooks to integrate with external services</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredWebhooks.map((webhook) => (
                  <WebhookCard
                    key={webhook.id}
                    webhook={webhook}
                    objectName={webhook.object_id ? getObjectName(webhook.object_id) : "All objects"}
                    onToggle={() => toggleWebhook(webhook.id)}
                    onDelete={() => handleDeleteWebhook(webhook.id)}
                    onTest={() => testWebhook(webhook.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
