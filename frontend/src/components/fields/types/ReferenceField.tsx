"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Database, Users, X } from "lucide-react";
import { FieldViewProps, FieldEditProps } from "../types";
import { useCRMRecords, useCRMRecord } from "@/hooks/useCRM";
import { CRMRecord } from "@/lib/api";

export function RecordReferenceFieldView({ value, surface }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }
  // value can be an ID string or an object with display_name
  const display = typeof value === "object" && value !== null && "display_name" in value
    ? String((value as { display_name: string }).display_name)
    : String(value);
  return (
    <span className="inline-flex items-center gap-1 text-sm text-purple-400">
      <Database className="h-3 w-3" />
      {display}
    </span>
  );
}

export function UserReferenceFieldView({ value, surface }: FieldViewProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{surface === "highlights" ? "Not set" : "—"}</span>;
  }
  const display = typeof value === "object" && value !== null && "name" in value
    ? String((value as { name: string }).name)
    : String(value);
  return (
    <span className="inline-flex items-center gap-1 text-sm text-foreground">
      <Users className="h-3 w-3 text-muted-foreground" />
      {display}
    </span>
  );
}

// Legacy fallback for a record_reference field with no target object configured
// yet (created before that setting existed) and for user_reference, which has
// no search source to look up candidates from.
function RawIdInput({ value, onChange, placeholder, className }: FieldEditProps) {
  return (
    <input
      type="text"
      value={(value as string) || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || "Enter ID..."}
      className={className || "w-full px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"}
    />
  );
}

function RecordReferencePicker({ value, config, onChange, placeholder, className, workspaceId }: FieldEditProps) {
  const targetObjectId = config.target_object_id as string;
  const allowMultiple = !!config.allow_multiple;
  const selectedIds = useMemo<string[]>(() => {
    if (allowMultiple) return Array.isArray(value) ? value.map(String) : [];
    return value ? [String(value)] : [];
  }, [value, allowMultiple]);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const { records: candidates } = useCRMRecords(workspaceId ?? null, targetObjectId, { limit: 200 });

  // A previously selected record may not be in the capped candidate list above,
  // so resolve its real name directly rather than showing a raw id.
  const singleSelectedId = !allowMultiple ? selectedIds[0] : undefined;
  const { record: resolvedSelected } = useCRMRecord(workspaceId ?? null, singleSelectedId ?? null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = candidates.filter((r) => !selectedIds.includes(r.id));
    const matching = !q
      ? pool
      : pool.filter((r) => {
          if (r.display_name?.toLowerCase().includes(q)) return true;
          return Object.values(r.values || {}).some((v) => String(v).toLowerCase().includes(q));
        });
    return matching.slice(0, 50);
  }, [candidates, query, selectedIds]);

  const candidateById = useMemo(() => new Map(candidates.map((r) => [r.id, r])), [candidates]);
  const selectedRecords: (CRMRecord | undefined)[] = selectedIds.map(
    (id) => candidateById.get(id) || (resolvedSelected?.id === id ? resolvedSelected : undefined)
  );

  const pick = (recordId: string) => {
    if (allowMultiple) {
      onChange([...selectedIds, recordId]);
      setQuery("");
    } else {
      onChange(recordId);
      setIsOpen(false);
      setQuery("");
    }
  };

  const remove = (recordId: string) => {
    onChange(allowMultiple ? selectedIds.filter((id) => id !== recordId) : null);
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        className={
          className ||
          "w-full min-h-[2.25rem] px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground flex flex-wrap gap-1.5 items-center cursor-text focus-within:ring-2 focus-within:ring-purple-500/50"
        }
        onClick={() => setIsOpen(true)}
      >
        {selectedIds.map((id, i) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded text-xs"
          >
            {selectedRecords[i]?.display_name || id}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(id);
              }}
              className="hover:text-purple-100"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {(allowMultiple || selectedIds.length === 0) && (
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder={selectedIds.length === 0 ? placeholder || "Search…" : ""}
            className="flex-1 min-w-[80px] bg-transparent outline-none"
          />
        )}
      </div>
      {isOpen && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-background border border-border rounded-lg shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">No matching records</div>
          ) : (
            filtered.map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => pick(record.id)}
                className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent"
              >
                {record.display_name || record.id}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function ReferenceFieldEdit(props: FieldEditProps) {
  if (!props.workspaceId || !props.config.target_object_id) {
    return <RawIdInput {...props} />;
  }
  return <RecordReferencePicker {...props} />;
}
