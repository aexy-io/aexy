"use client";

import { useState, useEffect } from "react";
import {
  X,
  Plus,
  Trash2,
  GripVertical,
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
import { CRMAttributeType } from "@/lib/api";
import { ColorPicker, STATUS_COLORS } from "./ColorPicker";

// Type icons
const typeIcons: Record<CRMAttributeType, React.ReactNode> = {
  text: <Type className="h-5 w-5" />,
  number: <Hash className="h-5 w-5" />,
  currency: <DollarSign className="h-5 w-5" />,
  date: <Calendar className="h-5 w-5" />,
  datetime: <Calendar className="h-5 w-5" />,
  checkbox: <CheckSquare className="h-5 w-5" />,
  select: <List className="h-5 w-5" />,
  multi_select: <List className="h-5 w-5" />,
  status: <List className="h-5 w-5" />,
  email: <Mail className="h-5 w-5" />,
  phone: <Phone className="h-5 w-5" />,
  url: <Link className="h-5 w-5" />,
  record_reference: <Database className="h-5 w-5" />,
  user_reference: <Users className="h-5 w-5" />,
  rating: <Star className="h-5 w-5" />,
  formula: <Calculator className="h-5 w-5" />,
  rollup: <Calculator className="h-5 w-5" />,
  ai_computed: <Sparkles className="h-5 w-5" />,
};

interface TypeOption {
  value: CRMAttributeType;
  label: string;
  description: string;
  category: "basic" | "select" | "contact" | "advanced";
}

const attributeTypes: TypeOption[] = [
  // Basic
  { value: "text", label: "Text", description: "Short or long text", category: "basic" },
  { value: "number", label: "Number", description: "Integer or decimal", category: "basic" },
  { value: "currency", label: "Currency", description: "Monetary value", category: "basic" },
  { value: "date", label: "Date", description: "Date picker", category: "basic" },
  { value: "datetime", label: "Date & Time", description: "Date and time", category: "basic" },
  { value: "checkbox", label: "Checkbox", description: "Yes or no", category: "basic" },
  { value: "rating", label: "Rating", description: "1-5 stars", category: "basic" },
  // Select
  { value: "select", label: "Single Select", description: "Choose one option", category: "select" },
  { value: "multi_select", label: "Multi Select", description: "Choose multiple", category: "select" },
  { value: "status", label: "Status", description: "Pipeline stages", category: "select" },
  // Contact
  { value: "email", label: "Email", description: "Email address", category: "contact" },
  { value: "phone", label: "Phone", description: "Phone number", category: "contact" },
  { value: "url", label: "URL", description: "Web link", category: "contact" },
  // Advanced
  { value: "record_reference", label: "Record Reference", description: "Link to another record", category: "advanced" },
  { value: "user_reference", label: "User Reference", description: "Link to user", category: "advanced" },
  { value: "formula", label: "Formula", description: "Calculated field", category: "advanced" },
  { value: "rollup", label: "Rollup", description: "Aggregate values", category: "advanced" },
  { value: "ai_computed", label: "AI Computed", description: "AI-generated value", category: "advanced" },
];

const categoryLabels: Record<string, string> = {
  basic: "Basic",
  select: "Select",
  contact: "Contact",
  advanced: "Advanced",
};

interface SelectOption {
  value: string;
  label: string;
  color: string;
}

interface CreateAttributeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    name: string;
    attribute_type: CRMAttributeType;
    description?: string;
    is_required: boolean;
    is_unique: boolean;
    config?: Record<string, unknown>;
  }) => Promise<void>;
  isCreating?: boolean;
}

