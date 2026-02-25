import {
  Type,
  AlignLeft,
  Hash,
  DollarSign,
  Calendar,
  List,
  ListChecks,
  Mail,
  Phone,
  Link2,
  Star,
  ToggleLeft,
  Columns,
  Paperclip,
} from "lucide-react";
import type { CRMAttributeType } from "@/lib/api";

export interface FieldTypeOption {
  type: CRMAttributeType;
  label: string;
  icon: React.ReactNode;
  description: string;
}

export const FIELD_TYPE_OPTIONS: FieldTypeOption[] = [
  { type: "text", label: "Text", icon: <Type className="h-4 w-4" />, description: "Single line text" },
  { type: "textarea" as CRMAttributeType, label: "Long Text", icon: <AlignLeft className="h-4 w-4" />, description: "Multi-line text" },
  { type: "number", label: "Number", icon: <Hash className="h-4 w-4" />, description: "Numeric value" },
  { type: "currency", label: "Currency", icon: <DollarSign className="h-4 w-4" />, description: "Money amount" },
  { type: "date", label: "Date", icon: <Calendar className="h-4 w-4" />, description: "Date picker" },
  { type: "datetime", label: "Date & Time", icon: <Calendar className="h-4 w-4" />, description: "Date and time" },
  { type: "checkbox", label: "Checkbox", icon: <ToggleLeft className="h-4 w-4" />, description: "Yes / No toggle" },
  { type: "select", label: "Select", icon: <List className="h-4 w-4" />, description: "Single choice dropdown" },
  { type: "multi_select", label: "Multi Select", icon: <ListChecks className="h-4 w-4" />, description: "Multiple choices" },
  { type: "status", label: "Status", icon: <Columns className="h-4 w-4" />, description: "Status with kanban" },
  { type: "email", label: "Email", icon: <Mail className="h-4 w-4" />, description: "Email address" },
  { type: "phone", label: "Phone", icon: <Phone className="h-4 w-4" />, description: "Phone number" },
  { type: "url", label: "URL", icon: <Link2 className="h-4 w-4" />, description: "Web link" },
  { type: "rating", label: "Rating", icon: <Star className="h-4 w-4" />, description: "Star rating" },
  { type: "file" as CRMAttributeType, label: "File", icon: <Paperclip className="h-4 w-4" />, description: "File attachment URL" },
];

export function getFieldTypeOption(type: string): FieldTypeOption | undefined {
  return FIELD_TYPE_OPTIONS.find((ft) => ft.type === type);
}
