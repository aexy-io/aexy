"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { ChevronDown, ChevronRight, Search, Database, Zap, Settings, Layers, X } from "lucide-react";
import { api } from "@/lib/api";

interface FieldSchema {
  path: string;
  name: string;
  type: string;
  description?: string;
  config?: Record<string, unknown>;
  required?: boolean;
}

interface SchemaCategory {
  label: string;
  fields: FieldSchema[];
}

interface NodeOutput {
  node_id: string;
  node_label: string;
  node_type: string;
  outputs: FieldSchema[];
}

interface FieldPickerProps {
  workspaceId: string;
  automationId: string;
  nodeId?: string;
  objectId?: string; // For fetching fields when automation is new
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowCustom?: boolean;
  className?: string;
}

const typeIcons: Record<string, string> = {
  text: "Aa",
  textarea: "Aa",
  number: "#",
  currency: "$",
  date: "D",
  timestamp: "T",
  checkbox: "Y",
  select: "v",
  multi_select: "vv",
  email: "@",
  phone: "P",
  url: "U",
  object: "{}",
};

const categoryIcons: Record<string, React.ReactNode> = {
  record: <Database className="h-4 w-4" />,
  trigger: <Zap className="h-4 w-4" />,
  system: <Settings className="h-4 w-4" />,
  nodes: <Layers className="h-4 w-4" />,
};

// Fallback for an automation that has not been saved yet, when there is no
// automation row for GET field-schema to describe.
//
// Every path here resolves in both executors. The list it replaces was
// invented — record.email, record.phone, record.company, record.title,
// record.stage, record.status, record.owner, record.created_at,
// record.updated_at, trigger.type, trigger.timestamp, system.current_date,
// system.current_time — and none of them resolve: record fields live under
// record.values.<slug>, the trigger key is trigger_type, and the system
// variables are now/today. Picking one produced a step that failed its run with
// "Dynamic value is missing" (canvas path) or shipped literal {{braces}}
// (inline path).
//
// Real record fields need the object's attributes, which arrive either from
// `objectId` below or from the server schema after the first save.
const defaultSchema: Record<string, SchemaCategory> = {
  record: {
    label: "Record Fields",
    fields: [
      { path: "record.id", name: "Record ID", type: "text" },
      { path: "record.name", name: "Record Name", type: "text" },
    ],
  },
  trigger: {
    label: "Trigger Data",
    fields: [
      { path: "trigger.trigger_type", name: "Trigger Type", type: "text" },
      { path: "trigger.workspace_id", name: "Workspace ID", type: "text" },
      { path: "trigger.object_id", name: "Object Type ID", type: "text" },
      { path: "trigger.record_id", name: "Record ID", type: "text" },
    ],
  },
  system: {
    label: "System Variables",
    fields: [
      { path: "system.now", name: "Current Timestamp", type: "timestamp" },
      { path: "system.today", name: "Today's Date", type: "date" },
    ],
  },
};

