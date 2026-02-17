"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ChevronLeft,
  FileText,
  Save,
  Settings,
  Eye,
  ExternalLink,
  Copy,
  Ticket,
  Users,
  DollarSign,
  Zap,
  Plus,
  Trash2,
  GripVertical,
  CheckCircle,
  XCircle,
  Link2,
  Unlink,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  Palette,
  PartyPopper,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  useForm,
  useFormTicketConfig,
  useFormCRMMapping,
  useFormDealConfig,
  useFormAutomations,
  useFormSubmissions,
} from "@/hooks/useForms";
import { useCRMObjects, useCRMAutomations, useCRMAttributes } from "@/hooks/useCRM";
import { useTeams } from "@/hooks/useTeams";
import type {
  FormField,
  FormFieldType,
  TicketAssignmentMode,
  FormSubmissionListItem,
  ValidationType,
  ValidationRules,
} from "@/lib/formsApi";
import { VALIDATION_PRESETS } from "@/lib/formsApi";
import { ThemeBuilderTab } from "@/components/forms/theme";
import { ThankYouPageEditor } from "@/components/forms/thank-you";
import { normalizeTheme, getDefaultThankYouPage } from "@/lib/formThemeTypes";
import { normalizeThankYouPage } from "@/lib/formThemeUtils";

type TabType = "fields" | "appearance" | "thank-you" | "ticketing" | "crm" | "deals" | "automations" | "submissions" | "settings";

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Text Area" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "number", label: "Number" },
  { value: "url", label: "URL" },
  { value: "select", label: "Select" },
  { value: "multiselect", label: "Multi-Select" },
  { value: "checkbox", label: "Checkbox" },
  { value: "radio", label: "Radio" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & Time" },
  { value: "file", label: "File Upload" },
  { value: "hidden", label: "Hidden" },
];

const ASSIGNMENT_MODES: { value: TicketAssignmentMode; label: string; description: string }[] = [
  { value: "none", label: "No Assignment", description: "Tickets will be unassigned" },
  { value: "oncall", label: "On-Call Engineer", description: "Assign to current on-call person" },
  { value: "round_robin", label: "Round Robin", description: "Distribute evenly across team" },
  { value: "specific_user", label: "Specific User", description: "Always assign to one person" },
];

