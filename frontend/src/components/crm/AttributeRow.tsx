"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Trash2,
  Edit2,
  MoreHorizontal,
  Type,
  Hash,
  DollarSign,
  Calendar,
  CheckSquare,
  List,
  Mail,
  Phone,
  Link,
  Users,
  Star,
  Calculator,
  Sparkles,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CRMAttribute, CRMAttributeType } from "@/lib/api";
import { RequiredBadge, UniqueBadge, SystemBadge, TypeBadge } from "./CRMBadge";
import { useState } from "react";

// Icons for each attribute type
const typeIcons: Record<CRMAttributeType, React.ReactNode> = {
  text: <Type className="h-4 w-4" />,
  number: <Hash className="h-4 w-4" />,
  currency: <DollarSign className="h-4 w-4" />,
  date: <Calendar className="h-4 w-4" />,
  datetime: <Calendar className="h-4 w-4" />,
  checkbox: <CheckSquare className="h-4 w-4" />,
  select: <List className="h-4 w-4" />,
  multi_select: <List className="h-4 w-4" />,
  status: <List className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  phone: <Phone className="h-4 w-4" />,
  url: <Link className="h-4 w-4" />,
  record_reference: <Database className="h-4 w-4" />,
  user_reference: <Users className="h-4 w-4" />,
  rating: <Star className="h-4 w-4" />,
  formula: <Calculator className="h-4 w-4" />,
  rollup: <Calculator className="h-4 w-4" />,
  ai_computed: <Sparkles className="h-4 w-4" />,
};

const typeLabels: Record<CRMAttributeType, string> = {
  text: "Text",
  number: "Number",
  currency: "Currency",
  date: "Date",
  datetime: "Date & Time",
  checkbox: "Checkbox",
  select: "Single Select",
  multi_select: "Multi Select",
  status: "Status",
  email: "Email",
  phone: "Phone",
  url: "URL",
  record_reference: "Record Reference",
  user_reference: "User Reference",
  rating: "Rating",
  formula: "Formula",
  rollup: "Rollup",
  ai_computed: "AI Computed",
};

interface AttributeRowProps {
  attribute: CRMAttribute;
  onEdit?: (attribute: CRMAttribute) => void;
  onDelete?: (attribute: CRMAttribute) => void;
  isDraggable?: boolean;
  className?: string;
}

export function AttributeRow({
  attribute,
  onEdit,
  onDelete,
  isDraggable = true,
  className,
}: AttributeRowProps) {
  const [showMenu, setShowMenu] = useState(false);

  const {
    attributes: dragAttributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: attribute.id,
    disabled: !isDraggable || attribute.is_system,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const icon = typeIcons[attribute.attribute_type] || typeIcons.text;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...dragAttributes}
      className={cn(
        "flex items-center gap-3 px-3 py-3 bg-slate-800/50 rounded-lg border border-slate-700/50",
        "hover:border-slate-600 transition-all group",
        isDragging && "opacity-50 shadow-lg",
        className
      )}
    >
      {/* Drag handle */}
      {isDraggable && !attribute.is_system && (
        <button
          {...listeners}
          className="p-1 cursor-grab text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      {(!isDraggable || attribute.is_system) && <div className="w-6" />}

      {/* Type icon */}
      <div className="p-2 bg-slate-700/50 rounded-lg text-slate-400">{icon}</div>

      {/* Name and description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white truncate">{attribute.name}</span>
          <span className="text-xs text-slate-500">{attribute.slug}</span>
        </div>
        {attribute.description && (
          <p className="text-xs text-slate-500 truncate">{attribute.description}</p>
        )}
      </div>

      {/* Type label */}
      <TypeBadge type={typeLabels[attribute.attribute_type] || attribute.attribute_type} />

      {/* Constraint badges */}
      <div className="flex items-center gap-1">
        {attribute.is_required && <RequiredBadge />}
        {attribute.is_unique && <UniqueBadge />}
        {attribute.is_system && <SystemBadge />}
      </div>

      {/* Actions */}
      {!attribute.is_system && (
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 opacity-0 group-hover:opacity-100 transition-all"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 py-1">
                <button
                  onClick={() => {
                    onEdit?.(attribute);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                >
                  <Edit2 className="h-4 w-4" />
                  Edit
                </button>
                <button
                  onClick={() => {
                    onDelete?.(attribute);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Compact version for smaller spaces
export function AttributeRowCompact({
  attribute,
  onDelete,
  className,
}: {
  attribute: CRMAttribute;
  onDelete?: (attribute: CRMAttribute) => void;
  className?: string;
}) {
  const icon = typeIcons[attribute.attribute_type] || typeIcons.text;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800/50 group",
        className
      )}
    >
      <div className="text-slate-500">{icon}</div>
      <span className="flex-1 text-sm text-white truncate">{attribute.name}</span>
      {attribute.is_required && (
        <span className="text-xs text-red-400">*</span>
      )}
      {attribute.is_system && (
        <span className="text-xs text-slate-500">System</span>
      )}
      {!attribute.is_system && onDelete && (
        <button
          onClick={() => onDelete(attribute)}
          className="p-1 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-all"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
