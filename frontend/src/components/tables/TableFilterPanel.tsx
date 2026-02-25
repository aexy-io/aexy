"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { X, Plus, Filter, ChevronDown } from "lucide-react";
import type { CRMAttribute, CRMAttributeType } from "@/lib/api";

// ─── Filter Types ─────────────────────────────────────────────────

export interface FilterRule {
  id: string;
  field: string; // attribute slug
  operator: FilterOperator;
  value: string;
}

export type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "is_true"
  | "is_false";

interface OperatorOption {
  value: FilterOperator;
  label: string;
  needsValue: boolean;
}

const TEXT_OPERATORS: OperatorOption[] = [
  { value: "contains", label: "contains", needsValue: true },
  { value: "not_contains", label: "does not contain", needsValue: true },
  { value: "equals", label: "is", needsValue: true },
  { value: "not_equals", label: "is not", needsValue: true },
  { value: "is_empty", label: "is empty", needsValue: false },
  { value: "is_not_empty", label: "is not empty", needsValue: false },
];

const NUMBER_OPERATORS: OperatorOption[] = [
  { value: "equals", label: "=", needsValue: true },
  { value: "not_equals", label: "≠", needsValue: true },
  { value: "gt", label: ">", needsValue: true },
  { value: "gte", label: "≥", needsValue: true },
  { value: "lt", label: "<", needsValue: true },
  { value: "lte", label: "≤", needsValue: true },
  { value: "is_empty", label: "is empty", needsValue: false },
  { value: "is_not_empty", label: "is not empty", needsValue: false },
];

const SELECT_OPERATORS: OperatorOption[] = [
  { value: "equals", label: "is", needsValue: true },
  { value: "not_equals", label: "is not", needsValue: true },
  { value: "is_empty", label: "is empty", needsValue: false },
  { value: "is_not_empty", label: "is not empty", needsValue: false },
];

const BOOLEAN_OPERATORS: OperatorOption[] = [
  { value: "is_true", label: "is checked", needsValue: false },
  { value: "is_false", label: "is unchecked", needsValue: false },
];

const DATE_OPERATORS: OperatorOption[] = [
  { value: "equals", label: "is", needsValue: true },
  { value: "gt", label: "is after", needsValue: true },
  { value: "lt", label: "is before", needsValue: true },
  { value: "is_empty", label: "is empty", needsValue: false },
  { value: "is_not_empty", label: "is not empty", needsValue: false },
];

function getOperatorsForType(type: CRMAttributeType): OperatorOption[] {
  switch (type) {
    case "number":
    case "currency":
    case "rating":
      return NUMBER_OPERATORS;
    case "select":
    case "status":
    case "multi_select":
      return SELECT_OPERATORS;
    case "checkbox":
      return BOOLEAN_OPERATORS;
    case "date":
    case "datetime":
      return DATE_OPERATORS;
    default:
      return TEXT_OPERATORS;
  }
}

// ─── Client-side filter matching ──────────────────────────────────

export function matchesFilters(record: { values: Record<string, unknown> }, filters: FilterRule[], attributes: CRMAttribute[]): boolean {
  if (filters.length === 0) return true;
  return filters.every((filter) => matchesFilter(record, filter, attributes));
}

function matchesFilter(record: { values: Record<string, unknown> }, filter: FilterRule, attributes: CRMAttribute[]): boolean {
  const val = record.values[filter.field];
  const strVal = val != null ? String(val).toLowerCase() : "";
  const filterVal = filter.value?.toLowerCase() ?? "";

  switch (filter.operator) {
    case "is_empty":
      return val === null || val === undefined || val === "";
    case "is_not_empty":
      return val !== null && val !== undefined && val !== "";
    case "is_true":
      return val === true || val === "true";
    case "is_false":
      return val === false || val === "false" || val === null || val === undefined;
    case "equals":
      return strVal === filterVal;
    case "not_equals":
      return strVal !== filterVal;
    case "contains":
      return strVal.includes(filterVal);
    case "not_contains":
      return !strVal.includes(filterVal);
    case "gt": {
      const numVal = parseFloat(strVal);
      const numFilter = parseFloat(filterVal);
      if (isNaN(numVal) || isNaN(numFilter)) return strVal > filterVal;
      return numVal > numFilter;
    }
    case "gte": {
      const numVal = parseFloat(strVal);
      const numFilter = parseFloat(filterVal);
      if (isNaN(numVal) || isNaN(numFilter)) return strVal >= filterVal;
      return numVal >= numFilter;
    }
    case "lt": {
      const numVal = parseFloat(strVal);
      const numFilter = parseFloat(filterVal);
      if (isNaN(numVal) || isNaN(numFilter)) return strVal < filterVal;
      return numVal < numFilter;
    }
    case "lte": {
      const numVal = parseFloat(strVal);
      const numFilter = parseFloat(filterVal);
      if (isNaN(numVal) || isNaN(numFilter)) return strVal <= filterVal;
      return numVal <= numFilter;
    }
    default:
      return true;
  }
}

// ─── Filter Row ───────────────────────────────────────────────────