export function FieldPicker({
  workspaceId,
  automationId,
  nodeId,
  objectId,
  value,
  onChange,
  placeholder = "Select field...",
  allowCustom = true,
  className = "",
}: FieldPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [schema, setSchema] = useState<Record<string, SchemaCategory>>({});
  const [nodeOutputs, setNodeOutputs] = useState<NodeOutput[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["record"]));
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch schema on mount or use defaults for new automations
  useEffect(() => {
    async function fetchSchema() {
      setLoading(true);
      try {
        const response = await api.get(
          `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow/field-schema`
        );
        setSchema(response.data);
      } catch (error) {
        console.error("Failed to fetch field schema:", error);
      } finally {
        setLoading(false);
      }
    }

    async function fetchObjectSchema() {
      if (!objectId) {
        setSchema(defaultSchema);
        return;
      }

      setLoading(true);
      try {
        const response = await api.get(
          `/workspaces/${workspaceId}/crm/objects/${objectId}`
        );
        const obj = response.data;
        if (obj && obj.attributes) {
          setSchema({
            record: {
              label: "Record Fields",
              fields: [
                { path: "record.id", name: "Record ID", type: "text" },
                ...obj.attributes.map((attr: { slug: string; name: string; attribute_type: string; config?: Record<string, unknown>; is_required?: boolean; description?: string }) => ({
                  path: `record.values.${attr.slug}`,
                  name: attr.name,
                  type: attr.attribute_type,
                  config: attr.config,
                  required: attr.is_required,
                  description: attr.description,
                })),
              ],
            },
            trigger: defaultSchema.trigger,
            system: defaultSchema.system,
          });
        }
      } catch (error) {
        console.error("Failed to fetch object schema:", error);
        setSchema(defaultSchema);
      } finally {
        setLoading(false);
      }
    }

    // Use default schema for new automations (or fetch object schema if objectId provided)
    if (automationId === "new") {
      fetchObjectSchema();
    } else if (workspaceId && automationId) {
      fetchSchema();
    }
  }, [workspaceId, automationId, objectId]);

  // Fetch node outputs when nodeId changes
  useEffect(() => {
    async function fetchNodeOutputs() {
      if (!nodeId) return;

      try {
        const response = await api.get(
          `/workspaces/${workspaceId}/crm/automations/${automationId}/workflow/field-schema/node-outputs`,
          { params: { node_id: nodeId } }
        );
        setNodeOutputs(response.data.node_outputs || []);
      } catch (error) {
        console.error("Failed to fetch node outputs:", error);
      }
    }

    // Skip API call for new automations (automationId is "new" before creation)
    if (workspaceId && automationId && automationId !== "new" && nodeId) {
      fetchNodeOutputs();
    }
  }, [workspaceId, automationId, nodeId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter fields based on search
  const filteredSchema = useMemo(() => {
    if (!searchQuery) return schema;

    const filtered: Record<string, SchemaCategory> = {};
    const query = searchQuery.toLowerCase();

    for (const [key, category] of Object.entries(schema)) {
      const matchingFields = category.fields.filter(
        (field) =>
          field.name.toLowerCase().includes(query) ||
          field.path.toLowerCase().includes(query) ||
          field.description?.toLowerCase().includes(query)
      );

      if (matchingFields.length > 0) {
        filtered[key] = { ...category, fields: matchingFields };
      }
    }

    return filtered;
  }, [schema, searchQuery]);

  // Filter node outputs based on search
  const filteredNodeOutputs = useMemo(() => {
    if (!searchQuery) return nodeOutputs;

    const query = searchQuery.toLowerCase();
    return nodeOutputs
      .map((node) => ({
        ...node,
        outputs: node.outputs.filter(
          (output) =>
            output.name.toLowerCase().includes(query) ||
            output.path.toLowerCase().includes(query)
        ),
      }))
      .filter((node) => node.outputs.length > 0);
  }, [nodeOutputs, searchQuery]);

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const selectField = (path: string) => {
    onChange(`{{${path}}}`);
    setIsOpen(false);
    setSearchQuery("");
  };

  const getDisplayValue = () => {
    if (!value) return "";
    // Extract path from {{path}} format, or use value directly if not wrapped
    const match = value.match(/\{\{(.+?)\}\}/);
    const path = match ? match[1] : value;

    // Find the field name in schema
    for (const category of Object.values(schema)) {
      const field = category.fields.find((f) => f.path === path);
      if (field) return field.name;
    }
    // Check node outputs
    for (const node of nodeOutputs) {
      const output = node.outputs.find((o) => o.path === path);
      if (output) return `${node.node_label}: ${output.name}`;
    }
    // Return the path if no match found
    return path;
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Input field */}
      <div
        className="flex items-center gap-2 w-full bg-accent border border-border rounded-lg px-3 py-2 cursor-pointer hover:border-muted-foreground transition-colors"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
          }
        }}
      >
        <Database className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className={`flex-1 text-sm truncate ${value ? "text-foreground" : "text-muted-foreground"}`}>
          {getDisplayValue() || placeholder}
        </span>
        {value && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            aria-label="Clear field"
            title="Clear"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </div>

      {/* Dropdown. Its width is its own, not the trigger's: `left-0 right-0`
          made the panel exactly as wide as whatever opened it, and from the
          small "Insert field…" button that is ~130px — so every field name
          truncated to one or two characters. Anchored right so it stays inside
          the config panel whether the trigger is full-width (condition rows) or
          a narrow button at the panel's edge. */}
      {isOpen && (
        <div className="absolute z-50 top-full right-0 mt-1 w-80 max-w-[calc(100vw-2rem)] bg-muted border border-border rounded-lg shadow-xl max-h-[400px] overflow-hidden flex flex-col">
          {/* Search input */}
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 bg-accent rounded-lg px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search fields..."
                className="flex-1 bg-transparent text-foreground text-sm outline-none"
              />
            </div>
          </div>

          {/* Field list */}
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="text-center py-4 text-muted-foreground text-sm">Loading fields...</div>
            ) : (
              <>
                {/* Schema categories */}
                {Object.entries(filteredSchema).map(([key, category]) => (
                  <div key={key} className="mb-2">
                    <button
                      className="flex items-center gap-2 w-full px-2 py-1.5 text-left text-sm font-medium text-foreground hover:bg-accent/50 rounded"
                      onClick={() => toggleCategory(key)}
                    >
                      {expandedCategories.has(key) ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      {categoryIcons[key]}
                      <span>{category.label}</span>
                      <span className="text-muted-foreground text-xs ml-auto">{category.fields.length}</span>
                    </button>

                    {expandedCategories.has(key) && (
                      <div className="ml-4 mt-1 space-y-0.5">
                        {category.fields.map((field) => (
                          <button
                            key={field.path}
                            className="flex items-center gap-2 w-full px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent rounded group"
                            onClick={() => selectField(field.path)}
                          >
                            <span className="w-5 h-5 shrink-0 flex items-center justify-center text-xs text-muted-foreground bg-accent/50 rounded">
                              {typeIcons[field.type] || "?"}
                            </span>
                            {/* Name and path stacked. Side by side, the path was
                                clipped to 100px and only appeared on hover, so
                                the one thing that says what a field resolves to
                                was the first thing to disappear. */}
                            <span className="flex-1 min-w-0">
                              <span className="flex items-center gap-1">
                                <span className="truncate">{field.name}</span>
                                {field.required && (
                                  <span className="text-amber-400 text-xs shrink-0">*</span>
                                )}
                              </span>
                              <span className="block text-muted-foreground text-xs font-mono truncate">
                                {field.path}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* Node outputs */}
                {filteredNodeOutputs.length > 0 && (
                  <div className="mb-2">
                    <button
                      className="flex items-center gap-2 w-full px-2 py-1.5 text-left text-sm font-medium text-foreground hover:bg-accent/50 rounded"
                      onClick={() => toggleCategory("nodes")}
                    >
                      {expandedCategories.has("nodes") ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      {categoryIcons.nodes}
                      <span>Previous Node Outputs</span>
                      <span className="text-muted-foreground text-xs ml-auto">
                        {filteredNodeOutputs.reduce((sum, n) => sum + n.outputs.length, 0)}
                      </span>
                    </button>

                    {expandedCategories.has("nodes") && (
                      <div className="ml-4 mt-1 space-y-2">
                        {filteredNodeOutputs.map((node) => (
                          <div key={node.node_id}>
                            <div className="text-xs text-muted-foreground px-2 py-1">
                              {node.node_label}
                            </div>
                            <div className="space-y-0.5">
                              {node.outputs.map((output) => (
                                <button
                                  key={output.path}
                                  className="flex items-center gap-2 w-full px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent rounded group"
                                  onClick={() => selectField(output.path)}
                                >
                                  <span className="w-5 h-5 shrink-0 flex items-center justify-center text-xs text-muted-foreground bg-accent/50 rounded">
                                    {typeIcons[output.type] || "?"}
                                  </span>
                                  <span className="flex-1 min-w-0">
                                    <span className="block truncate">{output.name}</span>
                                    <span className="block text-muted-foreground text-xs font-mono truncate">
                                      {output.path}
                                    </span>
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Empty state */}
                {Object.keys(filteredSchema).length === 0 && filteredNodeOutputs.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    {searchQuery ? "No matching fields found" : "No fields available"}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Custom value input */}
          {allowCustom && (
            <div className="p-2 border-t border-border">
              <div className="text-xs text-muted-foreground mb-1">Or enter custom path:</div>
              <input
                type="text"
                placeholder="e.g., record.values.custom_field"
                className="w-full bg-accent border border-border rounded px-2 py-1.5 text-sm text-foreground placeholder-muted-foreground"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const input = e.currentTarget.value.trim();
                    if (input) {
                      selectField(input);
                      e.currentTarget.value = "";
                    }
                  }
                }}
                // Commit on blur too: typing a path and clicking straight on
                // Save used to silently discard it, leaving the old selection.
                onBlur={(e) => {
                  const input = e.currentTarget.value.trim();
                  if (input) {
                    selectField(input);
                    e.currentTarget.value = "";
                  }
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Inline field picker for use inside text areas
export function InlineFieldPicker({
  workspaceId,
  automationId,
  nodeId,
  objectId,
  onInsert,
  className = "",
}: {
  workspaceId: string;
  automationId: string;
  nodeId?: string;
  objectId?: string;
  onInsert: (value: string) => void;
  className?: string;
}) {
  const [value, setValue] = useState("");

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <FieldPicker
        workspaceId={workspaceId}
        automationId={automationId}
        nodeId={nodeId}
        objectId={objectId}
        value={value}
        onChange={(v) => {
          if (v) {
            onInsert(v);
            setValue("");
          }
        }}
        placeholder="Insert field..."
        allowCustom={true}
      />
    </div>
  );
}
