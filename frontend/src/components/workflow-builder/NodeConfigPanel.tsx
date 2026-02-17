"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Node } from "@xyflow/react";
import { X, Trash2, ChevronDown, Plus, Database, Copy, Check, ExternalLink, Code } from "lucide-react";
import { FieldPicker, InlineFieldPicker } from "./FieldPicker";
import { api } from "@/lib/api";

interface FieldSchema {
  path: string;
  name: string;
  type: string;
  description?: string;
  config?: {
    options?: Array<{ value: string; label: string; color?: string }>;
    statuses?: Array<{ value: string; label: string; color?: string }>;
    [key: string]: unknown;
  };
  required?: boolean;
}

interface SchemaCategory {
  label: string;
  fields: FieldSchema[];
}

interface NodeConfigPanelProps {
  node: Node;
  workspaceId: string;
  automationId: string;
  module: string;
  onUpdate: (data: Record<string, unknown>) => void;
  onDelete: () => void;
  onClose: () => void;
}

const conditionOperators = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
  { value: "gt", label: "greater than" },
  { value: "gte", label: "greater than or equal" },
  { value: "lt", label: "less than" },
  { value: "lte", label: "less than or equal" },
];

export function NodeConfigPanel({
  node,
  workspaceId,
  automationId,
  module = "crm",
  onUpdate,
  onDelete,
  onClose,
}: NodeConfigPanelProps) {
  const [label, setLabel] = useState((node.data.label as string) || "");
  const emailBodyRef = useRef<HTMLTextAreaElement>(null);
  const messageTemplateRef = useRef<HTMLTextAreaElement>(null);
  const webhookBodyRef = useRef<HTMLTextAreaElement>(null);

  // Sync label state when node changes (e.g., selecting a different trigger)
  useEffect(() => {
    setLabel((node.data.label as string) || "");
  }, [node.id, node.data.label]);

  // Webhook trigger state
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSamplePayload, setShowSamplePayload] = useState(false);

  // Field schema for condition value dropdowns
  const [fieldSchema, setFieldSchema] = useState<Record<string, SchemaCategory>>({});

  // Module objects for trigger object selector (module-aware)
  const [moduleObjects, setModuleObjects] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [objectsLoading, setObjectsLoading] = useState(false);

  // Projects for task creation
  const [projects, setProjects] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  const triggerType = node.data.trigger_type as string;
  const actionType = node.data.action_type as string;

  // Fetch projects when action is create_task
  useEffect(() => {
    async function fetchProjects() {
      if (!workspaceId || actionType !== "create_task") return;

      setProjectsLoading(true);
      try {
        const response = await api.get(`/workspaces/${workspaceId}/projects`);
        setProjects(response.data?.projects || response.data || []);
      } catch (error) {
        console.error("Failed to fetch projects:", error);
      } finally {
        setProjectsLoading(false);
      }
    }

    fetchProjects();
  }, [workspaceId, actionType]);

  // Fetch objects based on module - module-aware object loading
  useEffect(() => {
    async function fetchModuleObjects() {
      if (!workspaceId) return;

      setObjectsLoading(true);
      try {
        switch (module) {
          case "crm":
            // Fetch CRM objects from API
            const crmResponse = await api.get(`/workspaces/${workspaceId}/crm/objects`);
            setModuleObjects(crmResponse.data || []);
            break;
          case "tickets":
            // Hardcoded for MVP - will be API endpoint later
            setModuleObjects([
              { id: "ticket", name: "Ticket", slug: "ticket" },
            ]);
            break;
          case "hiring":
            // Hardcoded for MVP
            setModuleObjects([
              { id: "candidate", name: "Candidate", slug: "candidate" },
              { id: "job", name: "Job", slug: "job" },
              { id: "requirement", name: "Requirement", slug: "requirement" },
            ]);
            break;
          case "email_marketing":
            // Hardcoded for MVP
            setModuleObjects([
              { id: "campaign", name: "Campaign", slug: "campaign" },
              { id: "list", name: "List", slug: "list" },
              { id: "template", name: "Template", slug: "template" },
            ]);
            break;
          case "uptime":
            // Hardcoded for MVP
            setModuleObjects([
              { id: "monitor", name: "Monitor", slug: "monitor" },
              { id: "incident", name: "Incident", slug: "incident" },
            ]);
            break;
          case "sprints":
            // Hardcoded for MVP
            setModuleObjects([
              { id: "task", name: "Task", slug: "task" },
              { id: "sprint", name: "Sprint", slug: "sprint" },
              { id: "epic", name: "Epic", slug: "epic" },
            ]);
            break;
          case "forms":
            // Hardcoded for MVP
            setModuleObjects([
              { id: "form", name: "Form", slug: "form" },
            ]);
            break;
          case "booking":
            // Hardcoded for MVP
            setModuleObjects([
              { id: "event_type", name: "Event Type", slug: "event_type" },
              { id: "booking", name: "Booking", slug: "booking" },
            ]);
            break;
          default:
            // Unknown module - return empty
            setModuleObjects([]);
        }
      } catch (error) {
        console.error(`Failed to fetch objects for module ${module}:`, error);
        setModuleObjects([]);
      } finally {
        setObjectsLoading(false);
      }
    }

    fetchModuleObjects();
  }, [workspaceId, module]);

  // Fetch field schema for condition dropdowns
  // Re-fetch when object_id changes to get the correct fields
  const selectedObjectId = node.data.object_id as string | undefined;

  useEffect(() => {
    async function fetchFieldSchema() {
      if (!workspaceId) return;

      // For existing automations, fetch from API
      if (automationId && automationId !== "new") {
        try {
          const response = await api.get(
            `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow/field-schema`
          );
          setFieldSchema(response.data);
        } catch (error) {
          console.error("Failed to fetch field schema:", error);
        }
      }
      // For new automations with selected object, fetch object schema directly
      else if (selectedObjectId) {
        try {
          const response = await api.get(
            `/workspaces/${workspaceId}/crm/objects/${selectedObjectId}`
          );
          const obj = response.data;
          if (obj && obj.attributes) {
            setFieldSchema({
              record: {
                label: "Record Fields",
                fields: [
                  { path: "record.id", name: "Record ID", type: "text" },
                  ...obj.attributes.map((attr: { slug: string; name: string; attribute_type: string; config: Record<string, unknown>; is_required: boolean }) => ({
                    path: `record.values.${attr.slug}`,
                    name: attr.name,
                    type: attr.attribute_type,
                    config: attr.config,
                    required: attr.is_required,
                  })),
                ],
              },
            });
          }
        } catch (error) {
          console.error("Failed to fetch object schema:", error);
        }
      }
    }

    fetchFieldSchema();
  }, [workspaceId, automationId, selectedObjectId]);

  // Helper to get field info by path
  const getFieldByPath = useMemo(() => {
    return (fieldPath: string): FieldSchema | null => {
      // Handle paths like "record.values.status" or "record.status"
      for (const category of Object.values(fieldSchema)) {
        const field = category.fields.find((f) => {
          // Direct match
          if (f.path === fieldPath) return true;
          // Match without record prefix
          if (f.path === `record.${fieldPath}`) return true;
          if (f.path === `record.values.${fieldPath}`) return true;
          // Match field name in path
          const pathParts = fieldPath.split(".");
          const lastPart = pathParts[pathParts.length - 1];
          return f.path.endsWith(`.${lastPart}`);
        });
        if (field) return field;
      }
      return null;
    };
  }, [fieldSchema]);

  // Fetch webhook URL for webhook triggers
  useEffect(() => {
    // Skip API call for new automations (automationId is "new" before creation)
    if (node.type === "trigger" && triggerType === "webhook_received" && workspaceId && automationId && automationId !== "new") {
      setWebhookLoading(true);
      api
        .get(`/workspaces/${workspaceId}/crm/automations/${automationId}/workflow/webhook-url`)
        .then((res) => {
          setWebhookUrl(res.data.webhook_url);
        })
        .catch(() => {
          setWebhookUrl(null);
        })
        .finally(() => {
          setWebhookLoading(false);
        });
    }
  }, [node.type, triggerType, workspaceId, automationId]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Insert field at cursor position in a textarea
  const insertAtCursor = (
    ref: React.RefObject<HTMLTextAreaElement | null>,
    value: string,
    fieldName: string
  ) => {
    const textarea = ref.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentValue = (node.data[fieldName] as string) || "";
      const newValue = currentValue.slice(0, start) + value + currentValue.slice(end);
      onUpdate({ [fieldName]: newValue });
      // Restore cursor position after React re-render
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + value.length, start + value.length);
      }, 0);
    } else {
      // No ref, just append
      const currentValue = (node.data[fieldName] as string) || "";
      onUpdate({ [fieldName]: currentValue + value });
    }
  };

  const handleLabelChange = (newLabel: string) => {
    setLabel(newLabel);
    onUpdate({ label: newLabel });
  };

  const renderConfigFields = () => {
    switch (node.type) {
      case "trigger":
        return renderTriggerConfig();
      case "action":
        return renderActionConfig();
      case "condition":
        return renderConditionConfig();
      case "wait":
        return renderWaitConfig();
      case "agent":
        return renderAgentConfig();
      case "branch":
        return renderBranchConfig();
      case "join":
        return renderJoinConfig();
      default:
        return null;
    }
  };

  const renderTriggerConfig = () => {
    const samplePayload = JSON.stringify(
      {
        record_id: "optional-crm-record-id",
        data: {
          field1: "value1",
          field2: "value2",
        },
      },
      null,
      2
    );

    // Record-based triggers need an object selector
    // Check if trigger is record-based (needs object selector)
    // This includes CRM record triggers, ticket triggers, candidate triggers, etc.
    const isRecordTrigger =
      // CRM record triggers
      ["record_created", "record_updated", "record_deleted", "field_changed", "status_changed"].includes(triggerType) ||
      triggerType?.startsWith("record.") ||
      // Ticket triggers
      triggerType?.startsWith("ticket.") ||
      // Hiring triggers
      triggerType?.startsWith("candidate.") ||
      // Sprint triggers
      triggerType?.startsWith("task.") ||
      // Booking triggers
      triggerType?.startsWith("booking.") ||
      // Form triggers
      triggerType === "form.submitted" || triggerType === "form_submitted";

    return (
      <div className="space-y-4">
        {/* Object Type Selector - for record-based triggers */}
        {isRecordTrigger && (
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Object Type</label>
            {objectsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                <div className="animate-spin h-4 w-4 border-2 border-muted-foreground border-t-transparent rounded-full" />
                Loading objects...
              </div>
            ) : (
              <select
                value={(node.data.object_id as string) || ""}
                onChange={(e) => onUpdate({ object_id: e.target.value })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                <option value="">Select object type...</option>
                {moduleObjects.map((obj) => (
                  <option key={obj.id} value={obj.id}>
                    {obj.name}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Select the object type this automation applies to
            </p>
          </div>
        )}

        {triggerType === "field_changed" && (
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Field to Watch</label>
            {selectedObjectId ? (
              <select
                value={(node.data.field_slug as string) || ""}
                onChange={(e) => onUpdate({ field_slug: e.target.value })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                <option value="">Select field...</option>
                {fieldSchema.record?.fields
                  ?.filter((f) => f.path.startsWith("record.values."))
                  .map((field) => (
                    <option key={field.path} value={field.path.replace("record.values.", "")}>
                      {field.name}
                    </option>
                  ))}
              </select>
            ) : (
              <input
                type="text"
                value={(node.data.field_slug as string) || ""}
                onChange={(e) => onUpdate({ field_slug: e.target.value })}
                placeholder="e.g., status (select object type first)"
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            )}
          </div>
        )}

        {triggerType === "scheduled" && (
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Schedule (Cron)</label>
            <input
              type="text"
              value={(node.data.schedule as string) || ""}
              onChange={(e) => onUpdate({ schedule: e.target.value })}
              placeholder="0 9 * * *"
              className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Example: 0 9 * * * (daily at 9am)
            </p>
          </div>
        )}

        {triggerType === "webhook_received" && (
          <div className="space-y-4">
            {/* Webhook URL */}
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Webhook URL</label>
              {webhookLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                  <div className="animate-spin h-4 w-4 border-2 border-muted-foreground border-t-transparent rounded-full" />
                  Loading...
                </div>
              ) : webhookUrl ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={webhookUrl}
                      readOnly
                      className="flex-1 bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-xs font-mono cursor-text"
                    />
                    <button
                      onClick={() => copyToClipboard(webhookUrl)}
                      className={`p-2 rounded-lg transition-colors ${
                        copied
                          ? "bg-green-500/20 text-green-400"
                          : "bg-accent text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                      title={copied ? "Copied!" : "Copy URL"}
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded font-medium">POST</span>
                    <span>Send a POST request to trigger this workflow</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Save and publish your workflow to get a webhook URL
                </p>
              )}
            </div>

            {/* Sample Payload */}
            <div>
              <button
                onClick={() => setShowSamplePayload(!showSamplePayload)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Code className="h-4 w-4" />
                <span>{showSamplePayload ? "Hide" : "Show"} sample payload</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${showSamplePayload ? "rotate-180" : ""}`}
                />
              </button>
              {showSamplePayload && (
                <div className="mt-2 relative">
                  <pre className="bg-background border border-border rounded-lg p-3 text-xs text-foreground font-mono overflow-x-auto">
                    {samplePayload}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(samplePayload)}
                    className="absolute top-2 right-2 p-1.5 bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy payload"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Info box */}
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
              <p className="font-medium text-muted-foreground mb-1">How it works</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Send a POST request with JSON payload</li>
                <li>Include <code className="text-blue-400">record_id</code> to link to a CRM record</li>
                <li>Access payload data via <code className="text-blue-400">{"{{trigger.payload}}"}</code></li>
              </ul>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderActionConfig = () => {
    const actionType = node.data.action_type as string;

    return (
      <div className="space-y-4">
        {(actionType === "send_email") && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">
                To (Recipient)
                <span className="text-red-400 ml-1">*</span>
              </label>
              <input
                type="text"
                value={(node.data.to as string) || ""}
                onChange={(e) => onUpdate({ to: e.target.value })}
                placeholder="recipient@example.com or {{record.values.email}}"
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter an email address or use a field variable like {"{{record.values.email}}"}
              </p>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">
                Subject
                <span className="text-red-400 ml-1">*</span>
              </label>
              <input
                type="text"
                value={(node.data.email_subject as string) || ""}
                onChange={(e) => onUpdate({ email_subject: e.target.value })}
                placeholder="Email subject..."
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-muted-foreground">Body</label>
                <InlineFieldPicker
                  workspaceId={workspaceId}
                  automationId={automationId}
                  nodeId={node.id}
                  onInsert={(value) => insertAtCursor(emailBodyRef, value, "email_body")}
                />
              </div>
              <textarea
                ref={emailBodyRef}
                value={(node.data.email_body as string) || ""}
                onChange={(e) => onUpdate({ email_body: e.target.value })}
                placeholder="Email body... Click 'Insert field' to add variables"
                rows={4}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="ai-personalize"
                checked={(node.data.use_ai_personalization as boolean) || false}
                onChange={(e) => onUpdate({ use_ai_personalization: e.target.checked })}
                className="rounded bg-accent border-border"
              />
              <label htmlFor="ai-personalize" className="text-sm text-foreground">
                Use AI to personalize
              </label>
            </div>
          </>
        )}

        {actionType === "send_sms" && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-muted-foreground">Message</label>
              <InlineFieldPicker
                workspaceId={workspaceId}
                automationId={automationId}
                nodeId={node.id}
                onInsert={(value) => insertAtCursor(messageTemplateRef, value, "message_template")}
              />
            </div>
            <textarea
              ref={messageTemplateRef}
              value={(node.data.message_template as string) || ""}
              onChange={(e) => onUpdate({ message_template: e.target.value })}
              placeholder="Message... Click 'Insert field' to add variables"
              rows={3}
              className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
            />
          </div>
        )}

        {actionType === "send_slack" && (
          <>
            {/* Target Type Selection */}
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Send to</label>
              <select
                value={(node.data.slack_target_type as string) || "channel"}
                onChange={(e) => onUpdate({
                  slack_target_type: e.target.value,
                  // Clear other fields when switching
                  channel: e.target.value === "channel" ? node.data.channel : "",
                  user_email: "",
                  user_email_field: "",
                })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                <option value="channel">Channel</option>
                <option value="dm">Direct Message (DM)</option>
              </select>
            </div>

            {/* Channel Config */}
            {((node.data.slack_target_type as string) || "channel") === "channel" && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Channel ID</label>
                <input
                  type="text"
                  value={(node.data.channel as string) || ""}
                  onChange={(e) => onUpdate({ channel: e.target.value })}
                  placeholder="C1234567890"
                  className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Find Channel ID in Slack: right-click channel → View channel details → scroll to bottom
                </p>
              </div>
            )}

            {/* DM Config */}
            {(node.data.slack_target_type as string) === "dm" && (
              <>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Recipient</label>
                  <select
                    value={(node.data.slack_dm_type as string) || "email_field"}
                    onChange={(e) => onUpdate({
                      slack_dm_type: e.target.value,
                      user_email: "",
                      user_email_field: "",
                    })}
                    className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                  >
                    <option value="email_field">From record field (dynamic)</option>
                    <option value="email">Specific email address</option>
                  </select>
                </div>

                {((node.data.slack_dm_type as string) || "email_field") === "email_field" && (
                  <div>
                    <label className="block text-sm text-muted-foreground mb-1">Email Field</label>
                    <FieldPicker
                      workspaceId={workspaceId}
                      automationId={automationId}
                      nodeId={node.id}
                      value={(node.data.user_email_field as string) || ""}
                      onChange={(value) => onUpdate({ user_email_field: value })}
                      placeholder="Select field containing email..."
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      e.g., owner_email, assigned_to_email
                    </p>
                  </div>
                )}

                {(node.data.slack_dm_type as string) === "email" && (
                  <div>
                    <label className="block text-sm text-muted-foreground mb-1">Email Address</label>
                    <input
                      type="email"
                      value={(node.data.user_email as string) || ""}
                      onChange={(e) => onUpdate({ user_email: e.target.value })}
                      placeholder="user@company.com"
                      className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      User must be mapped in Slack integration settings
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Message */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-muted-foreground">Message</label>
                <InlineFieldPicker
                  workspaceId={workspaceId}
                  automationId={automationId}
                  nodeId={node.id}
                  onInsert={(value) => insertAtCursor(messageTemplateRef, value, "message_template")}
                />
              </div>
              <textarea
                ref={messageTemplateRef}
                value={(node.data.message_template as string) || ""}
                onChange={(e) => onUpdate({ message_template: e.target.value })}
                placeholder="Message... Click 'Insert field' to add variables like {name}, {deal_value}"
                rows={4}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
          </>
        )}

        {actionType === "webhook_call" && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">URL</label>
              <input
                type="url"
                value={(node.data.webhook_url as string) || ""}
                onChange={(e) => onUpdate({ webhook_url: e.target.value })}
                placeholder="https://..."
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Method</label>
              <select
                value={(node.data.http_method as string) || "POST"}
                onChange={(e) => onUpdate({ http_method: e.target.value })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-muted-foreground">Body (JSON)</label>
                <InlineFieldPicker
                  workspaceId={workspaceId}
                  automationId={automationId}
                  nodeId={node.id}
                  onInsert={(value) => insertAtCursor(webhookBodyRef, value, "body_template")}
                />
              </div>
              <textarea
                ref={webhookBodyRef}
                value={(node.data.body_template as string) || ""}
                onChange={(e) => onUpdate({ body_template: e.target.value })}
                placeholder='{"key": "{{record.field}}"}'
                rows={3}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm font-mono"
              />
            </div>
          </>
        )}

        {actionType === "update_record" && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Field to Update</label>
              <FieldPicker
                workspaceId={workspaceId}
                automationId={automationId}
                nodeId={node.id}
                value={(node.data.update_field as string) || ""}
                onChange={(value) => {
                  const match = value.match(/\{\{(.+?)\}\}/);
                  onUpdate({ update_field: match ? match[1] : value });
                }}
                placeholder="Select field..."
                allowCustom={true}
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">New Value</label>
              <input
                type="text"
                value={(node.data.update_value as string) || ""}
                onChange={(e) => onUpdate({ update_value: e.target.value })}
                placeholder="Enter value or use {{field}} syntax"
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use {"{{record.field}}"} to reference other fields
              </p>
            </div>
          </>
        )}

        {actionType === "create_record" && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Object Type</label>
              {objectsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                  <div className="animate-spin h-4 w-4 border-2 border-muted-foreground border-t-transparent rounded-full" />
                  Loading...
                </div>
              ) : (
                <select
                  value={(node.data.target_object_id as string) || ""}
                  onChange={(e) => onUpdate({ target_object_id: e.target.value })}
                  className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                >
                  <option value="">Select object type...</option>
                  {moduleObjects.map((obj) => (
                    <option key={obj.id} value={obj.id}>
                      {obj.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Record Name</label>
              <input
                type="text"
                value={(node.data.record_name as string) || ""}
                onChange={(e) => onUpdate({ record_name: e.target.value })}
                placeholder="Name for the new record"
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="link-to-current"
                checked={(node.data.link_to_current as boolean) || false}
                onChange={(e) => onUpdate({ link_to_current: e.target.checked })}
                className="rounded bg-accent border-border"
              />
              <label htmlFor="link-to-current" className="text-sm text-foreground">
                Link to triggering record
              </label>
            </div>
          </>
        )}

        {actionType === "create_task" && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Project</label>
              <select
                value={(node.data.project_id as string) || ""}
                onChange={(e) => onUpdate({ project_id: e.target.value || null })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                disabled={projectsLoading}
              >
                <option value="">Workspace Backlog (No Project)</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                {projectsLoading ? "Loading projects..." : "Select a project for this task"}
              </p>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Task Title</label>
              <input
                type="text"
                value={(node.data.task_title as string) || ""}
                onChange={(e) => onUpdate({ task_title: e.target.value })}
                placeholder="Follow up with {{trigger.monitor_name}}"
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Description</label>
              <textarea
                value={(node.data.task_description as string) || ""}
                onChange={(e) => onUpdate({ task_description: e.target.value })}
                placeholder="Task details..."
                rows={3}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Due In</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  value={(node.data.due_in_value as number) || 1}
                  onChange={(e) => onUpdate({ due_in_value: parseInt(e.target.value) || 1 })}
                  className="flex-1 bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                />
                <select
                  value={(node.data.due_in_unit as string) || "days"}
                  onChange={(e) => onUpdate({ due_in_unit: e.target.value })}
                  className="flex-1 bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                >
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Priority</label>
              <select
                value={(node.data.task_priority as string) || "medium"}
                onChange={(e) => onUpdate({ task_priority: e.target.value })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Assign To</label>
              <input
                type="text"
                value={(node.data.assignee_email as string) || ""}
                onChange={(e) => onUpdate({ assignee_email: e.target.value })}
                placeholder="user@company.com or {{record.owner_email}}"
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
          </>
        )}

        {actionType === "notify_user" && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Notify</label>
              <select
                value={(node.data.notify_type as string) || "email"}
                onChange={(e) => onUpdate({ notify_type: e.target.value })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                <option value="email">Specific Email</option>
                <option value="field">From Record Field</option>
                <option value="owner">Record Owner</option>
              </select>
            </div>
            {(node.data.notify_type as string) === "email" && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Email Address</label>
                <input
                  type="email"
                  value={(node.data.notify_email as string) || ""}
                  onChange={(e) => onUpdate({ notify_email: e.target.value })}
                  placeholder="user@company.com"
                  className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                />
              </div>
            )}
            {(node.data.notify_type as string) === "field" && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Email Field</label>
                <FieldPicker
                  workspaceId={workspaceId}
                  automationId={automationId}
                  nodeId={node.id}
                  value={(node.data.notify_field as string) || ""}
                  onChange={(value) => onUpdate({ notify_field: value })}
                  placeholder="Select field..."
                />
              </div>
            )}
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Notification Title</label>
              <input
                type="text"
                value={(node.data.notify_title as string) || ""}
                onChange={(e) => onUpdate({ notify_title: e.target.value })}
                placeholder="New deal requires attention"
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Message</label>
              <textarea
                value={(node.data.notify_message as string) || ""}
                onChange={(e) => onUpdate({ notify_message: e.target.value })}
                placeholder="Notification message..."
                rows={3}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
          </>
        )}

        {actionType === "notify_team" && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Notification Channel</label>
              <select
                value={(node.data.notify_channel as string) || "slack"}
                onChange={(e) => onUpdate({ notify_channel: e.target.value })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                <option value="slack">Slack Channel</option>
                <option value="email">Email Group</option>
                <option value="in_app">In-App Notification</option>
              </select>
            </div>
            {(node.data.notify_channel as string) === "slack" && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Slack Channel ID</label>
                <input
                  type="text"
                  value={(node.data.team_channel_id as string) || ""}
                  onChange={(e) => onUpdate({ team_channel_id: e.target.value })}
                  placeholder="C1234567890"
                  className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                />
              </div>
            )}
            {(node.data.notify_channel as string) === "email" && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Email Addresses</label>
                <textarea
                  value={(node.data.team_emails as string) || ""}
                  onChange={(e) => onUpdate({ team_emails: e.target.value })}
                  placeholder="team@company.com&#10;sales@company.com"
                  rows={3}
                  className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                />
              </div>
            )}
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Notification Title</label>
              <input
                type="text"
                value={(node.data.team_notify_title as string) || ""}
                onChange={(e) => onUpdate({ team_notify_title: e.target.value })}
                placeholder="New high-value deal created"
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Message</label>
              <textarea
                value={(node.data.team_notify_message as string) || ""}
                onChange={(e) => onUpdate({ team_notify_message: e.target.value })}
                placeholder="A new deal worth {{record.value}} has been created..."
                rows={3}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
          </>
        )}

        {actionType === "assign_owner" && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Assignment Type</label>
              <select
                value={(node.data.assign_type as string) || "specific"}
                onChange={(e) => onUpdate({ assign_type: e.target.value })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                <option value="specific">Specific User</option>
                <option value="field">From Record Field</option>
                <option value="round_robin">Round Robin</option>
                <option value="least_busy">Least Busy</option>
              </select>
            </div>
            {(node.data.assign_type as string) === "specific" && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1">User Email</label>
                <input
                  type="email"
                  value={(node.data.owner_email as string) || ""}
                  onChange={(e) => onUpdate({ owner_email: e.target.value })}
                  placeholder="user@company.com"
                  className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                />
              </div>
            )}
            {(node.data.assign_type as string) === "field" && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Owner Field</label>
                <FieldPicker
                  workspaceId={workspaceId}
                  automationId={automationId}
                  nodeId={node.id}
                  value={(node.data.owner_field as string) || ""}
                  onChange={(value) => onUpdate({ owner_field: value })}
                  placeholder="Select field containing owner..."
                />
              </div>
            )}
            {(node.data.assign_type as string) === "round_robin" && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Team Members</label>
                <textarea
                  value={(node.data.team_emails as string) || ""}
                  onChange={(e) => onUpdate({ team_emails: e.target.value })}
                  placeholder="user1@company.com&#10;user2@company.com&#10;user3@company.com"
                  rows={3}
                  className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  One email per line. Assignments rotate evenly.
                </p>
              </div>
            )}
            {(node.data.assign_type as string) === "least_busy" && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Team Members</label>
                <textarea
                  value={(node.data.team_emails as string) || ""}
                  onChange={(e) => onUpdate({ team_emails: e.target.value })}
                  placeholder="user1@company.com&#10;user2@company.com&#10;user3@company.com"
                  rows={3}
                  className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Assigns to the team member with fewest open records.
                </p>
              </div>
            )}
          </>
        )}

        {actionType === "add_to_list" && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">List</label>
              <input
                type="text"
                value={(node.data.list_id as string) || ""}
                onChange={(e) => onUpdate({ list_id: e.target.value })}
                placeholder="Enter list ID or name"
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                The record will be added to this CRM list
              </p>
            </div>
          </>
        )}

        {actionType === "remove_from_list" && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">List</label>
              <input
                type="text"
                value={(node.data.list_id as string) || ""}
                onChange={(e) => onUpdate({ list_id: e.target.value })}
                placeholder="Enter list ID or name"
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                The record will be removed from this CRM list
              </p>
            </div>
          </>
        )}

        {(actionType === "enroll_in_sequence" || actionType === "enroll_sequence") && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Sequence</label>
              <input
                type="text"
                value={(node.data.sequence_id as string) || ""}
                onChange={(e) => onUpdate({ sequence_id: e.target.value })}
                placeholder="Enter sequence ID"
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Start At Step</label>
              <input
                type="number"
                min="1"
                value={(node.data.start_step as number) || 1}
                onChange={(e) => onUpdate({ start_step: parseInt(e.target.value) || 1 })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="skip-if-enrolled"
                checked={(node.data.skip_if_enrolled as boolean) ?? true}
                onChange={(e) => onUpdate({ skip_if_enrolled: e.target.checked })}
                className="rounded bg-accent border-border"
              />
              <label htmlFor="skip-if-enrolled" className="text-sm text-foreground">
                Skip if already enrolled
              </label>
            </div>
          </>
        )}

        {(actionType === "remove_from_sequence" || actionType === "unenroll_sequence") && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Sequence</label>
              <input
                type="text"
                value={(node.data.sequence_id as string) || ""}
                onChange={(e) => onUpdate({ sequence_id: e.target.value })}
                placeholder="Enter sequence ID (leave empty for all)"
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave empty to remove from all active sequences
              </p>
            </div>
          </>
        )}

        {actionType === "enrich_record" && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Enrichment Source</label>
              <select
                value={(node.data.enrichment_source as string) || "clearbit"}
                onChange={(e) => onUpdate({ enrichment_source: e.target.value })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                <option value="clearbit">Clearbit</option>
                <option value="apollo">Apollo</option>
                <option value="zoominfo">ZoomInfo</option>
                <option value="linkedin">LinkedIn</option>
                <option value="ai">AI (Web Search)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Fields to Enrich</label>
              <div className="space-y-2">
                {["company", "title", "phone", "linkedin", "industry", "company_size"].map((field) => (
                  <label key={field} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={((node.data.enrich_fields as string[]) || []).includes(field)}
                      onChange={(e) => {
                        const current = (node.data.enrich_fields as string[]) || [];
                        const updated = e.target.checked
                          ? [...current, field]
                          : current.filter((f) => f !== field);
                        onUpdate({ enrich_fields: updated });
                      }}
                      className="rounded bg-accent border-border"
                    />
                    <span className="text-sm text-foreground capitalize">{field.replace("_", " ")}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="overwrite-existing"
                checked={(node.data.overwrite_existing as boolean) || false}
                onChange={(e) => onUpdate({ overwrite_existing: e.target.checked })}
                className="rounded bg-accent border-border"
              />
              <label htmlFor="overwrite-existing" className="text-sm text-foreground">
                Overwrite existing values
              </label>
            </div>
          </>
        )}

        {actionType === "classify_record" && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Classification Type</label>
              <select
                value={(node.data.classification_type as string) || "lead_score"}
                onChange={(e) => onUpdate({ classification_type: e.target.value })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                <option value="lead_score">Lead Score (0-100)</option>
                <option value="sentiment">Sentiment Analysis</option>
                <option value="intent">Intent Classification</option>
                <option value="category">Custom Category</option>
              </select>
            </div>
            {(node.data.classification_type as string) === "category" && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Categories</label>
                <input
                  type="text"
                  value={(node.data.categories as string) || ""}
                  onChange={(e) => onUpdate({ categories: e.target.value })}
                  placeholder="hot_lead, warm_lead, cold_lead"
                  className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Comma-separated list of categories
                </p>
              </div>
            )}
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Save Result To</label>
              <FieldPicker
                workspaceId={workspaceId}
                automationId={automationId}
                nodeId={node.id}
                value={(node.data.result_field as string) || ""}
                onChange={(value) => {
                  const match = value.match(/\{\{(.+?)\}\}/);
                  onUpdate({ result_field: match ? match[1] : value });
                }}
                placeholder="Select field to store result..."
                allowCustom={true}
              />
            </div>
          </>
        )}

        {actionType === "generate_summary" && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Summary Type</label>
              <select
                value={(node.data.summary_type as string) || "brief"}
                onChange={(e) => onUpdate({ summary_type: e.target.value })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                <option value="brief">Brief (1-2 sentences)</option>
                <option value="detailed">Detailed (paragraph)</option>
                <option value="bullet_points">Bullet Points</option>
                <option value="executive">Executive Summary</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Include</label>
              <div className="space-y-2">
                {["activities", "notes", "emails", "meetings", "deals"].map((item) => (
                  <label key={item} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={((node.data.summary_includes as string[]) || ["activities", "notes"]).includes(item)}
                      onChange={(e) => {
                        const current = (node.data.summary_includes as string[]) || ["activities", "notes"];
                        const updated = e.target.checked
                          ? [...current, item]
                          : current.filter((i) => i !== item);
                        onUpdate({ summary_includes: updated });
                      }}
                      className="rounded bg-accent border-border"
                    />
                    <span className="text-sm text-foreground capitalize">{item}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Save Summary To</label>
              <FieldPicker
                workspaceId={workspaceId}
                automationId={automationId}
                nodeId={node.id}
                value={(node.data.summary_field as string) || ""}
                onChange={(value) => {
                  const match = value.match(/\{\{(.+?)\}\}/);
                  onUpdate({ summary_field: match ? match[1] : value });
                }}
                placeholder="Select field..."
                allowCustom={true}
              />
            </div>
          </>
        )}

        {actionType === "delete_record" && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <p className="text-sm text-red-400 font-medium mb-1">Warning</p>
            <p className="text-xs text-muted-foreground">
              This action will permanently delete the record. This cannot be undone.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <input
                type="checkbox"
                id="confirm-delete"
                checked={(node.data.confirm_delete as boolean) || false}
                onChange={(e) => onUpdate({ confirm_delete: e.target.checked })}
                className="rounded bg-accent border-border"
              />
              <label htmlFor="confirm-delete" className="text-sm text-foreground">
                I understand this will delete records
              </label>
            </div>
          </div>
        )}

        {actionType === "link_records" && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Link To</label>
              <select
                value={(node.data.link_type as string) || "field"}
                onChange={(e) => onUpdate({ link_type: e.target.value })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                <option value="field">Record from Field Value</option>
                <option value="specific">Specific Record</option>
                <option value="created">Newly Created Record (from previous step)</option>
              </select>
            </div>
            {(node.data.link_type as string) === "field" && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Record ID Field</label>
                <FieldPicker
                  workspaceId={workspaceId}
                  automationId={automationId}
                  nodeId={node.id}
                  value={(node.data.link_field as string) || ""}
                  onChange={(value) => onUpdate({ link_field: value })}
                  placeholder="Select field containing record ID..."
                />
              </div>
            )}
            {(node.data.link_type as string) === "specific" && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Record ID</label>
                <input
                  type="text"
                  value={(node.data.link_record_id as string) || ""}
                  onChange={(e) => onUpdate({ link_record_id: e.target.value })}
                  placeholder="Enter record ID"
                  className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                />
              </div>
            )}
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Relationship Type</label>
              <input
                type="text"
                value={(node.data.relation_type as string) || ""}
                onChange={(e) => onUpdate({ relation_type: e.target.value })}
                placeholder="e.g., parent, related, associated"
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
          </>
        )}

        {actionType === "api_request" && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">URL</label>
              <input
                type="url"
                value={(node.data.api_url as string) || ""}
                onChange={(e) => onUpdate({ api_url: e.target.value })}
                placeholder="https://api.example.com/endpoint"
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Method</label>
              <select
                value={(node.data.api_method as string) || "POST"}
                onChange={(e) => onUpdate({ api_method: e.target.value })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Authentication</label>
              <select
                value={(node.data.auth_type as string) || "none"}
                onChange={(e) => onUpdate({ auth_type: e.target.value })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                <option value="none">None</option>
                <option value="bearer">Bearer Token</option>
                <option value="api_key">API Key</option>
                <option value="basic">Basic Auth</option>
              </select>
            </div>
            {(node.data.auth_type as string) === "bearer" && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Bearer Token</label>
                <input
                  type="password"
                  value={(node.data.bearer_token as string) || ""}
                  onChange={(e) => onUpdate({ bearer_token: e.target.value })}
                  placeholder="Enter token"
                  className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                />
              </div>
            )}
            {(node.data.auth_type as string) === "api_key" && (
              <>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Header Name</label>
                  <input
                    type="text"
                    value={(node.data.api_key_header as string) || "X-API-Key"}
                    onChange={(e) => onUpdate({ api_key_header: e.target.value })}
                    placeholder="X-API-Key"
                    className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">API Key</label>
                  <input
                    type="password"
                    value={(node.data.api_key as string) || ""}
                    onChange={(e) => onUpdate({ api_key: e.target.value })}
                    placeholder="Enter API key"
                    className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                  />
                </div>
              </>
            )}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-muted-foreground">Request Body (JSON)</label>
                <InlineFieldPicker
                  workspaceId={workspaceId}
                  automationId={automationId}
                  nodeId={node.id}
                  onInsert={(value) => insertAtCursor(webhookBodyRef, value, "api_body")}
                />
              </div>
              <textarea
                ref={webhookBodyRef}
                value={(node.data.api_body as string) || ""}
                onChange={(e) => onUpdate({ api_body: e.target.value })}
                placeholder='{"key": "{{record.field}}"}'
                rows={3}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm font-mono"
              />
            </div>
          </>
        )}

        {/* Fallback for unhandled action types */}
        {actionType && ![
          "send_email", "send_sms", "send_slack", "webhook_call",
          "update_record", "create_record", "create_task", "notify_user", "notify_team",
          "assign_owner", "add_to_list", "remove_from_list",
          "enroll_in_sequence", "enroll_sequence", "remove_from_sequence", "unenroll_sequence",
          "enrich_record", "classify_record", "generate_summary",
          "delete_record", "link_records", "api_request"
        ].includes(actionType) && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
            <p className="font-medium text-muted-foreground mb-1">Action: {actionType}</p>
            <p>Configuration for this action type will be applied when the workflow runs.</p>
          </div>
        )}
      </div>
    );
  };

  const renderConditionConfig = () => {
    const conditions = (node.data.conditions as Array<{ field: string; operator: string; value: string }>) || [];
    const conjunction = (node.data.conjunction as string) || "and";

    const addCondition = () => {
      onUpdate({
        conditions: [...conditions, { field: "", operator: "equals", value: "" }],
      });
    };

    const updateCondition = (index: number, updates: Partial<{ field: string; operator: string; value: string }>) => {
      const newConditions = [...conditions];
      newConditions[index] = { ...newConditions[index], ...updates };
      onUpdate({ conditions: newConditions });
    };

    const removeCondition = (index: number) => {
      onUpdate({
        conditions: conditions.filter((_, i) => i !== index),
      });
    };

    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-muted-foreground mb-1">Match</label>
          <select
            value={conjunction}
            onChange={(e) => onUpdate({ conjunction: e.target.value })}
            className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
          >
            <option value="and">All conditions (AND)</option>
            <option value="or">Any condition (OR)</option>
          </select>
        </div>

        <div className="space-y-3">
          <label className="block text-sm text-muted-foreground">Conditions</label>
          {conditions.map((condition, index) => (
            <div key={index} className="bg-accent/50 rounded-lg p-3 space-y-2">
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <FieldPicker
                    workspaceId={workspaceId}
                    automationId={automationId}
                    nodeId={node.id}
                    value={condition.field}
                    onChange={(value) => {
                      // Extract the path from {{path}} format
                      const match = value.match(/\{\{(.+?)\}\}/);
                      updateCondition(index, { field: match ? match[1] : value });
                    }}
                    placeholder="Select field..."
                    allowCustom={true}
                  />
                </div>
                <button
                  onClick={() => removeCondition(index)}
                  className="p-1.5 text-muted-foreground hover:text-red-400 mt-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <select
                value={condition.operator}
                onChange={(e) => updateCondition(index, { operator: e.target.value })}
                className="w-full bg-accent border border-border rounded px-2 py-1.5 text-foreground text-sm"
              >
                {conditionOperators.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
              {!["is_empty", "is_not_empty"].includes(condition.operator) && (
                (() => {
                  const fieldInfo = getFieldByPath(condition.field);
                  const isSelectField = fieldInfo?.type === "select" || fieldInfo?.type === "multi_select";
                  const isStatusField = fieldInfo?.type === "status";

                  // Get options from config - handle both 'options' and 'statuses' keys
                  const options = fieldInfo?.config?.options || fieldInfo?.config?.statuses || [];

                  if ((isSelectField || isStatusField) && options.length > 0) {
                    return (
                      <select
                        value={condition.value}
                        onChange={(e) => updateCondition(index, { value: e.target.value })}
                        className="w-full bg-accent border border-border rounded px-2 py-1.5 text-foreground text-sm"
                      >
                        <option value="">Select value...</option>
                        {options.map((opt: { value: string; label: string; color?: string }) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    );
                  }

                  // For boolean/checkbox fields
                  if (fieldInfo?.type === "checkbox") {
                    return (
                      <select
                        value={condition.value}
                        onChange={(e) => updateCondition(index, { value: e.target.value })}
                        className="w-full bg-accent border border-border rounded px-2 py-1.5 text-foreground text-sm"
                      >
                        <option value="">Select value...</option>
                        <option value="true">Yes / True</option>
                        <option value="false">No / False</option>
                      </select>
                    );
                  }

                  // For date fields
                  if (fieldInfo?.type === "date") {
                    return (
                      <input
                        type="date"
                        value={condition.value}
                        onChange={(e) => updateCondition(index, { value: e.target.value })}
                        className="w-full bg-accent border border-border rounded px-2 py-1.5 text-foreground text-sm"
                      />
                    );
                  }

                  // Default text input (with number type for numeric fields)
                  return (
                    <input
                      type={fieldInfo?.type === "number" || fieldInfo?.type === "currency" ? "number" : "text"}
                      value={condition.value}
                      onChange={(e) => updateCondition(index, { value: e.target.value })}
                      placeholder="Value"
                      className="w-full bg-accent border border-border rounded px-2 py-1.5 text-foreground text-sm"
                    />
                  );
                })()
              )}
            </div>
          ))}
          <button
            onClick={addCondition}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg text-muted-foreground hover:border-muted-foreground hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            Add Condition
          </button>
        </div>
      </div>
    );
  };

  const renderWaitConfig = () => {
    const waitType = (node.data.wait_type as string) || "duration";

    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-muted-foreground mb-1">Wait Type</label>
          <select
            value={waitType}
            onChange={(e) => onUpdate({ wait_type: e.target.value })}
            className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
          >
            <option value="duration">Duration</option>
            <option value="datetime">Until Date/Time</option>
            <option value="event">Until Event</option>
          </select>
        </div>

        {waitType === "duration" && (
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-sm text-muted-foreground mb-1">Duration</label>
              <input
                type="number"
                min="1"
                value={(node.data.duration_value as number) || 1}
                onChange={(e) => onUpdate({ duration_value: parseInt(e.target.value) || 1 })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-muted-foreground mb-1">Unit</label>
              <select
                value={(node.data.duration_unit as string) || "days"}
                onChange={(e) => onUpdate({ duration_unit: e.target.value })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
          </div>
        )}

        {waitType === "datetime" && (
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Wait Until</label>
            <input
              type="datetime-local"
              value={(node.data.wait_until as string) || ""}
              onChange={(e) => onUpdate({ wait_until: e.target.value })}
              className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
            />
          </div>
        )}

        {waitType === "event" && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Wait for Event</label>
              <select
                value={(node.data.wait_for_event as string) || ""}
                onChange={(e) => onUpdate({ wait_for_event: e.target.value })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                <option value="">Select event...</option>
                <optgroup label="Email Events">
                  <option value="email.opened">Email Opened</option>
                  <option value="email.clicked">Email Link Clicked</option>
                  <option value="email.replied">Email Replied</option>
                  <option value="email.bounced">Email Bounced</option>
                </optgroup>
                <optgroup label="Form Events">
                  <option value="form.submitted">Form Submitted</option>
                </optgroup>
                <optgroup label="Meeting Events">
                  <option value="meeting.scheduled">Meeting Scheduled</option>
                  <option value="meeting.completed">Meeting Completed</option>
                  <option value="meeting.cancelled">Meeting Cancelled</option>
                </optgroup>
                <optgroup label="Other Events">
                  <option value="webhook.received">Webhook Received</option>
                  <option value="record.updated">Record Updated</option>
                </optgroup>
              </select>
            </div>

            {/* Event-specific filter options */}
            {(node.data.wait_for_event as string)?.startsWith("email.") && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1">
                  Filter by Email ID (optional)
                </label>
                <input
                  type="text"
                  value={(node.data.event_filter as Record<string, string>)?.email_id || ""}
                  onChange={(e) => onUpdate({
                    event_filter: {
                      ...((node.data.event_filter as Record<string, string>) || {}),
                      email_id: e.target.value || undefined,
                    },
                  })}
                  placeholder="Leave empty to match any email"
                  className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                />
              </div>
            )}

            {(node.data.wait_for_event as string) === "form.submitted" && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1">
                  Filter by Form ID (optional)
                </label>
                <input
                  type="text"
                  value={(node.data.event_filter as Record<string, string>)?.form_id || ""}
                  onChange={(e) => onUpdate({
                    event_filter: {
                      ...((node.data.event_filter as Record<string, string>) || {}),
                      form_id: e.target.value || undefined,
                    },
                  })}
                  placeholder="Leave empty to match any form"
                  className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                />
              </div>
            )}

            {(node.data.wait_for_event as string)?.startsWith("meeting.") && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1">
                  Filter by Calendar/Meeting Type (optional)
                </label>
                <input
                  type="text"
                  value={(node.data.event_filter as Record<string, string>)?.calendar_id || ""}
                  onChange={(e) => onUpdate({
                    event_filter: {
                      ...((node.data.event_filter as Record<string, string>) || {}),
                      calendar_id: e.target.value || undefined,
                    },
                  })}
                  placeholder="Leave empty to match any meeting"
                  className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                />
              </div>
            )}

            {(node.data.wait_for_event as string) === "webhook.received" && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1">
                  Webhook ID
                </label>
                <input
                  type="text"
                  value={(node.data.event_filter as Record<string, string>)?.webhook_id || ""}
                  onChange={(e) => onUpdate({
                    event_filter: {
                      ...((node.data.event_filter as Record<string, string>) || {}),
                      webhook_id: e.target.value,
                    },
                  })}
                  placeholder="Your webhook identifier"
                  className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-sm text-muted-foreground mb-1">Timeout (hours)</label>
              <input
                type="number"
                min="1"
                value={(node.data.timeout_hours as number) || 24}
                onChange={(e) => onUpdate({ timeout_hours: parseInt(e.target.value) || 24 })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Workflow fails if event not received within timeout
              </p>
            </div>

            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
              <p className="font-medium text-muted-foreground mb-1">How it works</p>
              <p>
                The workflow will pause and wait until the selected event is received.
                Events are matched to the current record automatically.
              </p>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderAgentConfig = () => {
    const agentType = (node.data.agent_type as string) || "custom";

    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-muted-foreground mb-1">Agent Type</label>
          <select
            value={agentType}
            onChange={(e) => onUpdate({ agent_type: e.target.value })}
            className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
          >
            <option value="sales_outreach">Sales Outreach</option>
            <option value="lead_scoring">Lead Scoring</option>
            <option value="email_drafter">Email Drafter</option>
            <option value="data_enrichment">Data Enrichment</option>
            <option value="custom">Custom Agent</option>
          </select>
        </div>

        {/* Sales Outreach Configuration */}
        {agentType === "sales_outreach" && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Outreach Channel</label>
              <select
                value={(node.data.outreach_channel as string) || "email"}
                onChange={(e) => onUpdate({ outreach_channel: e.target.value })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                <option value="email">Email</option>
                <option value="linkedin">LinkedIn</option>
                <option value="phone">Phone Script</option>
                <option value="multi">Multi-channel Sequence</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Tone</label>
              <select
                value={(node.data.outreach_tone as string) || "professional"}
                onChange={(e) => onUpdate({ outreach_tone: e.target.value })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                <option value="professional">Professional</option>
                <option value="friendly">Friendly & Casual</option>
                <option value="formal">Formal</option>
                <option value="consultative">Consultative</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Target Persona</label>
              <input
                type="text"
                value={(node.data.target_persona as string) || ""}
                onChange={(e) => onUpdate({ target_persona: e.target.value })}
                placeholder="e.g., VP of Engineering, IT Decision Maker"
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Value Proposition</label>
              <textarea
                value={(node.data.value_proposition as string) || ""}
                onChange={(e) => onUpdate({ value_proposition: e.target.value })}
                placeholder="Key benefits to highlight..."
                rows={2}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="research-company"
                checked={(node.data.research_company as boolean) ?? true}
                onChange={(e) => onUpdate({ research_company: e.target.checked })}
                className="rounded bg-accent border-border"
              />
              <label htmlFor="research-company" className="text-sm text-foreground">
                Research company before outreach
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="personalize-pain-points"
                checked={(node.data.personalize_pain_points as boolean) ?? true}
                onChange={(e) => onUpdate({ personalize_pain_points: e.target.checked })}
                className="rounded bg-accent border-border"
              />
              <label htmlFor="personalize-pain-points" className="text-sm text-foreground">
                Identify and address pain points
              </label>
            </div>
          </>
        )}

        {/* Lead Scoring Configuration */}
        {agentType === "lead_scoring" && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Scoring Model</label>
              <select
                value={(node.data.scoring_model as string) || "balanced"}
                onChange={(e) => onUpdate({ scoring_model: e.target.value })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                <option value="balanced">Balanced (Fit + Engagement)</option>
                <option value="fit_focused">Fit-Focused (Demographics)</option>
                <option value="engagement_focused">Engagement-Focused (Behavior)</option>
                <option value="custom">Custom Criteria</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Ideal Customer Profile</label>
              <textarea
                value={(node.data.ideal_customer_profile as string) || ""}
                onChange={(e) => onUpdate({ ideal_customer_profile: e.target.value })}
                placeholder="Describe your ideal customer: company size, industry, tech stack..."
                rows={3}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Score Threshold for Hot Lead</label>
              <input
                type="number"
                min="0"
                max="100"
                value={(node.data.hot_lead_threshold as number) || 70}
                onChange={(e) => onUpdate({ hot_lead_threshold: parseInt(e.target.value) || 70 })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leads scoring above this will be marked as hot
              </p>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Save Score To</label>
              <FieldPicker
                workspaceId={workspaceId}
                automationId={automationId}
                nodeId={node.id}
                value={(node.data.score_field as string) || ""}
                onChange={(value) => {
                  const match = value.match(/\{\{(.+?)\}\}/);
                  onUpdate({ score_field: match ? match[1] : value });
                }}
                placeholder="Select field to store score..."
                allowCustom={true}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="include-reasoning"
                checked={(node.data.include_scoring_reasoning as boolean) ?? true}
                onChange={(e) => onUpdate({ include_scoring_reasoning: e.target.checked })}
                className="rounded bg-accent border-border"
              />
              <label htmlFor="include-reasoning" className="text-sm text-foreground">
                Include scoring reasoning in notes
              </label>
            </div>
          </>
        )}

        {/* Email Drafter Configuration */}
        {agentType === "email_drafter" && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Email Type</label>
              <select
                value={(node.data.email_type as string) || "outreach"}
                onChange={(e) => onUpdate({ email_type: e.target.value })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                <option value="outreach">Cold Outreach</option>
                <option value="follow_up">Follow-up</option>
                <option value="nurture">Nurture</option>
                <option value="proposal">Proposal</option>
                <option value="thank_you">Thank You</option>
                <option value="re_engagement">Re-engagement</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Tone</label>
              <select
                value={(node.data.email_tone as string) || "professional"}
                onChange={(e) => onUpdate({ email_tone: e.target.value })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="formal">Formal</option>
                <option value="urgent">Urgent</option>
                <option value="casual">Casual</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Length</label>
              <select
                value={(node.data.email_length as string) || "medium"}
                onChange={(e) => onUpdate({ email_length: e.target.value })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              >
                <option value="short">Short (2-3 sentences)</option>
                <option value="medium">Medium (1 paragraph)</option>
                <option value="long">Long (2-3 paragraphs)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Key Points to Include</label>
              <textarea
                value={(node.data.email_key_points as string) || ""}
                onChange={(e) => onUpdate({ email_key_points: e.target.value })}
                placeholder="Main points or call-to-action to include..."
                rows={2}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Writing Sample (Optional)</label>
              <textarea
                value={(node.data.writing_sample as string) || ""}
                onChange={(e) => onUpdate({ writing_sample: e.target.value })}
                placeholder="Paste an example email to match your style..."
                rows={3}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="include-signature"
                checked={(node.data.include_signature as boolean) ?? true}
                onChange={(e) => onUpdate({ include_signature: e.target.checked })}
                className="rounded bg-accent border-border"
              />
              <label htmlFor="include-signature" className="text-sm text-foreground">
                Include email signature
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="personalize-email"
                checked={(node.data.personalize_email as boolean) ?? true}
                onChange={(e) => onUpdate({ personalize_email: e.target.checked })}
                className="rounded bg-accent border-border"
              />
              <label htmlFor="personalize-email" className="text-sm text-foreground">
                Personalize based on record data
              </label>
            </div>
          </>
        )}

        {/* Data Enrichment Configuration */}
        {agentType === "data_enrichment" && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Enrichment Sources</label>
              <div className="space-y-2">
                {[
                  { value: "linkedin", label: "LinkedIn" },
                  { value: "company_website", label: "Company Website" },
                  { value: "news", label: "Recent News" },
                  { value: "social_media", label: "Social Media" },
                  // { value: "clearbit", label: "Clearbit" },
                  // { value: "apollo", label: "Apollo" },
                ].map((source) => (
                  <label key={source.value} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={((node.data.enrichment_sources as string[]) || ["linkedin", "company_website"]).includes(source.value)}
                      onChange={(e) => {
                        const current = (node.data.enrichment_sources as string[]) || ["linkedin", "company_website"];
                        const updated = e.target.checked
                          ? [...current, source.value]
                          : current.filter((s) => s !== source.value);
                        onUpdate({ enrichment_sources: updated });
                      }}
                      className="rounded bg-accent border-border"
                    />
                    <span className="text-sm text-foreground">{source.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Fields to Enrich</label>
              <div className="space-y-2">
                {[
                  { value: "company_info", label: "Company Info (size, industry, revenue)" },
                  { value: "contact_info", label: "Contact Info (title, phone, email)" },
                  { value: "social_profiles", label: "Social Profiles" },
                  { value: "tech_stack", label: "Technology Stack" },
                  { value: "funding", label: "Funding & Investors" },
                  { value: "recent_news", label: "Recent News & Events" },
                ].map((field) => (
                  <label key={field.value} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={((node.data.enrich_field_types as string[]) || ["company_info", "contact_info"]).includes(field.value)}
                      onChange={(e) => {
                        const current = (node.data.enrich_field_types as string[]) || ["company_info", "contact_info"];
                        const updated = e.target.checked
                          ? [...current, field.value]
                          : current.filter((f) => f !== field.value);
                        onUpdate({ enrich_field_types: updated });
                      }}
                      className="rounded bg-accent border-border"
                    />
                    <span className="text-sm text-foreground">{field.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="overwrite-enrichment"
                checked={(node.data.overwrite_enriched as boolean) || false}
                onChange={(e) => onUpdate({ overwrite_enriched: e.target.checked })}
                className="rounded bg-accent border-border"
              />
              <label htmlFor="overwrite-enrichment" className="text-sm text-foreground">
                Overwrite existing field values
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="add-enrichment-note"
                checked={(node.data.add_enrichment_note as boolean) ?? true}
                onChange={(e) => onUpdate({ add_enrichment_note: e.target.checked })}
                className="rounded bg-accent border-border"
              />
              <label htmlFor="add-enrichment-note" className="text-sm text-foreground">
                Add note with enrichment summary
              </label>
            </div>
          </>
        )}

        {/* Custom Agent Configuration */}
        {agentType === "custom" && (
          <>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Agent ID</label>
              <input
                type="text"
                value={(node.data.agent_id as string) || ""}
                onChange={(e) => onUpdate({ agent_id: e.target.value })}
                placeholder="Select or enter agent ID"
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Custom Goal</label>
              <textarea
                value={(node.data.custom_goal as string) || ""}
                onChange={(e) => onUpdate({ custom_goal: e.target.value })}
                placeholder="What should this agent accomplish?"
                rows={3}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Additional Context</label>
              <textarea
                value={(node.data.custom_context as string) || ""}
                onChange={(e) => onUpdate({ custom_context: e.target.value })}
                placeholder="Any additional instructions or context..."
                rows={2}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Max Iterations</label>
              <input
                type="number"
                min="1"
                max="50"
                value={(node.data.max_iterations as number) || 10}
                onChange={(e) => onUpdate({ max_iterations: parseInt(e.target.value) || 10 })}
                className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Maximum reasoning steps before stopping
              </p>
            </div>
          </>
        )}

        {/* Common Settings */}
        <div className="border-t border-border pt-4">
          <label className="block text-sm text-muted-foreground mb-2">Output Settings</label>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Save Output To</label>
            <FieldPicker
              workspaceId={workspaceId}
              automationId={automationId}
              nodeId={node.id}
              value={(node.data.output_field as string) || ""}
              onChange={(value) => {
                const match = value.match(/\{\{(.+?)\}\}/);
                onUpdate({ output_field: match ? match[1] : value });
              }}
              placeholder="Select field to store agent output..."
              allowCustom={true}
            />
          </div>
          <div className="flex items-center gap-2 mt-3">
            <input
              type="checkbox"
              id="add-agent-note"
              checked={(node.data.add_execution_note as boolean) ?? true}
              onChange={(e) => onUpdate({ add_execution_note: e.target.checked })}
              className="rounded bg-accent border-border"
            />
            <label htmlFor="add-agent-note" className="text-sm text-foreground">
              Add note with agent execution details
            </label>
          </div>
        </div>

        {/* Description */}
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
          <p className="font-medium text-muted-foreground mb-1">How it works</p>
          {agentType === "sales_outreach" && (
            <p>Researches the prospect, identifies pain points based on their company and role, then crafts personalized outreach messages designed to start conversations.</p>
          )}
          {agentType === "lead_scoring" && (
            <p>Analyzes lead data against your ideal customer profile, evaluates engagement signals, and assigns a score from 0-100 with detailed reasoning.</p>
          )}
          {agentType === "email_drafter" && (
            <p>Generates contextual emails based on record data and your specifications. Can match your writing style if provided with samples.</p>
          )}
          {agentType === "data_enrichment" && (
            <p>Searches multiple sources to fill in missing record data like company info, contact details, and recent news.</p>
          )}
          {agentType === "custom" && (
            <p>Executes a custom agent you&apos;ve configured with specific goals, tools, and behaviors.</p>
          )}
        </div>
      </div>
    );
  };

  const renderJoinConfig = () => {
    const joinType = (node.data.join_type as string) || "all";
    const incomingBranches = (node.data.incoming_branches as number) || 2;

    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-muted-foreground mb-1">Join Type</label>
          <select
            value={joinType}
            onChange={(e) => onUpdate({ join_type: e.target.value })}
            className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
          >
            <option value="all">Wait for All Branches</option>
            <option value="any">Wait for Any Branch</option>
            <option value="count">Wait for Count</option>
          </select>
        </div>

        {joinType === "count" && (
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Expected Count</label>
            <input
              type="number"
              min="1"
              max={incomingBranches}
              value={(node.data.expected_count as number) || 1}
              onChange={(e) => onUpdate({ expected_count: parseInt(e.target.value) || 1 })}
              className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Continue when this many branches complete
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm text-muted-foreground mb-1">Incoming Branches</label>
          <input
            type="number"
            min="2"
            max="10"
            value={incomingBranches}
            onChange={(e) => onUpdate({ incoming_branches: parseInt(e.target.value) || 2 })}
            className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Number of input handles for parallel branches
          </p>
        </div>

        <div>
          <label className="block text-sm text-muted-foreground mb-1">On Failure</label>
          <select
            value={(node.data.on_failure as string) || "fail"}
            onChange={(e) => onUpdate({ on_failure: e.target.value })}
            className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
          >
            <option value="fail">Stop workflow if any branch fails</option>
            <option value="continue">Continue with successful branches</option>
            <option value="skip">Skip join and continue workflow</option>
          </select>
        </div>

        <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
          <p className="font-medium text-muted-foreground mb-1">How it works</p>
          {joinType === "all" && (
            <p>Waits for all incoming parallel branches to complete before continuing.</p>
          )}
          {joinType === "any" && (
            <p>Continues as soon as any one of the incoming branches completes.</p>
          )}
          {joinType === "count" && (
            <p>Continues when the specified number of branches have completed.</p>
          )}
        </div>
      </div>
    );
  };

  const renderBranchConfig = () => {
    const branches = (node.data.branches as Array<{ id: string; label: string }>) || [
      { id: "branch-a", label: "Path A" },
      { id: "branch-b", label: "Path B" },
    ];

    const updateBranch = (index: number, label: string) => {
      const newBranches = [...branches];
      newBranches[index] = { ...newBranches[index], label };
      onUpdate({ branches: newBranches });
    };

    const addBranch = () => {
      const newId = `branch-${Date.now()}`;
      onUpdate({
        branches: [...branches, { id: newId, label: `Path ${branches.length + 1}` }],
      });
    };

    const removeBranch = (index: number) => {
      if (branches.length <= 2) return;
      onUpdate({
        branches: branches.filter((_, i) => i !== index),
      });
    };

    return (
      <div className="space-y-4">
        <label className="block text-sm text-muted-foreground">Branches</label>
        {branches.map((branch, index) => (
          <div key={branch.id} className="flex gap-2">
            <input
              type="text"
              value={branch.label}
              onChange={(e) => updateBranch(index, e.target.value)}
              placeholder={`Path ${index + 1}`}
              className="flex-1 bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
            />
            {branches.length > 2 && (
              <button
                onClick={() => removeBranch(index)}
                className="p-2 text-muted-foreground hover:text-red-400"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addBranch}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg text-muted-foreground hover:border-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Add Branch
        </button>
      </div>
    );
  };

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 md:hidden"
        onClick={onClose}
      />
      {/* Config panel - responsive */}
      <div className="fixed inset-y-0 right-0 w-full sm:w-96 md:w-80 md:relative md:inset-auto bg-muted md:bg-muted/50 border-l border-border overflow-y-auto z-50 md:z-auto">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-foreground font-semibold">Configure Node</h3>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

      <div className="p-4 space-y-4">
        {/* Label */}
        <div>
          <label className="block text-sm text-muted-foreground mb-1">Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm"
          />
        </div>

        {/* Node-specific config */}
        {renderConfigFields()}

        {/* Delete button */}
        <div className="pt-4 border-t border-border">
          <button
            onClick={onDelete}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Delete Node
          </button>
        </div>
      </div>
      </div>
    </>
  );
}
