"use client";

import { useState, useRef, useEffect } from "react";
import { Node } from "@xyflow/react";
import { X, Trash2, ChevronDown, Plus, Database, Copy, Check, ExternalLink, Code } from "lucide-react";
import { FieldPicker, InlineFieldPicker } from "./FieldPicker";
import { api } from "@/lib/api";

interface NodeConfigPanelProps {
  node: Node;
  workspaceId: string;
  automationId: string;
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
  onUpdate,
  onDelete,
  onClose,
}: NodeConfigPanelProps) {
  const [label, setLabel] = useState((node.data.label as string) || "");
  const emailBodyRef = useRef<HTMLTextAreaElement>(null);
  const messageTemplateRef = useRef<HTMLTextAreaElement>(null);
  const webhookBodyRef = useRef<HTMLTextAreaElement>(null);

  // Webhook trigger state
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSamplePayload, setShowSamplePayload] = useState(false);

  const triggerType = node.data.trigger_type as string;

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

    return (
      <div className="space-y-4">
        {triggerType === "field_changed" && (
          <div>
            <label className="block text-sm text-slate-400 mb-1">Field to Watch</label>
            <input
              type="text"
              value={(node.data.field_slug as string) || ""}
              onChange={(e) => onUpdate({ field_slug: e.target.value })}
              placeholder="e.g., status"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
        )}

        {triggerType === "scheduled" && (
          <div>
            <label className="block text-sm text-slate-400 mb-1">Schedule (Cron)</label>
            <input
              type="text"
              value={(node.data.schedule as string) || ""}
              onChange={(e) => onUpdate({ schedule: e.target.value })}
              placeholder="0 9 * * *"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">
              Example: 0 9 * * * (daily at 9am)
            </p>
          </div>
        )}

        {triggerType === "webhook_received" && (
          <div className="space-y-4">
            {/* Webhook URL */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Webhook URL</label>
              {webhookLoading ? (
                <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
                  <div className="animate-spin h-4 w-4 border-2 border-slate-500 border-t-transparent rounded-full" />
                  Loading...
                </div>
              ) : webhookUrl ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={webhookUrl}
                      readOnly
                      className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-xs font-mono cursor-text"
                    />
                    <button
                      onClick={() => copyToClipboard(webhookUrl)}
                      className={`p-2 rounded-lg transition-colors ${
                        copied
                          ? "bg-green-500/20 text-green-400"
                          : "bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600"
                      }`}
                      title={copied ? "Copied!" : "Copy URL"}
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded font-medium">POST</span>
                    <span>Send a POST request to trigger this workflow</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Save and publish your workflow to get a webhook URL
                </p>
              )}
            </div>

            {/* Sample Payload */}
            <div>
              <button
                onClick={() => setShowSamplePayload(!showSamplePayload)}
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                <Code className="h-4 w-4" />
                <span>{showSamplePayload ? "Hide" : "Show"} sample payload</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${showSamplePayload ? "rotate-180" : ""}`}
                />
              </button>
              {showSamplePayload && (
                <div className="mt-2 relative">
                  <pre className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-300 font-mono overflow-x-auto">
                    {samplePayload}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(samplePayload)}
                    className="absolute top-2 right-2 p-1.5 bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                    title="Copy payload"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Info box */}
            <div className="text-xs text-slate-500 bg-slate-800/50 rounded-lg p-3">
              <p className="font-medium text-slate-400 mb-1">How it works</p>
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
              <label className="block text-sm text-slate-400 mb-1">Subject</label>
              <input
                type="text"
                value={(node.data.email_subject as string) || ""}
                onChange={(e) => onUpdate({ email_subject: e.target.value })}
                placeholder="Email subject..."
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-slate-400">Body</label>
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
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="ai-personalize"
                checked={(node.data.use_ai_personalization as boolean) || false}
                onChange={(e) => onUpdate({ use_ai_personalization: e.target.checked })}
                className="rounded bg-slate-700 border-slate-600"
              />
              <label htmlFor="ai-personalize" className="text-sm text-slate-300">
                Use AI to personalize
              </label>
            </div>
          </>
        )}

        {(actionType === "send_slack" || actionType === "send_sms") && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-slate-400">Message</label>
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
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
        )}

        {actionType === "webhook_call" && (
          <>
            <div>
              <label className="block text-sm text-slate-400 mb-1">URL</label>
              <input
                type="url"
                value={(node.data.webhook_url as string) || ""}
                onChange={(e) => onUpdate({ webhook_url: e.target.value })}
                placeholder="https://..."
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Method</label>
              <select
                value={(node.data.http_method as string) || "POST"}
                onChange={(e) => onUpdate({ http_method: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
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
                <label className="text-sm text-slate-400">Body (JSON)</label>
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
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm font-mono"
              />
            </div>
          </>
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
          <label className="block text-sm text-slate-400 mb-1">Match</label>
          <select
            value={conjunction}
            onChange={(e) => onUpdate({ conjunction: e.target.value })}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="and">All conditions (AND)</option>
            <option value="or">Any condition (OR)</option>
          </select>
        </div>

        <div className="space-y-3">
          <label className="block text-sm text-slate-400">Conditions</label>
          {conditions.map((condition, index) => (
            <div key={index} className="bg-slate-700/50 rounded-lg p-3 space-y-2">
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
                  className="p-1.5 text-slate-400 hover:text-red-400 mt-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <select
                value={condition.operator}
                onChange={(e) => updateCondition(index, { operator: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm"
              >
                {conditionOperators.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
              {!["is_empty", "is_not_empty"].includes(condition.operator) && (
                <input
                  type="text"
                  value={condition.value}
                  onChange={(e) => updateCondition(index, { value: e.target.value })}
                  placeholder="Value"
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm"
                />
              )}
            </div>
          ))}
          <button
            onClick={addCondition}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-slate-600 rounded-lg text-slate-400 hover:border-slate-500 hover:text-slate-300"
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
          <label className="block text-sm text-slate-400 mb-1">Wait Type</label>
          <select
            value={waitType}
            onChange={(e) => onUpdate({ wait_type: e.target.value })}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="duration">Duration</option>
            <option value="datetime">Until Date/Time</option>
            <option value="event">Until Event</option>
          </select>
        </div>

        {waitType === "duration" && (
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-sm text-slate-400 mb-1">Duration</label>
              <input
                type="number"
                min="1"
                value={(node.data.duration_value as number) || 1}
                onChange={(e) => onUpdate({ duration_value: parseInt(e.target.value) || 1 })}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-slate-400 mb-1">Unit</label>
              <select
                value={(node.data.duration_unit as string) || "days"}
                onChange={(e) => onUpdate({ duration_unit: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
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
            <label className="block text-sm text-slate-400 mb-1">Wait Until</label>
            <input
              type="datetime-local"
              value={(node.data.wait_until as string) || ""}
              onChange={(e) => onUpdate({ wait_until: e.target.value })}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
        )}

        {waitType === "event" && (
          <>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Wait for Event</label>
              <select
                value={(node.data.wait_for_event as string) || ""}
                onChange={(e) => onUpdate({ wait_for_event: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
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
                <label className="block text-sm text-slate-400 mb-1">
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
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
            )}

            {(node.data.wait_for_event as string) === "form.submitted" && (
              <div>
                <label className="block text-sm text-slate-400 mb-1">
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
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
            )}

            {(node.data.wait_for_event as string)?.startsWith("meeting.") && (
              <div>
                <label className="block text-sm text-slate-400 mb-1">
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
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
            )}

            {(node.data.wait_for_event as string) === "webhook.received" && (
              <div>
                <label className="block text-sm text-slate-400 mb-1">
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
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-sm text-slate-400 mb-1">Timeout (hours)</label>
              <input
                type="number"
                min="1"
                value={(node.data.timeout_hours as number) || 24}
                onChange={(e) => onUpdate({ timeout_hours: parseInt(e.target.value) || 24 })}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              />
              <p className="text-xs text-slate-500 mt-1">
                Workflow fails if event not received within timeout
              </p>
            </div>

            <div className="text-xs text-slate-500 bg-slate-800/50 rounded-lg p-3">
              <p className="font-medium text-slate-400 mb-1">How it works</p>
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
          <label className="block text-sm text-slate-400 mb-1">Agent Type</label>
          <select
            value={agentType}
            onChange={(e) => onUpdate({ agent_type: e.target.value })}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="sales_outreach">Sales Outreach</option>
            <option value="lead_scoring">Lead Scoring</option>
            <option value="email_drafter">Email Drafter</option>
            <option value="data_enrichment">Data Enrichment</option>
            <option value="custom">Custom Agent</option>
          </select>
        </div>

        {agentType === "custom" && (
          <div>
            <label className="block text-sm text-slate-400 mb-1">Agent ID</label>
            <input
              type="text"
              value={(node.data.agent_id as string) || ""}
              onChange={(e) => onUpdate({ agent_id: e.target.value })}
              placeholder="Select or enter agent ID"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
        )}

        <div className="text-xs text-slate-500 bg-slate-800/50 rounded-lg p-3">
          <p className="font-medium text-slate-400 mb-1">Agent Description</p>
          {agentType === "sales_outreach" && (
            <p>Research prospect, identify pain points, and craft personalized outreach.</p>
          )}
          {agentType === "lead_scoring" && (
            <p>Score leads 0-100 based on fit and engagement signals.</p>
          )}
          {agentType === "email_drafter" && (
            <p>Generate emails matching your personal writing style.</p>
          )}
          {agentType === "data_enrichment" && (
            <p>Fill missing CRM fields from external sources.</p>
          )}
          {agentType === "custom" && (
            <p>Use a custom agent you&apos;ve configured.</p>
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
          <label className="block text-sm text-slate-400 mb-1">Join Type</label>
          <select
            value={joinType}
            onChange={(e) => onUpdate({ join_type: e.target.value })}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="all">Wait for All Branches</option>
            <option value="any">Wait for Any Branch</option>
            <option value="count">Wait for Count</option>
          </select>
        </div>

        {joinType === "count" && (
          <div>
            <label className="block text-sm text-slate-400 mb-1">Expected Count</label>
            <input
              type="number"
              min="1"
              max={incomingBranches}
              value={(node.data.expected_count as number) || 1}
              onChange={(e) => onUpdate({ expected_count: parseInt(e.target.value) || 1 })}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">
              Continue when this many branches complete
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm text-slate-400 mb-1">Incoming Branches</label>
          <input
            type="number"
            min="2"
            max="10"
            value={incomingBranches}
            onChange={(e) => onUpdate({ incoming_branches: parseInt(e.target.value) || 2 })}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
          />
          <p className="text-xs text-slate-500 mt-1">
            Number of input handles for parallel branches
          </p>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">On Failure</label>
          <select
            value={(node.data.on_failure as string) || "fail"}
            onChange={(e) => onUpdate({ on_failure: e.target.value })}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="fail">Stop workflow if any branch fails</option>
            <option value="continue">Continue with successful branches</option>
            <option value="skip">Skip join and continue workflow</option>
          </select>
        </div>

        <div className="text-xs text-slate-500 bg-slate-800/50 rounded-lg p-3">
          <p className="font-medium text-slate-400 mb-1">How it works</p>
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
        <label className="block text-sm text-slate-400">Branches</label>
        {branches.map((branch, index) => (
          <div key={branch.id} className="flex gap-2">
            <input
              type="text"
              value={branch.label}
              onChange={(e) => updateBranch(index, e.target.value)}
              placeholder={`Path ${index + 1}`}
              className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            />
            {branches.length > 2 && (
              <button
                onClick={() => removeBranch(index)}
                className="p-2 text-slate-400 hover:text-red-400"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addBranch}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-slate-600 rounded-lg text-slate-400 hover:border-slate-500 hover:text-slate-300"
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
      <div className="fixed inset-y-0 right-0 w-full sm:w-96 md:w-80 md:relative md:inset-auto bg-slate-800 md:bg-slate-800/50 border-l border-slate-700 overflow-y-auto z-50 md:z-auto">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-white font-semibold">Configure Node</h3>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

      <div className="p-4 space-y-4">
        {/* Label */}
        <div>
          <label className="block text-sm text-slate-400 mb-1">Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
          />
        </div>

        {/* Node-specific config */}
        {renderConfigFields()}

        {/* Delete button */}
        <div className="pt-4 border-t border-slate-700">
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