// Field Editor Component
function FieldEditor({
  field,
  onUpdate,
  onDelete,
  isExpanded,
  onToggleExpand,
}: {
  field: FormField;
  onUpdate: (data: Partial<FormField>) => void;
  onDelete: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const [localField, setLocalField] = useState(field);

  useEffect(() => {
    setLocalField(field);
  }, [field]);

  const handleSave = () => {
    onUpdate(localField);
  };

  return (
    <div className="bg-muted/50 border border-border rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-accent/50 transition"
        onClick={onToggleExpand}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{localField.name}</span>
            <span className="text-xs text-muted-foreground bg-accent px-2 py-0.5 rounded">
              {localField.field_type}
            </span>
            {localField.is_required && (
              <span className="text-xs text-red-400">Required</span>
            )}
          </div>
          <span className="text-sm text-muted-foreground">{localField.field_key}</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-2 text-muted-foreground hover:text-red-400 transition"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {isExpanded && (
        <div className="p-4 border-t border-border space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Field Name</label>
              <input
                type="text"
                value={localField.name}
                onChange={(e) => setLocalField({ ...localField, name: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Field Key</label>
              <input
                type="text"
                value={localField.field_key}
                onChange={(e) => setLocalField({ ...localField, field_key: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Field Type</label>
              <select
                value={localField.field_type}
                onChange={(e) =>
                  setLocalField({ ...localField, field_type: e.target.value as FormFieldType })
                }
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
              >
                {FIELD_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Width</label>
              <select
                value={localField.width}
                onChange={(e) =>
                  setLocalField({
                    ...localField,
                    width: e.target.value as "full" | "half" | "third" | "two-thirds",
                  })
                }
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
              >
                <option value="full">Full Width</option>
                <option value="half">Half Width</option>
                <option value="third">Third Width</option>
                <option value="two-thirds">Two Thirds</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Placeholder</label>
            <input
              type="text"
              value={localField.placeholder || ""}
              onChange={(e) => setLocalField({ ...localField, placeholder: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Help Text</label>
            <input
              type="text"
              value={localField.help_text || ""}
              onChange={(e) => setLocalField({ ...localField, help_text: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
            />
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={localField.is_required}
                onChange={(e) => setLocalField({ ...localField, is_required: e.target.checked })}
                className="rounded border-border bg-muted text-purple-500 focus:ring-purple-500"
              />
              Required
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={localField.is_visible}
                onChange={(e) => setLocalField({ ...localField, is_visible: e.target.checked })}
                className="rounded border-border bg-muted text-purple-500 focus:ring-purple-500"
              />
              Visible
            </label>
          </div>

          {/* Validation Rules Section */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="h-4 w-4 text-purple-400" />
              <span className="text-sm font-medium text-foreground">Validation Rules</span>
            </div>

            <div className="space-y-4">
              {/* Validation Type Preset */}
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Validation Type</label>
                <select
                  value={localField.validation_rules?.validation_type || ""}
                  onChange={(e) => {
                    const validationType = e.target.value as ValidationType | "";
                    const preset = validationType ? VALIDATION_PRESETS[validationType] : null;
                    setLocalField({
                      ...localField,
                      validation_rules: {
                        ...localField.validation_rules,
                        validation_type: validationType || undefined,
                        pattern: validationType === "custom" ? localField.validation_rules?.pattern : preset?.pattern,
                        pattern_message: validationType === "custom" ? localField.validation_rules?.pattern_message : preset?.message,
                      },
                    });
                  }}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
                >
                  <option value="">None</option>
                  {Object.entries(VALIDATION_PRESETS).map(([key, preset]) => (
                    <option key={key} value={key}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Custom Pattern (only for custom validation type) */}
              {localField.validation_rules?.validation_type === "custom" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Regex Pattern</label>
                    <input
                      type="text"
                      value={localField.validation_rules?.pattern || ""}
                      onChange={(e) => setLocalField({
                        ...localField,
                        validation_rules: { ...localField.validation_rules, pattern: e.target.value },
                      })}
                      placeholder="^[a-z]+$"
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Error Message</label>
                    <input
                      type="text"
                      value={localField.validation_rules?.pattern_message || ""}
                      onChange={(e) => setLocalField({
                        ...localField,
                        validation_rules: { ...localField.validation_rules, pattern_message: e.target.value },
                      })}
                      placeholder="Invalid format"
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Length Constraints (for text fields) */}
              {["text", "textarea", "email", "phone", "url"].includes(localField.field_type) && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Min Length</label>
                    <input
                      type="number"
                      value={localField.validation_rules?.min_length || ""}
                      onChange={(e) => setLocalField({
                        ...localField,
                        validation_rules: {
                          ...localField.validation_rules,
                          min_length: e.target.value ? parseInt(e.target.value) : undefined,
                        },
                      })}
                      min={0}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Max Length</label>
                    <input
                      type="number"
                      value={localField.validation_rules?.max_length || ""}
                      onChange={(e) => setLocalField({
                        ...localField,
                        validation_rules: {
                          ...localField.validation_rules,
                          max_length: e.target.value ? parseInt(e.target.value) : undefined,
                        },
                      })}
                      min={0}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Number Constraints */}
              {localField.field_type === "number" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Minimum Value</label>
                    <input
                      type="number"
                      value={localField.validation_rules?.min ?? ""}
                      onChange={(e) => setLocalField({
                        ...localField,
                        validation_rules: {
                          ...localField.validation_rules,
                          min: e.target.value ? parseFloat(e.target.value) : undefined,
                        },
                      })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Maximum Value</label>
                    <input
                      type="number"
                      value={localField.validation_rules?.max ?? ""}
                      onChange={(e) => setLocalField({
                        ...localField,
                        validation_rules: {
                          ...localField.validation_rules,
                          max: e.target.value ? parseFloat(e.target.value) : undefined,
                        },
                      })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Date Constraints */}
              {["date", "datetime"].includes(localField.field_type) && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Min Date</label>
                    <input
                      type="date"
                      value={localField.validation_rules?.min_date || ""}
                      onChange={(e) => setLocalField({
                        ...localField,
                        validation_rules: {
                          ...localField.validation_rules,
                          min_date: e.target.value || undefined,
                        },
                      })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Max Date</label>
                    <input
                      type="date"
                      value={localField.validation_rules?.max_date || ""}
                      onChange={(e) => setLocalField({
                        ...localField,
                        validation_rules: {
                          ...localField.validation_rules,
                          max_date: e.target.value || undefined,
                        },
                      })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
                    />
                  </div>
                </div>
              )}

              {/* File Constraints */}
              {localField.field_type === "file" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Allowed File Types</label>
                    <input
                      type="text"
                      value={localField.validation_rules?.allowed_file_types?.join(", ") || ""}
                      onChange={(e) => setLocalField({
                        ...localField,
                        validation_rules: {
                          ...localField.validation_rules,
                          allowed_file_types: e.target.value ? e.target.value.split(",").map(s => s.trim()) : undefined,
                        },
                      })}
                      placeholder=".pdf, .doc, .docx"
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Max File Size (MB)</label>
                    <input
                      type="number"
                      value={localField.validation_rules?.max_file_size_mb || ""}
                      onChange={(e) => setLocalField({
                        ...localField,
                        validation_rules: {
                          ...localField.validation_rules,
                          max_file_size_mb: e.target.value ? parseInt(e.target.value) : undefined,
                        },
                      })}
                      min={1}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Custom Error Message */}
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Custom Error Message (optional)</label>
                <input
                  type="text"
                  value={localField.validation_rules?.custom_message || ""}
                  onChange={(e) => setLocalField({
                    ...localField,
                    validation_rules: {
                      ...localField.validation_rules,
                      custom_message: e.target.value || undefined,
                    },
                  })}
                  placeholder="Please enter a valid value"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition text-sm"
            >
              Save Field
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Ticket fields that can be mapped
const TICKET_FIELDS = [
  { key: "title", name: "Title", description: "Ticket title/subject" },
  { key: "description", name: "Description", description: "Ticket description/details" },
  { key: "priority", name: "Priority", description: "Ticket priority level" },
  { key: "submitter_email", name: "Submitter Email", description: "Contact email" },
  { key: "submitter_name", name: "Submitter Name", description: "Contact name" },
  { key: "tags", name: "Tags", description: "Ticket tags/labels" },
];

// Ticketing Configuration Tab
function TicketingTab({
  workspaceId,
  formId,
  formFields,
}: {
  workspaceId: string;
  formId: string;
  formFields: FormField[];
}) {
  const { config, isLoading, configure, disable, isConfiguring } = useFormTicketConfig(
    workspaceId,
    formId
  );
  const { teams } = useTeams(workspaceId);

  const [localConfig, setLocalConfig] = useState({
    auto_create_ticket: false,
    default_team_id: "",
    ticket_assignment_mode: "none" as TicketAssignmentMode,
    ticket_field_mappings: {} as Record<string, string>,
  });

  useEffect(() => {
    if (config) {
      setLocalConfig({
        auto_create_ticket: config.auto_create_ticket,
        default_team_id: config.default_team_id || "",
        ticket_assignment_mode: config.ticket_assignment_mode,
        ticket_field_mappings: config.ticket_field_mappings || {},
      });
    }
  }, [config]);

  const handleSave = async () => {
    await configure(localConfig);
  };

  const handleDisable = async () => {
    await disable();
    setLocalConfig({
      auto_create_ticket: false,
      default_team_id: "",
      ticket_assignment_mode: "none",
      ticket_field_mappings: {},
    });
  };

  const updateFieldMapping = (formFieldKey: string, ticketField: string) => {
    setLocalConfig({
      ...localConfig,
      ticket_field_mappings: {
        ...localConfig.ticket_field_mappings,
        [formFieldKey]: ticketField,
      },
    });
  };

  const removeFieldMapping = (formFieldKey: string) => {
    const newMappings = { ...localConfig.ticket_field_mappings };
    delete newMappings[formFieldKey];
    setLocalConfig({
      ...localConfig,
      ticket_field_mappings: newMappings,
    });
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Loading ticket configuration...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-muted/50 border border-border rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Ticket className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-foreground font-medium">Ticketing Integration</h3>
              <p className="text-sm text-muted-foreground">Automatically create tickets from submissions</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={localConfig.auto_create_ticket}
              onChange={(e) =>
                setLocalConfig({ ...localConfig, auto_create_ticket: e.target.checked })
              }
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-accent peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
          </label>
        </div>

        {localConfig.auto_create_ticket && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Default Team</label>
              <select
                value={localConfig.default_team_id}
                onChange={(e) => setLocalConfig({ ...localConfig, default_team_id: e.target.value })}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground"
              >
                <option value="">Select a team</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Assignment Mode</label>
              <div className="grid grid-cols-2 gap-3">
                {ASSIGNMENT_MODES.map((mode) => (
                  <button
                    key={mode.value}
                    onClick={() =>
                      setLocalConfig({ ...localConfig, ticket_assignment_mode: mode.value })
                    }
                    className={`p-4 rounded-lg border text-left transition ${
                      localConfig.ticket_assignment_mode === mode.value
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-border bg-muted hover:border-border"
                    }`}
                  >
                    <div className="text-sm font-medium text-foreground">{mode.label}</div>
                    <div className="text-xs text-muted-foreground">{mode.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Field Mappings */}
            {formFields.length > 0 && (
              <div className="border-t border-border pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Link2 className="h-4 w-4 text-blue-400" />
                  <h4 className="text-sm font-medium text-foreground">Field Mappings</h4>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Map form fields to ticket fields. Mapped fields will populate the ticket automatically.
                </p>

                <div className="space-y-3">
                  {formFields.filter(f => f.is_visible).map((field) => (
                    <div
                      key={field.id}
                      className="flex items-center gap-3 p-3 bg-background/50 rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="text-sm text-foreground">{field.name}</div>
                        <div className="text-xs text-muted-foreground">{field.field_key}</div>
                      </div>
                      <div className="text-muted-foreground">→</div>
                      <div className="flex-1">
                        <select
                          value={localConfig.ticket_field_mappings[field.field_key] || ""}
                          onChange={(e) => {
                            if (e.target.value) {
                              updateFieldMapping(field.field_key, e.target.value);
                            } else {
                              removeFieldMapping(field.field_key);
                            }
                          }}
                          className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm"
                        >
                          <option value="">Don't map</option>
                          {TICKET_FIELDS.map((ticketField) => (
                            <option key={ticketField.key} value={ticketField.key}>
                              {ticketField.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 text-xs text-muted-foreground">
                  {Object.keys(localConfig.ticket_field_mappings).length} of {formFields.filter(f => f.is_visible).length} fields mapped
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              {config?.auto_create_ticket && (
                <button
                  onClick={handleDisable}
                  className="px-4 py-2 text-red-400 hover:text-red-300 transition"
                >
                  Disable Ticketing
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={isConfiguring}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
              >
                {isConfiguring ? "Saving..." : "Save Configuration"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// CRM Mapping Tab
function CRMTab({
  workspaceId,
  formId,
  formFields,
}: {
  workspaceId: string;
  formId: string;
  formFields: FormField[];
}) {
  const { mapping, isLoading, configure, remove, isConfiguring } = useFormCRMMapping(
    workspaceId,
    formId
  );
  const { objects } = useCRMObjects(workspaceId);

  const [localMapping, setLocalMapping] = useState({
    auto_create_record: false,
    crm_object_id: "",
    crm_field_mappings: {} as Record<string, string>,
  });

  // Get attributes for selected CRM object
  const { attributes } = useCRMAttributes(
    workspaceId,
    localMapping.crm_object_id || null
  );

  useEffect(() => {
    if (mapping) {
      setLocalMapping({
        auto_create_record: mapping.auto_create_record,
        crm_object_id: mapping.crm_object_id || "",
        crm_field_mappings: mapping.crm_field_mappings || {},
      });
    }
  }, [mapping]);

  const handleSave = async () => {
    await configure(localMapping);
  };

  const handleRemove = async () => {
    await remove();
    setLocalMapping({
      auto_create_record: false,
      crm_object_id: "",
      crm_field_mappings: {},
    });
  };

  const updateFieldMapping = (formFieldKey: string, crmAttributeSlug: string) => {
    setLocalMapping({
      ...localMapping,
      crm_field_mappings: {
        ...localMapping.crm_field_mappings,
        [formFieldKey]: crmAttributeSlug,
      },
    });
  };

  const removeFieldMapping = (formFieldKey: string) => {
    const newMappings = { ...localMapping.crm_field_mappings };
    delete newMappings[formFieldKey];
    setLocalMapping({
      ...localMapping,
      crm_field_mappings: newMappings,
    });
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Loading CRM configuration...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-muted/50 border border-border rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <Users className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <h3 className="text-foreground font-medium">CRM Integration</h3>
              <p className="text-sm text-muted-foreground">Create CRM records from submissions</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={localMapping.auto_create_record}
              onChange={(e) =>
                setLocalMapping({ ...localMapping, auto_create_record: e.target.checked })
              }
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-accent peer-focus:ring-2 peer-focus:ring-green-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
          </label>
        </div>

        {localMapping.auto_create_record && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">CRM Object</label>
              <select
                value={localMapping.crm_object_id}
                onChange={(e) =>
                  setLocalMapping({
                    ...localMapping,
                    crm_object_id: e.target.value,
                    crm_field_mappings: {}, // Reset mappings when object changes
                  })
                }
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground"
              >
                <option value="">Select a CRM object</option>
                {objects.map((obj) => (
                  <option key={obj.id} value={obj.id}>
                    {obj.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Field Mappings */}
            {localMapping.crm_object_id && formFields.length > 0 && (
              <div className="border-t border-border pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Link2 className="h-4 w-4 text-green-400" />
                  <h4 className="text-sm font-medium text-foreground">Field Mappings</h4>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Map form fields to CRM attributes. Unmapped fields will not be synced.
                </p>

                <div className="space-y-3">
                  {formFields.filter(f => f.is_visible).map((field) => (
                    <div
                      key={field.id}
                      className="flex items-center gap-3 p-3 bg-background/50 rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="text-sm text-foreground">{field.name}</div>
                        <div className="text-xs text-muted-foreground">{field.field_key}</div>
                      </div>
                      <div className="text-muted-foreground">→</div>
                      <div className="flex-1">
                        <select
                          value={localMapping.crm_field_mappings[field.field_key] || ""}
                          onChange={(e) => {
                            if (e.target.value) {
                              updateFieldMapping(field.field_key, e.target.value);
                            } else {
                              removeFieldMapping(field.field_key);
                            }
                          }}
                          className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm"
                        >
                          <option value="">Don't map</option>
                          {attributes.map((attr) => (
                            <option key={attr.id} value={attr.slug}>
                              {attr.name} ({attr.attribute_type})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Quick mapping stats */}
                <div className="mt-4 text-xs text-muted-foreground">
                  {Object.keys(localMapping.crm_field_mappings).length} of {formFields.filter(f => f.is_visible).length} fields mapped
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              {mapping?.auto_create_record && (
                <button
                  onClick={handleRemove}
                  className="px-4 py-2 text-red-400 hover:text-red-300 transition"
                >
                  Remove CRM Mapping
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={isConfiguring || !localMapping.crm_object_id}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition disabled:opacity-50"
              >
                {isConfiguring ? "Saving..." : "Save Configuration"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Deal fields that can be mapped
const DEAL_FIELDS = [
  { key: "name", name: "Deal Name", description: "Name of the deal" },
  { key: "value", name: "Deal Value", description: "Monetary value of the deal" },
  { key: "currency", name: "Currency", description: "Currency code (e.g., USD)" },
  { key: "contact_email", name: "Contact Email", description: "Primary contact email" },
  { key: "contact_name", name: "Contact Name", description: "Primary contact name" },
  { key: "company_name", name: "Company Name", description: "Company or organization name" },
  { key: "expected_close_date", name: "Expected Close Date", description: "When the deal is expected to close" },
  { key: "notes", name: "Notes", description: "Additional notes or details" },
];

// Deals Tab
function DealsTab({
  workspaceId,
  formId,
  formFields,
}: {
  workspaceId: string;
  formId: string;
  formFields: FormField[];
}) {
  const { config, isLoading, configure, disable, isConfiguring } = useFormDealConfig(
    workspaceId,
    formId
  );

  const [localConfig, setLocalConfig] = useState({
    auto_create_deal: false,
    deal_pipeline_id: "",
    deal_stage_id: "",
    link_deal_to_record: true,
    deal_field_mappings: {} as Record<string, string>,
  });

  useEffect(() => {
    if (config) {
      setLocalConfig({
        auto_create_deal: config.auto_create_deal,
        deal_pipeline_id: config.deal_pipeline_id || "",
        deal_stage_id: config.deal_stage_id || "",
        link_deal_to_record: config.link_deal_to_record,
        deal_field_mappings: config.deal_field_mappings || {},
      });
    }
  }, [config]);

  const handleSave = async () => {
    await configure(localConfig);
  };

  const handleDisable = async () => {
    await disable();
    setLocalConfig({
      auto_create_deal: false,
      deal_pipeline_id: "",
      deal_stage_id: "",
      link_deal_to_record: true,
      deal_field_mappings: {},
    });
  };

  const updateFieldMapping = (formFieldKey: string, dealField: string) => {
    setLocalConfig({
      ...localConfig,
      deal_field_mappings: {
        ...localConfig.deal_field_mappings,
        [formFieldKey]: dealField,
      },
    });
  };

  const removeFieldMapping = (formFieldKey: string) => {
    const newMappings = { ...localConfig.deal_field_mappings };
    delete newMappings[formFieldKey];
    setLocalConfig({
      ...localConfig,
      deal_field_mappings: newMappings,
    });
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Loading deal configuration...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-muted/50 border border-border rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/20">
              <DollarSign className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <h3 className="text-foreground font-medium">Deal Integration</h3>
              <p className="text-sm text-muted-foreground">Create deals from submissions</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={localConfig.auto_create_deal}
              onChange={(e) =>
                setLocalConfig({ ...localConfig, auto_create_deal: e.target.checked })
              }
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-accent peer-focus:ring-2 peer-focus:ring-orange-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
          </label>
        </div>

        {localConfig.auto_create_deal && (
          <div className="space-y-6">
            <div className="p-4 bg-background/50 rounded-lg border border-border">
              <p className="text-sm text-muted-foreground">
                Configure pipeline and stage selection in the CRM settings. Deals will be created
                and linked to the CRM record if CRM integration is enabled.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={localConfig.link_deal_to_record}
                onChange={(e) =>
                  setLocalConfig({ ...localConfig, link_deal_to_record: e.target.checked })
                }
                className="rounded border-border bg-muted text-orange-500 focus:ring-orange-500"
              />
              Link deal to CRM record
            </label>

            {/* Field Mappings */}
            {formFields.length > 0 && (
              <div className="border-t border-border pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Link2 className="h-4 w-4 text-orange-400" />
                  <h4 className="text-sm font-medium text-foreground">Field Mappings</h4>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Map form fields to deal attributes. Mapped fields will populate the deal automatically.
                </p>

                <div className="space-y-3">
                  {formFields.filter(f => f.is_visible).map((field) => (
                    <div
                      key={field.id}
                      className="flex items-center gap-3 p-3 bg-background/50 rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="text-sm text-foreground">{field.name}</div>
                        <div className="text-xs text-muted-foreground">{field.field_key}</div>
                      </div>
                      <div className="text-muted-foreground">→</div>
                      <div className="flex-1">
                        <select
                          value={localConfig.deal_field_mappings[field.field_key] || ""}
                          onChange={(e) => {
                            if (e.target.value) {
                              updateFieldMapping(field.field_key, e.target.value);
                            } else {
                              removeFieldMapping(field.field_key);
                            }
                          }}
                          className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground text-sm"
                        >
                          <option value="">Don't map</option>
                          {DEAL_FIELDS.map((dealField) => (
                            <option key={dealField.key} value={dealField.key}>
                              {dealField.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 text-xs text-muted-foreground">
                  {Object.keys(localConfig.deal_field_mappings).length} of {formFields.filter(f => f.is_visible).length} fields mapped
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              {config?.auto_create_deal && (
                <button
                  onClick={handleDisable}
                  className="px-4 py-2 text-red-400 hover:text-red-300 transition"
                >
                  Disable Deal Creation
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={isConfiguring}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition disabled:opacity-50"
              >
                {isConfiguring ? "Saving..." : "Save Configuration"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Automations Tab
function AutomationsTab({
  workspaceId,
  formId,
}: {
  workspaceId: string;
  formId: string;
}) {
  const {
    automations: linkedAutomations,
    isLoading,
    linkAutomation,
    unlinkAutomation,
    isLinking,
  } = useFormAutomations(workspaceId, formId);
  const { automations: allAutomations } = useCRMAutomations(workspaceId);

  const linkedIds = new Set(linkedAutomations.map((a) => a.automation_id));
  const availableAutomations = allAutomations.filter((a) => !linkedIds.has(a.id));

  const handleLink = async (automationId: string) => {
    await linkAutomation({ automation_id: automationId });
  };

  const handleUnlink = async (automationId: string) => {
    await unlinkAutomation(automationId);
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Loading automations...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-muted/50 border border-border rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <Zap className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-foreground font-medium">Linked Automations</h3>
            <p className="text-sm text-muted-foreground">
              Automations that trigger when this form is submitted
            </p>
          </div>
        </div>

        {linkedAutomations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No automations linked yet. Link an automation below.
          </div>
        ) : (
          <div className="space-y-3">
            {linkedAutomations.map((link) => (
              <div
                key={link.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-background/50 rounded-lg border border-border"
              >
                <div className="flex items-center gap-3">
                  <Link2 className="h-4 w-4 text-purple-400" />
                  <span className="text-foreground">{link.automation_name || link.automation_id}</span>
                  {link.is_active ? (
                    <span className="text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded">
                      Active
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground bg-accent px-2 py-0.5 rounded">
                      Inactive
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleUnlink(link.automation_id)}
                  className="text-muted-foreground hover:text-red-400 transition"
                >
                  <Unlink className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {availableAutomations.length > 0 && (
        <div className="bg-muted/50 border border-border rounded-xl p-6">
          <h3 className="text-foreground font-medium mb-4">Available Automations</h3>
          <div className="space-y-3">
            {availableAutomations.map((automation) => (
              <div
                key={automation.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-background/50 rounded-lg border border-border"
              >
                <div>
                  <span className="text-foreground">{automation.name}</span>
                  <p className="text-sm text-muted-foreground">{automation.trigger_type}</p>
                </div>
                <button
                  onClick={() => handleLink(automation.id)}
                  disabled={isLinking}
                  className="px-3 py-1 text-sm bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition disabled:opacity-50"
                >
                  Link
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Submissions Tab
function SubmissionsTab({
  workspaceId,
  formId,
}: {
  workspaceId: string;
  formId: string;
}) {
  const { submissions, isLoading, refetch } = useFormSubmissions(workspaceId, formId);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-900/30 text-green-400";
      case "pending":
        return "bg-yellow-900/30 text-yellow-400";
      case "processing":
        return "bg-blue-900/30 text-blue-400";
      case "failed":
        return "bg-red-900/30 text-red-400";
      default:
        return "bg-accent text-muted-foreground";
    }
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Loading submissions...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="text-foreground font-medium">Submissions ({submissions.length})</h3>
        <button
          onClick={() => refetch()}
          className="text-sm text-muted-foreground hover:text-foreground transition"
        >
          Refresh
        </button>
      </div>

      {submissions.length === 0 ? (
        <div className="text-center py-16 bg-muted/50 border border-border rounded-xl">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No submissions yet</h3>
          <p className="text-muted-foreground">Share your form to start collecting responses</p>
        </div>
      ) : (
        <div className="bg-muted/50 border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-background/50">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Email</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Created</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {submissions.map((submission) => (
                <tr key={submission.id} className="hover:bg-accent/30 transition">
                  <td className="px-4 py-3 text-foreground">{submission.email || "-"}</td>
                  <td className="px-4 py-3 text-foreground">{submission.name || "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(submission.status)}`}>
                      {submission.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {formatDate(submission.submitted_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {submission.ticket_id && (
                        <span className="text-xs text-blue-400">
                          TKT-{submission.ticket_number}
                        </span>
                      )}
                      {submission.crm_record_id && (
                        <span className="text-xs text-green-400">CRM</span>
                      )}
                      {submission.deal_id && (
                        <span className="text-xs text-orange-400">Deal</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Main Page Component
export default function FormEditorPage() {
  const router = useRouter();
  const params = useParams();
  const formId = params.formId as string;

  const { user, logout } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const {
    form,
    isLoading,
    error,
    updateForm,
    addField,
    updateField,
    deleteField,
    isUpdating,
    isFieldOperating,
  } = useForm(workspaceId, formId);

  const [activeTab, setActiveTab] = useState<TabType>("fields");
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);
  const [localFormName, setLocalFormName] = useState("");
  const [localFormDescription, setLocalFormDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (form) {
      setLocalFormName(form.name);
      setLocalFormDescription(form.description || "");
      setIsActive(form.is_active);
    }
  }, [form]);

  const handleSaveForm = async () => {
    await updateForm({
      name: localFormName,
      description: localFormDescription,
      is_active: isActive,
    });
  };

  const handleAddField = async () => {
    const fieldCount = form?.fields?.length || 0;
    await addField({
      name: `New Field ${fieldCount + 1}`,
      field_key: `field_${fieldCount + 1}`,
      field_type: "text",
    });
  };

  const handleUpdateField = async (fieldId: string, data: Partial<FormField>) => {
    await updateField({ fieldId, data });
  };

  const handleDeleteField = async (fieldId: string) => {
    if (confirm("Delete this field?")) {
      await deleteField(fieldId);
    }
  };

  const handleCopyLink = () => {
    if (form) {
      const publicUrl = `${window.location.origin}/public/forms/${form.public_url_token}`;
      navigator.clipboard.writeText(publicUrl);
    }
  };

  if (!workspaceId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">No workspace selected</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
<div className="max-w-6xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/4"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen bg-background">
<div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center py-16">
            <p className="text-red-400">Failed to load form</p>
            <button
              onClick={() => router.push("/forms")}
              className="mt-4 text-purple-400 hover:text-purple-300"
            >
              Back to Forms
            </button>
          </div>
        </div>
      </div>
    );
  }

  const publicUrl = `${window.location.origin}/public/forms/${form.public_url_token}`;

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: "fields", label: "Fields", icon: <FileText className="h-4 w-4" /> },
    { id: "appearance", label: "Appearance", icon: <Palette className="h-4 w-4" /> },
    { id: "thank-you", label: "Thank You", icon: <PartyPopper className="h-4 w-4" /> },
    { id: "ticketing", label: "Ticketing", icon: <Ticket className="h-4 w-4" /> },
    { id: "crm", label: "CRM", icon: <Users className="h-4 w-4" /> },
    { id: "deals", label: "Deals", icon: <DollarSign className="h-4 w-4" /> },
    { id: "automations", label: "Automations", icon: <Zap className="h-4 w-4" /> },
    { id: "submissions", label: "Submissions", icon: <Eye className="h-4 w-4" /> },
    { id: "settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background">
<div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push("/forms")}
            className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <input
              type="text"
              value={localFormName}
              onChange={(e) => setLocalFormName(e.target.value)}
              className="text-2xl font-bold text-foreground bg-transparent border-none focus:outline-none focus:ring-0 w-full"
              placeholder="Form Name"
            />
            <input
              type="text"
              value={localFormDescription}
              onChange={(e) => setLocalFormDescription(e.target.value)}
              className="text-sm text-muted-foreground bg-transparent border-none focus:outline-none focus:ring-0 w-full mt-1"
              placeholder="Add a description..."
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-border bg-muted text-purple-500 focus:ring-purple-500"
              />
              Active
            </label>
            <button
              onClick={handleCopyLink}
              className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition"
              title="Copy public link"
            >
              <Copy className="h-5 w-5" />
            </button>
            <button
              onClick={() => window.open(publicUrl, "_blank")}
              className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition"
              title="Preview form"
            >
              <ExternalLink className="h-5 w-5" />
            </button>
            <button
              onClick={handleSaveForm}
              disabled={isUpdating}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {isUpdating ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        {/* Destination indicators */}
        <div className="flex items-center gap-2 mb-6">
          {form.auto_create_ticket && (
            <div className="flex items-center gap-1 px-3 py-1 bg-blue-900/20 rounded-full text-sm text-blue-400">
              <Ticket className="h-3 w-3" />
              Creates Tickets
            </div>
          )}
          {form.auto_create_record && (
            <div className="flex items-center gap-1 px-3 py-1 bg-green-900/20 rounded-full text-sm text-green-400">
              <Users className="h-3 w-3" />
              Creates {form.crm_object_name || "CRM Records"}
            </div>
          )}
          {form.auto_create_deal && (
            <div className="flex items-center gap-1 px-3 py-1 bg-orange-900/20 rounded-full text-sm text-orange-400">
              <DollarSign className="h-3 w-3" />
              Creates Deals
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 bg-muted/50 border border-border rounded-xl mb-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "fields" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="text-foreground font-medium">Form Fields ({form.fields?.length || 0})</h3>
              <button
                onClick={handleAddField}
                disabled={isFieldOperating}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Add Field
              </button>
            </div>

            {!form.fields || form.fields.length === 0 ? (
              <div className="text-center py-16 bg-muted/50 border border-border rounded-xl">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No fields yet</h3>
                <p className="text-muted-foreground mb-4">Add fields to build your form</p>
                <button
                  onClick={handleAddField}
                  className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition inline-flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Field
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {form.fields
                  .sort((a, b) => a.position - b.position)
                  .map((field) => (
                    <FieldEditor
                      key={field.id}
                      field={field}
                      onUpdate={(data) => handleUpdateField(field.id, data)}
                      onDelete={() => handleDeleteField(field.id)}
                      isExpanded={expandedFieldId === field.id}
                      onToggleExpand={() =>
                        setExpandedFieldId(expandedFieldId === field.id ? null : field.id)
                      }
                    />
                  ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "appearance" && (
          <ThemeBuilderTab
            theme={normalizeTheme(form.theme)}
            formName={form.name}
            fields={form.fields || []}
            onSave={async (newTheme) => {
              await updateForm({ theme: newTheme });
            }}
            isSaving={isUpdating}
          />
        )}

        {activeTab === "thank-you" && (
          <ThankYouPageEditor
            config={normalizeThankYouPage(form.thank_you_page)}
            formTheme={normalizeTheme(form.theme)}
            onSave={async (newConfig) => {
              await updateForm({ thank_you_page: newConfig });
            }}
            isSaving={isUpdating}
          />
        )}

        {activeTab === "ticketing" && (
          <TicketingTab workspaceId={workspaceId} formId={formId} formFields={form?.fields || []} />
        )}

        {activeTab === "crm" && <CRMTab workspaceId={workspaceId} formId={formId} formFields={form?.fields || []} />}

        {activeTab === "deals" && <DealsTab workspaceId={workspaceId} formId={formId} formFields={form?.fields || []} />}

        {activeTab === "automations" && (
          <AutomationsTab workspaceId={workspaceId} formId={formId} />
        )}

        {activeTab === "submissions" && (
          <SubmissionsTab workspaceId={workspaceId} formId={formId} />
        )}

        {activeTab === "settings" && (
          <div className="bg-muted/50 border border-border rounded-xl p-6">
            <h3 className="text-foreground font-medium mb-4">Form Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Public Form URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={publicUrl}
                    readOnly
                    className="flex-1 px-4 py-2 bg-background border border-border rounded-lg text-muted-foreground"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="px-4 py-2 bg-accent text-foreground rounded-lg hover:bg-muted transition"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Success Message
                </label>
                <textarea
                  value={form.success_message || ""}
                  onChange={(e) => updateForm({ success_message: e.target.value })}
                  placeholder="Thank you for your submission!"
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground placeholder-muted-foreground h-24 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Redirect URL (optional)
                </label>
                <input
                  type="url"
                  value={form.redirect_url || ""}
                  onChange={(e) => updateForm({ redirect_url: e.target.value })}
                  placeholder="https://example.com/thank-you"
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground placeholder-muted-foreground"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
