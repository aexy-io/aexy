"use client";

import { useState } from "react";
import { Node } from "@xyflow/react";
import { X, Trash2, ChevronDown, Plus } from "lucide-react";

interface NodeConfigPanelProps {
  node: Node;
  workspaceId: string;
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
  onUpdate,
  onDelete,
  onClose,
}: NodeConfigPanelProps) {
  const [label, setLabel] = useState((node.data.label as string) || "");

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
      default:
        return null;
    }
  };

  const renderTriggerConfig = () => {
    const triggerType = node.data.trigger_type as string;

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
          <div>
            <label className="block text-sm text-slate-400 mb-1">Webhook Path</label>
            <input
              type="text"
              value={(node.data.webhook_path as string) || ""}
              onChange={(e) => onUpdate({ webhook_path: e.target.value })}
              placeholder="/my-webhook"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            />
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
              <label className="block text-sm text-slate-400 mb-1">Body</label>
              <textarea
                value={(node.data.email_body as string) || ""}
                onChange={(e) => onUpdate({ email_body: e.target.value })}
                placeholder="Email body... Use {{record.field}} for variables"
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
            <label className="block text-sm text-slate-400 mb-1">Message</label>
            <textarea
              value={(node.data.message_template as string) || ""}
              onChange={(e) => onUpdate({ message_template: e.target.value })}
              placeholder="Message... Use {{record.field}} for variables"
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
              <label className="block text-sm text-slate-400 mb-1">Body (JSON)</label>
              <textarea
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
              <div className="flex gap-2">
                <input
                  type="text"
                  value={condition.field}
                  onChange={(e) => updateCondition(index, { field: e.target.value })}
                  placeholder="Field"
                  className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm"
                />
                <button
                  onClick={() => removeCondition(index)}
                  className="p-1.5 text-slate-400 hover:text-red-400"
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
                <option value="email.opened">Email Opened</option>
                <option value="email.clicked">Email Clicked</option>
                <option value="email.replied">Email Replied</option>
                <option value="form.submitted">Form Submitted</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Timeout (hours)</label>
              <input
                type="number"
                min="1"
                value={(node.data.timeout_hours as number) || 24}
                onChange={(e) => onUpdate({ timeout_hours: parseInt(e.target.value) || 24 })}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              />
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
    <div className="w-80 bg-slate-800/50 border-l border-slate-700 overflow-y-auto">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <h3 className="text-white font-semibold">Configure Node</h3>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-white"
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
  );
}