function FilterRow({
  rule,
  attributes,
  onChange,
  onRemove,
}: {
  rule: FilterRule;
  attributes: CRMAttribute[];
  onChange: (updated: FilterRule) => void;
  onRemove: () => void;
}) {
  const attr = attributes.find((a) => a.slug === rule.field);
  const operators = attr ? getOperatorsForType(attr.attribute_type) : TEXT_OPERATORS;
  const currentOp = operators.find((o) => o.value === rule.operator);
  const needsValue = currentOp?.needsValue ?? true;
  const isSelectType = attr && ["select", "status", "multi_select"].includes(attr.attribute_type);
  const isDateType = attr && ["date", "datetime"].includes(attr.attribute_type);

  return (
    <div className="flex items-center gap-2">
      {/* Field picker */}
      <select
        value={rule.field}
        onChange={(e) => {
          const newAttr = attributes.find((a) => a.slug === e.target.value);
          const newOps = newAttr ? getOperatorsForType(newAttr.attribute_type) : TEXT_OPERATORS;
          onChange({ ...rule, field: e.target.value, operator: newOps[0].value, value: "" });
        }}
        className="px-2 py-1.5 bg-accent border border-border rounded-lg text-sm text-foreground min-w-[120px] focus:outline-none focus:ring-2 focus:ring-purple-500/50"
      >
        {attributes.filter((a) => !a.is_system).map((a) => (
          <option key={a.slug} value={a.slug}>
            {a.name}
          </option>
        ))}
      </select>

      {/* Operator picker */}
      <select
        value={rule.operator}
        onChange={(e) => onChange({ ...rule, operator: e.target.value as FilterOperator })}
        className="px-2 py-1.5 bg-accent border border-border rounded-lg text-sm text-foreground min-w-[120px] focus:outline-none focus:ring-2 focus:ring-purple-500/50"
      >
        {operators.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>

      {/* Value input */}
      {needsValue && (
        isSelectType && attr?.config?.options ? (
          <select
            value={rule.value}
            onChange={(e) => onChange({ ...rule, value: e.target.value })}
            className="px-2 py-1.5 bg-accent border border-border rounded-lg text-sm text-foreground min-w-[140px] focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="">Select...</option>
            {(attr.config.options as { value: string; label: string }[]).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : isDateType ? (
          <input
            type={attr?.attribute_type === "datetime" ? "datetime-local" : "date"}
            value={rule.value}
            onChange={(e) => onChange({ ...rule, value: e.target.value })}
            className="px-2 py-1.5 bg-accent border border-border rounded-lg text-sm text-foreground min-w-[140px] focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        ) : (
          <input
            type={["number", "currency", "rating"].includes(attr?.attribute_type || "") ? "number" : "text"}
            value={rule.value}
            onChange={(e) => onChange({ ...rule, value: e.target.value })}
            placeholder="Value..."
            className="px-2 py-1.5 bg-accent border border-border rounded-lg text-sm text-foreground min-w-[140px] placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        )
      )}

      {/* Remove */}
      <button
        onClick={onRemove}
        className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── TableFilterPanel ─────────────────────────────────────────────

interface TableFilterPanelProps {
  attributes: CRMAttribute[];
  filters: FilterRule[];
  onChange: (filters: FilterRule[]) => void;
}

let _filterId = 0;
function nextFilterId() {
  return `f_${++_filterId}_${Date.now()}`;
}

export function TableFilterPanel({ attributes, filters, onChange }: TableFilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const filterableAttributes = useMemo(
    () => attributes.filter((a) => !a.is_system),
    [attributes]
  );

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const addFilter = () => {
    const firstAttr = filterableAttributes[0];
    if (!firstAttr) return;
    const ops = getOperatorsForType(firstAttr.attribute_type);
    onChange([
      ...filters,
      { id: nextFilterId(), field: firstAttr.slug, operator: ops[0].value, value: "" },
    ]);
  };

  const updateFilter = (id: string, updated: FilterRule) => {
    onChange(filters.map((f) => (f.id === id ? updated : f)));
  };

  const removeFilter = (id: string) => {
    onChange(filters.filter((f) => f.id !== id));
  };

  const clearAll = () => {
    onChange([]);
  };

  const activeCount = filters.length;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
          activeCount > 0
            ? "bg-purple-600/20 border-purple-500/50 text-purple-300 hover:bg-purple-600/30"
            : "bg-muted hover:bg-accent border-border text-foreground"
        }`}
      >
        <Filter className="h-4 w-4" />
        Filter
        {activeCount > 0 && (
          <span className="px-1.5 py-0.5 bg-purple-600 text-white text-xs rounded-full min-w-[20px] text-center">
            {activeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-2 z-50 w-[540px] bg-muted border border-border rounded-xl shadow-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Filters</h3>
            <div className="flex items-center gap-2">
              {activeCount > 0 && (
                <button
                  onClick={clearAll}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear all
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-accent rounded-lg text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="p-3 space-y-2 max-h-[300px] overflow-y-auto">
            {filters.length === 0 ? (
              <div className="text-center py-4 text-sm text-muted-foreground">
                No filters applied. Add a filter to narrow down records.
              </div>
            ) : (
              filters.map((rule) => (
                <FilterRow
                  key={rule.id}
                  rule={rule}
                  attributes={filterableAttributes}
                  onChange={(updated) => updateFilter(rule.id, updated)}
                  onRemove={() => removeFilter(rule.id)}
                />
              ))
            )}
          </div>

          {filterableAttributes.length > 0 && (
            <div className="px-3 pb-3">
              <button
                onClick={addFilter}
                className="flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add filter
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
