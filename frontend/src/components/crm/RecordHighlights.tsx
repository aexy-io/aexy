"use client";

import {
  Mail,
  Phone,
  Globe,
  Building2,
  MapPin,
  DollarSign,
  Calendar,
  User,
  Hash,
  Link,
  Briefcase,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CRMRecord, CRMAttribute } from "@/lib/api";
import { StatusBadge } from "./CRMBadge";

interface HighlightCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  href?: string;
  className?: string;
}

function HighlightCard({ icon, label, value, href, className }: HighlightCardProps) {
  const content = (
    <div
      className={cn(
        "bg-muted/50 border border-border rounded-xl p-4 hover:border-border transition-colors",
        href && "cursor-pointer",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 bg-accent/50 rounded-lg text-muted-foreground">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
          <div className="text-sm text-foreground truncate">{value}</div>
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block">
        {content}
      </a>
    );
  }

  return content;
}

interface RecordHighlightsProps {
  record: CRMRecord;
  attributes: CRMAttribute[];
  highlightAttributes?: string[]; // Attribute slugs to highlight
  maxCards?: number;
  className?: string;
}

// Get icon for attribute type
function getAttributeIcon(type: string, slug: string) {
  // Check slug for common patterns first
  if (slug.includes("email")) return <Mail className="h-4 w-4" />;
  if (slug.includes("phone")) return <Phone className="h-4 w-4" />;
  if (slug.includes("company") || slug.includes("organization")) return <Building2 className="h-4 w-4" />;
  if (slug.includes("website") || slug.includes("url")) return <Globe className="h-4 w-4" />;
  if (slug.includes("address") || slug.includes("location")) return <MapPin className="h-4 w-4" />;
  if (slug.includes("title") || slug.includes("role") || slug.includes("position")) return <Briefcase className="h-4 w-4" />;

  // Fall back to type-based icons
  switch (type) {
    case "email":
      return <Mail className="h-4 w-4" />;
    case "phone":
      return <Phone className="h-4 w-4" />;
    case "url":
      return <Globe className="h-4 w-4" />;
    case "currency":
      return <DollarSign className="h-4 w-4" />;
    case "date":
    case "datetime":
      return <Calendar className="h-4 w-4" />;
    case "number":
      return <Hash className="h-4 w-4" />;
    case "checkbox":
      return <CheckCircle2 className="h-4 w-4" />;
    case "select":
    case "status":
      return <Hash className="h-4 w-4" />;
    default:
      return <Hash className="h-4 w-4" />;
  }
}

// Format value for display
function formatValue(value: unknown, attribute: CRMAttribute): React.ReactNode {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">Not set</span>;
  }

  switch (attribute.attribute_type) {
    case "currency":
      return (
        <span className="text-green-400 font-medium">
          ${typeof value === "number" ? value.toLocaleString() : String(value)}
        </span>
      );
    case "checkbox":
      return value ? "Yes" : "No";
    case "status":
    case "select": {
      const config = attribute.config as { options?: { value: string; label: string; color?: string }[] } | undefined;
      const option = config?.options?.find((o) => o.value === value);
      if (option) {
        return <StatusBadge label={option.label} color={option.color || "#6366f1"} />;
      }
      return String(value);
    }
    case "date":
    case "datetime":
      return new Date(String(value)).toLocaleDateString();
    default:
      return String(value);
  }
}

// Get href for clickable values
function getValueHref(value: unknown, attribute: CRMAttribute): string | undefined {
  if (!value) return undefined;

  switch (attribute.attribute_type) {
    case "email":
      return `mailto:${value}`;
    case "phone":
      return `tel:${value}`;
    case "url":
      return String(value);
    default:
      return undefined;
  }
}

export function RecordHighlights({
  record,
  attributes,
  highlightAttributes,
  maxCards = 6,
  className,
}: RecordHighlightsProps) {
  // Determine which attributes to show
  let attrsToShow: CRMAttribute[] = [];

  if (highlightAttributes && highlightAttributes.length > 0) {
    // Use explicit highlight list
    attrsToShow = highlightAttributes
      .map((slug) => attributes.find((a) => a.slug === slug))
      .filter((a): a is CRMAttribute => a !== undefined);
  } else {
    // Auto-select important attributes based on type and if they have values
    const priorityTypes = ["email", "phone", "url", "currency", "status", "select"];
    const importantAttrs = attributes.filter(
      (a) =>
        !a.is_system &&
        record.values[a.slug] !== null &&
        record.values[a.slug] !== undefined &&
        record.values[a.slug] !== ""
    );

    // Sort by priority: specific types first, then by order
    attrsToShow = importantAttrs.sort((a, b) => {
      const aIndex = priorityTypes.indexOf(a.attribute_type);
      const bIndex = priorityTypes.indexOf(b.attribute_type);
      if (aIndex !== -1 && bIndex === -1) return -1;
      if (aIndex === -1 && bIndex !== -1) return 1;
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      return 0;
    });
  }

  // Limit to max cards
  attrsToShow = attrsToShow.slice(0, maxCards);

  // Don't render if no attributes to show
  if (attrsToShow.length === 0) {
    return null;
  }

  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-3 gap-3", className)}>
      {attrsToShow.map((attr) => {
        const value = record.values[attr.slug];
        return (
          <HighlightCard
            key={attr.slug}
            icon={getAttributeIcon(attr.attribute_type, attr.slug)}
            label={attr.name}
            value={formatValue(value, attr)}
            href={getValueHref(value, attr)}
          />
        );
      })}
    </div>
  );
}

// Compact version for sidebar or smaller spaces
export function RecordHighlightsCompact({
  record,
  attributes,
  className,
}: {
  record: CRMRecord;
  attributes: CRMAttribute[];
  className?: string;
}) {
  const attrsWithValues = attributes.filter(
    (a) =>
      !a.is_system &&
      record.values[a.slug] !== null &&
      record.values[a.slug] !== undefined &&
      record.values[a.slug] !== ""
  );

  return (
    <div className={cn("space-y-3", className)}>
      {attrsWithValues.map((attr) => {
        const value = record.values[attr.slug];
        const href = getValueHref(value, attr);
        const formattedValue = formatValue(value, attr);

        return (
          <div key={attr.slug} className="flex items-start gap-3">
            <div className="text-muted-foreground mt-0.5">
              {getAttributeIcon(attr.attribute_type, attr.slug)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground mb-0.5">{attr.name}</p>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-400 hover:underline truncate block"
                >
                  {formattedValue}
                </a>
              ) : (
                <div className="text-sm text-foreground truncate">{formattedValue}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
