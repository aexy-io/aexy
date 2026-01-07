"use client";

import { cn } from "@/lib/utils";

interface CRMBadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "info" | "purple" | "system";
  size?: "sm" | "md";
  className?: string;
  color?: string; // Custom color override
}

const variantStyles: Record<string, string> = {
  default: "bg-slate-700/50 text-slate-300 border-slate-600/50",
  success: "bg-green-500/20 text-green-400 border-green-500/30",
  warning: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  error: "bg-red-500/20 text-red-400 border-red-500/30",
  info: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  purple: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  system: "bg-slate-600/50 text-slate-400 border-slate-500/50",
};

const sizeStyles: Record<string, string> = {
  sm: "px-1.5 py-0.5 text-xs",
  md: "px-2 py-1 text-sm",
};

export function CRMBadge({
  children,
  variant = "default",
  size = "sm",
  className,
  color,
}: CRMBadgeProps) {
  const colorStyle = color
    ? {
        backgroundColor: `${color}20`,
        color: color,
        borderColor: `${color}50`,
      }
    : undefined;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded border font-medium",
        !color && variantStyles[variant],
        sizeStyles[size],
        className
      )}
      style={colorStyle}
    >
      {children}
    </span>
  );
}

// Status badge with dot indicator
interface StatusBadgeProps {
  label: string;
  color?: string;
  size?: "sm" | "md";
  className?: string;
}

export function StatusBadge({ label, color = "#6366f1", size = "sm", className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border font-medium",
        sizeStyles[size],
        className
      )}
      style={{
        backgroundColor: `${color}20`,
        color: color,
        borderColor: `${color}50`,
      }}
    >
      <span
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

// Constraint badges for attributes
export function RequiredBadge({ className }: { className?: string }) {
  return (
    <CRMBadge variant="warning" size="sm" className={className}>
      Required
    </CRMBadge>
  );
}

export function UniqueBadge({ className }: { className?: string }) {
  return (
    <CRMBadge variant="info" size="sm" className={className}>
      Unique
    </CRMBadge>
  );
}

export function SystemBadge({ className }: { className?: string }) {
  return (
    <CRMBadge variant="system" size="sm" className={className}>
      System
    </CRMBadge>
  );
}

// Type badge for attribute types
const typeColors: Record<string, string> = {
  text: "#64748b",
  number: "#3b82f6",
  currency: "#10b981",
  date: "#8b5cf6",
  datetime: "#8b5cf6",
  checkbox: "#f59e0b",
  select: "#ec4899",
  multi_select: "#ec4899",
  status: "#6366f1",
  email: "#06b6d4",
  phone: "#14b8a6",
  url: "#0ea5e9",
  rating: "#f59e0b",
  record_reference: "#a855f7",
  user_reference: "#22c55e",
};

export function TypeBadge({ type, className }: { type: string; className?: string }) {
  const color = typeColors[type] || "#64748b";
  const label = type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <CRMBadge color={color} size="sm" className={className}>
      {label}
    </CRMBadge>
  );
}
