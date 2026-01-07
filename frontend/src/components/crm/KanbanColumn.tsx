"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { CRMRecord, CRMAttribute } from "@/lib/api";
import { KanbanCard, KanbanCardSkeleton } from "./KanbanCard";
import { ColorDot } from "./ColorPicker";

interface KanbanColumnProps {
  id: string;
  title: string;
  color: string;
  records: CRMRecord[];
  attributes?: CRMAttribute[];
  highlightAttributes?: string[];
  onRecordClick?: (record: CRMRecord) => void;
  onRecordMenuClick?: (record: CRMRecord, e: React.MouseEvent) => void;
  onCreateClick?: () => void;
  isLoading?: boolean;
  className?: string;
}

export function KanbanColumn({
  id,
  title,
  color,
  records,
  attributes = [],
  highlightAttributes = [],
  onRecordClick,
  onRecordMenuClick,
  onCreateClick,
  isLoading = false,
  className,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  // Calculate aggregate values (e.g., total deal value)
  const currencyAttr = attributes.find((a) => a.attribute_type === "currency");
  const totalValue = currencyAttr
    ? records.reduce((sum, r) => {
        const val = r.values[currencyAttr.slug];
        return sum + (typeof val === "number" ? val : 0);
      }, 0)
    : null;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 w-[300px] flex flex-col rounded-xl transition-all duration-200",
        "bg-slate-800/30",
        isOver && "ring-2 ring-purple-500/50 bg-purple-900/10",
        className
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-slate-700/30">
        <div className="flex items-center gap-2">
          <ColorDot color={color} size="md" />
          <h3 className="font-medium text-sm text-white">{title}</h3>
          <span className="px-1.5 py-0.5 bg-slate-700/50 rounded text-xs text-slate-400">
            {records.length}
          </span>
        </div>
        {totalValue !== null && totalValue > 0 && (
          <span className="text-xs text-green-400 font-medium">
            ${totalValue.toLocaleString()}
          </span>
        )}
      </div>

      {/* New record button */}
      {onCreateClick && (
        <button
          onClick={onCreateClick}
          className="flex items-center gap-2 mx-2 mt-2 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          New
        </button>
      )}

      {/* Cards */}
      <SortableContext
        items={records.map((r) => r.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex-1 p-2 space-y-2 min-h-[200px] overflow-y-auto">
          {isLoading ? (
            <>
              <KanbanCardSkeleton />
              <KanbanCardSkeleton />
            </>
          ) : (
            <AnimatePresence mode="popLayout">
              {records.map((record) => (
                <motion.div
                  key={record.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                >
                  <KanbanCard
                    record={record}
                    attributes={attributes}
                    highlightAttributes={highlightAttributes}
                    onClick={onRecordClick}
                    onMenuClick={onRecordMenuClick}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          )}

          {!isLoading && records.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">
              Drop records here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