export function CreateAttributeModal({
  isOpen,
  onClose,
  onCreate,
  isCreating = false,
}: CreateAttributeModalProps) {
  const [step, setStep] = useState<"type" | "configure">("type");
  const [selectedType, setSelectedType] = useState<CRMAttributeType | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [isUnique, setIsUnique] = useState(false);

  // Type-specific config
  const [options, setOptions] = useState<SelectOption[]>([
    { value: "", label: "", color: STATUS_COLORS[0].color },
  ]);
  const [defaultValue, setDefaultValue] = useState<string>("");

  // Reset when opening
  useEffect(() => {
    if (isOpen) {
      setStep("type");
      setSelectedType(null);
      setName("");
      setDescription("");
      setIsRequired(false);
      setIsUnique(false);
      setOptions([{ value: "", label: "", color: STATUS_COLORS[0].color }]);
      setDefaultValue("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectType = (type: CRMAttributeType) => {
    setSelectedType(type);
    setStep("configure");
  };

  const handleAddOption = () => {
    setOptions([
      ...options,
      { value: "", label: "", color: STATUS_COLORS[options.length % STATUS_COLORS.length].color },
    ]);
  };

  const handleRemoveOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleOptionChange = (index: number, field: keyof SelectOption, value: string) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], [field]: value };
    // Auto-generate value from label if empty
    if (field === "label" && !newOptions[index].value) {
      newOptions[index].value = value.toLowerCase().replace(/\s+/g, "_");
    }
    setOptions(newOptions);
  };

  const handleCreate = async () => {
    if (!selectedType || !name) return;

    const config: Record<string, unknown> = {};

    // Add type-specific config
    if (["select", "multi_select", "status"].includes(selectedType)) {
      config.options = options.filter((o) => o.label.trim());
    }

    if (defaultValue) {
      config.default_value = defaultValue;
    }

    await onCreate({
      name,
      attribute_type: selectedType,
      description: description || undefined,
      is_required: isRequired,
      is_unique: isUnique,
      config: Object.keys(config).length > 0 ? config : undefined,
    });

    onClose();
  };

  const needsOptions = selectedType && ["select", "multi_select", "status"].includes(selectedType);
  const typeInfo = selectedType ? attributeTypes.find((t) => t.value === selectedType) : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-muted rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-border flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-xl font-semibold text-foreground">
            {step === "type" ? "Select attribute type" : "Configure attribute"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === "type" && (
            <div className="space-y-6">
              {(["basic", "select", "contact", "advanced"] as const).map((category) => (
                <div key={category}>
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    {categoryLabels[category]}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {attributeTypes
                      .filter((t) => t.category === category)
                      .map((type) => (
                        <button
                          key={type.value}
                          onClick={() => handleSelectType(type.value)}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border transition-colors text-left",
                            "border-border hover:border-purple-500 hover:bg-purple-500/10"
                          )}
                        >
                          <div className="p-2 bg-accent/50 rounded-lg text-muted-foreground">
                            {typeIcons[type.value]}
                          </div>
                          <div>
                            <div className="font-medium text-foreground">{type.label}</div>
                            <div className="text-xs text-muted-foreground">{type.description}</div>
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === "configure" && selectedType && (
            <div className="space-y-6">
              {/* Type info */}
              <div className="flex items-center gap-3 p-3 bg-accent/30 rounded-lg">
                <div className="p-2 bg-purple-500/20 rounded-lg text-purple-400">
                  {typeIcons[selectedType]}
                </div>
                <div>
                  <div className="font-medium text-foreground">{typeInfo?.label}</div>
                  <div className="text-sm text-muted-foreground">{typeInfo?.description}</div>
                </div>
                <button
                  onClick={() => setStep("type")}
                  className="ml-auto text-sm text-purple-400 hover:text-purple-300"
                >
                  Change type
                </button>
              </div>

              {/* Basic info */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Attribute name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Company Name, Deal Value"
                    className="w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Description (optional)
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this attribute for?"
                    className="w-full px-4 py-2 bg-accent border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* Options for select types */}
              {needsOptions && (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-foreground">
                    Options
                  </label>
                  <div className="space-y-2">
                    {options.map((option, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <ColorPicker
                          value={option.color}
                          onChange={(color) => handleOptionChange(index, "color", color)}
                          size="sm"
                        />
                        <input
                          type="text"
                          value={option.label}
                          onChange={(e) => handleOptionChange(index, "label", e.target.value)}
                          placeholder="Option label"
                          className="flex-1 px-3 py-1.5 bg-accent border border-border rounded text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        {options.length > 1 && (
                          <button
                            onClick={() => handleRemoveOption(index)}
                            className="p-1.5 hover:bg-red-500/20 rounded text-muted-foreground hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleAddOption}
                    className="flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300"
                  >
                    <Plus className="h-4 w-4" />
                    Add option
                  </button>
                </div>
              )}

              {/* Constraints */}
              <div className="space-y-3 pt-4 border-t border-border">
                <label className="block text-sm font-medium text-foreground">
                  Constraints
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-accent/30">
                    <input
                      type="checkbox"
                      checked={isRequired}
                      onChange={(e) => setIsRequired(e.target.checked)}
                      className="w-4 h-4 rounded border-border bg-accent text-purple-500 focus:ring-purple-500"
                    />
                    <div>
                      <div className="font-medium text-foreground">Required</div>
                      <div className="text-xs text-muted-foreground">
                        This field must have a value
                      </div>
                    </div>
                  </label>

                  {["text", "email", "phone", "url", "number"].includes(selectedType) && (
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-accent/30">
                      <input
                        type="checkbox"
                        checked={isUnique}
                        onChange={(e) => setIsUnique(e.target.checked)}
                        className="w-4 h-4 rounded border-border bg-accent text-purple-500 focus:ring-purple-500"
                      />
                      <div>
                        <div className="font-medium text-foreground">Unique</div>
                        <div className="text-xs text-muted-foreground">
                          No two records can have the same value
                        </div>
                      </div>
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "configure" && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-border text-foreground rounded-lg hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name || isCreating}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white rounded-lg transition-colors"
            >
              {isCreating ? "Creating..." : "Create Attribute"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
