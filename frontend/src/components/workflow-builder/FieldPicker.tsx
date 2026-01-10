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

// Default fields available for new automations before saving
const defaultSchema: Record<string, SchemaCategory> = {
  record: {
    label: "Record Fields",
    fields: [
      { path: "record.id", name: "Record ID", type: "text" },
      { path: "record.name", name: "Name", type: "text" },
      { path: "record.email", name: "Email", type: "email" },
      { path: "record.phone", name: "Phone", type: "phone" },
      { path: "record.company", name: "Company", type: "text" },
      { path: "record.title", name: "Title", type: "text" },
      { path: "record.stage", name: "Stage", type: "select" },
      { path: "record.status", name: "Status", type: "select" },
      { path: "record.owner", name: "Owner", type: "text" },
      { path: "record.created_at", name: "Created At", type: "timestamp" },
      { path: "record.updated_at", name: "Updated At", type: "timestamp" },
    ],
  },
  trigger: {
    label: "Trigger Data",
    fields: [
      { path: "trigger.type", name: "Trigger Type", type: "text" },
      { path: "trigger.timestamp", name: "Trigger Time", type: "timestamp" },
      { path: "trigger.payload", name: "Payload", type: "object" },
    ],
  },
  system: {
    label: "System",
    fields: [
      { path: "system.current_date", name: "Current Date", type: "date" },
      { path: "system.current_time", name: "Current Time", type: "timestamp" },
    ],
  },
};

export function FieldPicker({
  workspaceId,
  automationId,
  nodeId,
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

    // Use default schema for new automations, fetch from API for existing ones
    if (automationId === "new") {
      setSchema(defaultSchema);
    } else if (workspaceId && automationId) {
      fetchSchema();
    }
  }, [workspaceId, automationId]);

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
        className="flex items-center gap-2 w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 cursor-pointer hover:border-slate-500 transition-colors"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
          }
        }}
      >
        <Database className="h-4 w-4 text-slate-400 flex-shrink-0" />
        <span className={`flex-1 text-sm truncate ${value ? "text-white" : "text-slate-400"}`}>
          {getDisplayValue() || placeholder}
        </span>
        {value && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-[400px] overflow-hidden flex flex-col">
          {/* Search input */}
          <div className="p-2 border-b border-slate-700">
            <div className="flex items-center gap-2 bg-slate-700 rounded-lg px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search fields..."
                className="flex-1 bg-transparent text-white text-sm outline-none"
              />
            </div>
          </div>

          {/* Field list */}
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="text-center py-4 text-slate-400 text-sm">Loading fields...</div>
            ) : (
              <>
                {/* Schema categories */}
                {Object.entries(filteredSchema).map(([key, category]) => (
                  <div key={key} className="mb-2">
                    <button
                      className="flex items-center gap-2 w-full px-2 py-1.5 text-left text-sm font-medium text-slate-300 hover:bg-slate-700/50 rounded"
                      onClick={() => toggleCategory(key)}
                    >
                      {expandedCategories.has(key) ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      {categoryIcons[key]}
                      <span>{category.label}</span>
                      <span className="text-slate-500 text-xs ml-auto">{category.fields.length}</span>
                    </button>

                    {expandedCategories.has(key) && (
                      <div className="ml-4 mt-1 space-y-0.5">
                        {category.fields.map((field) => (
                          <button
                            key={field.path}
                            className="flex items-center gap-2 w-full px-2 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-700 rounded group"
                            onClick={() => selectField(field.path)}
                          >
                            <span className="w-5 h-5 flex items-center justify-center text-xs text-slate-500 bg-slate-700/50 rounded">
                              {typeIcons[field.type] || "?"}
                            </span>
                            <span className="flex-1 truncate">{field.name}</span>
                            {field.required && (
                              <span className="text-amber-400 text-xs">*</span>
                            )}
                            <span className="text-slate-500 text-xs opacity-0 group-hover:opacity-100 truncate max-w-[100px]">
                              {field.path}
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
                      className="flex items-center gap-2 w-full px-2 py-1.5 text-left text-sm font-medium text-slate-300 hover:bg-slate-700/50 rounded"
                      onClick={() => toggleCategory("nodes")}
                    >
                      {expandedCategories.has("nodes") ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      {categoryIcons.nodes}
                      <span>Previous Node Outputs</span>
                      <span className="text-slate-500 text-xs ml-auto">
                        {filteredNodeOutputs.reduce((sum, n) => sum + n.outputs.length, 0)}
                      </span>
                    </button>

                    {expandedCategories.has("nodes") && (
                      <div className="ml-4 mt-1 space-y-2">
                        {filteredNodeOutputs.map((node) => (
                          <div key={node.node_id}>
                            <div className="text-xs text-slate-500 px-2 py-1">
                              {node.node_label}
                            </div>
                            <div className="space-y-0.5">
                              {node.outputs.map((output) => (
                                <button
                                  key={output.path}
                                  className="flex items-center gap-2 w-full px-2 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-700 rounded group"
                                  onClick={() => selectField(output.path)}
                                >
                                  <span className="w-5 h-5 flex items-center justify-center text-xs text-slate-500 bg-slate-700/50 rounded">
                                    {typeIcons[output.type] || "?"}
                                  </span>
                                  <span className="flex-1 truncate">{output.name}</span>
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
                  <div className="text-center py-4 text-slate-400 text-sm">
                    {searchQuery ? "No matching fields found" : "No fields available"}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Custom value input */}
          {allowCustom && (
            <div className="p-2 border-t border-slate-700">
              <div className="text-xs text-slate-500 mb-1">Or enter custom path:</div>
              <input
                type="text"
                placeholder="e.g., record.values.custom_field"
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white placeholder-slate-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const input = e.currentTarget.value.trim();
                    if (input) {
                      selectField(input);
                      e.currentTarget.value = "";
                    }
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
  onInsert,
  className = "",
}: {
  workspaceId: string;
  automationId: string;
  nodeId?: string;
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
