"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Target,
  Plus,
  Pencil,
  Trash2,
  Star,
  Loader2,
  ArrowLeft,
  X,
  Check,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useICPTemplates } from "@/hooks/useGTMProviders";
import { ICPTemplate, ICPTemplateCreate, ICPTemplateUpdate } from "@/lib/api";

const INDUSTRIES = [
  "Technology", "SaaS", "Healthcare", "Finance", "E-commerce",
  "Education", "Manufacturing", "Consulting", "Media", "Real Estate",
  "Logistics", "Energy", "Retail", "Telecom", "Legal",
];

const EMPLOYEE_RANGES = [
  "1-10", "11-50", "51-200", "201-1000", "1001-5000", "5000+",
];

const REVENUE_RANGES = [
  "<$1M", "$1M-$10M", "$10M-$50M", "$50M-$100M", "$100M-$500M", "$500M+",
];

interface TemplateFormData {
  name: string;
  description: string;
  target_industries: string[];
  target_employee_ranges: string[];
  target_revenue_ranges: string[];
  target_locations: string[];
  mql_threshold: number;
  sql_threshold: number;
  is_default: boolean;
  criteria: {
    firmographic_weight: number;
    behavioral_weight: number;
    engagement_weight: number;
  };
}

const DEFAULT_FORM: TemplateFormData = {
  name: "",
  description: "",
  target_industries: [],
  target_employee_ranges: [],
  target_revenue_ranges: [],
  target_locations: [],
  mql_threshold: 40,
  sql_threshold: 70,
  is_default: false,
  criteria: {
    firmographic_weight: 40,
    behavioral_weight: 35,
    engagement_weight: 25,
  },
};

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-zinc-300 mb-2">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              selected.includes(option)
                ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                : "bg-white/5 text-zinc-400 border-white/10 hover:bg-white/10"
            }`}
          >
            {selected.includes(option) && (
              <Check className="w-3 h-3 inline mr-1" />
            )}
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThresholdSlider({
  label,
  value,
  onChange,
  color,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-zinc-300">{label}</label>
        <span className="text-sm font-mono text-zinc-400">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className={`w-full h-2 rounded-full appearance-none cursor-pointer ${color}`}
        style={{
          background: `linear-gradient(to right, rgb(99 102 241) ${value}%, rgb(39 39 42) ${value}%)`,
        }}
      />
    </div>
  );
}

function TemplateCard({
  template,
  onEdit,
  onDelete,
}: {
  template: ICPTemplate;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const criteria = template.criteria as Record<string, unknown>;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:border-indigo-500/30 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-indigo-400" />
          <h3 className="text-lg font-semibold text-white">{template.name}</h3>
          {template.is_default && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Star className="w-3 h-3" />
              Default
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded hover:bg-red-500/10 text-zinc-400 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {template.description && (
        <p className="text-sm text-zinc-400 mb-4">{template.description}</p>
      )}

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-zinc-500">MQL Threshold</span>
          <p className="text-zinc-300 font-mono">
            {(criteria.mql_threshold as number) ?? 40}
          </p>
        </div>
        <div>
          <span className="text-zinc-500">SQL Threshold</span>
          <p className="text-zinc-300 font-mono">
            {(criteria.sql_threshold as number) ?? 70}
          </p>
        </div>
      </div>

      <div className="mt-4 text-xs text-zinc-500">
        Updated {new Date(template.updated_at).toLocaleDateString()}
      </div>
    </div>
  );
}

function TemplateModal({
  initial,
  onSave,
  onClose,
  isSaving,
}: {
  initial: TemplateFormData;
  onSave: (data: TemplateFormData) => void;
  onClose: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<TemplateFormData>(initial);

  const update = <K extends keyof TemplateFormData>(
    key: K,
    value: TemplateFormData[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#12121a] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between sticky top-0 bg-[#12121a] z-10">
          <h2 className="text-lg font-semibold text-white">
            {initial.name ? "Edit ICP Template" : "New ICP Template"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-white/10 text-zinc-400 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Name + Description */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Template Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="e.g., Mid-Market SaaS"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder="Describe the ideal customer profile..."
                rows={2}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50 resize-none"
              />
            </div>
          </div>

          {/* Target Criteria */}
          <MultiSelect
            label="Target Industries"
            options={INDUSTRIES}
            selected={form.target_industries}
            onChange={(val) => update("target_industries", val)}
          />
          <MultiSelect
            label="Employee Range"
            options={EMPLOYEE_RANGES}
            selected={form.target_employee_ranges}
            onChange={(val) => update("target_employee_ranges", val)}
          />
          <MultiSelect
            label="Revenue Range"
            options={REVENUE_RANGES}
            selected={form.target_revenue_ranges}
            onChange={(val) => update("target_revenue_ranges", val)}
          />

          {/* Thresholds */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-white">
              Lifecycle Thresholds
            </h4>
            <ThresholdSlider
              label="MQL Threshold"
              value={form.mql_threshold}
              onChange={(v) => update("mql_threshold", v)}
              color="bg-indigo-500"
            />
            <ThresholdSlider
              label="SQL Threshold"
              value={form.sql_threshold}
              onChange={(v) => update("sql_threshold", v)}
              color="bg-violet-500"
            />
          </div>

          {/* Score Preview */}
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <h4 className="text-sm font-medium text-white mb-3">
              Score Model Preview
            </h4>
            <div className="flex gap-4">
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-400">Firmographic</span>
                  <span className="text-zinc-300">
                    {form.criteria.firmographic_weight}%
                  </span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-3">
                  <div
                    className="bg-blue-500 h-3 rounded-full"
                    style={{
                      width: `${form.criteria.firmographic_weight}%`,
                    }}
                  />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-400">Behavioral</span>
                  <span className="text-zinc-300">
                    {form.criteria.behavioral_weight}%
                  </span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-3">
                  <div
                    className="bg-violet-500 h-3 rounded-full"
                    style={{
                      width: `${form.criteria.behavioral_weight}%`,
                    }}
                  />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-400">Engagement</span>
                  <span className="text-zinc-300">
                    {form.criteria.engagement_weight}%
                  </span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-3">
                  <div
                    className="bg-emerald-500 h-3 rounded-full"
                    style={{
                      width: `${form.criteria.engagement_weight}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Default checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => update("is_default", e.target.checked)}
              className="rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500"
            />
            <span className="text-sm text-zinc-300">
              Set as default template
            </span>
          </label>
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-end gap-3 sticky bottom-0 bg-[#12121a]">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 rounded-lg text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.name.trim() || isSaving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Template
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ICPTemplatesPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const { templates, isLoading, createTemplate, updateTemplate, deleteTemplate } =
    useICPTemplates(workspaceId);

  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ICPTemplate | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleCreate = () => {
    setEditingTemplate(null);
    setShowModal(true);
  };

  const handleEdit = (template: ICPTemplate) => {
    setEditingTemplate(template);
    setShowModal(true);
  };

  const handleDelete = async (template: ICPTemplate) => {
    if (!confirm(`Delete template "${template.name}"?`)) return;
    await deleteTemplate(template.id);
  };

  const handleSave = async (form: TemplateFormData) => {
    setIsSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        criteria: {
          ...form.criteria,
          target_industries: form.target_industries,
          target_employee_ranges: form.target_employee_ranges,
          target_revenue_ranges: form.target_revenue_ranges,
          target_locations: form.target_locations,
          mql_threshold: form.mql_threshold,
          sql_threshold: form.sql_threshold,
        },
        is_default: form.is_default,
      };

      if (editingTemplate) {
        await updateTemplate({
          templateId: editingTemplate.id,
          data: payload as ICPTemplateUpdate,
        });
      } else {
        await createTemplate(payload as ICPTemplateCreate);
      }
      setShowModal(false);
    } finally {
      setIsSaving(false);
    }
  };

  const getFormData = (): TemplateFormData => {
    if (!editingTemplate) return DEFAULT_FORM;
    const c = editingTemplate.criteria as Record<string, unknown>;
    return {
      name: editingTemplate.name,
      description: editingTemplate.description || "",
      target_industries: (c.target_industries as string[]) || [],
      target_employee_ranges: (c.target_employee_ranges as string[]) || [],
      target_revenue_ranges: (c.target_revenue_ranges as string[]) || [],
      target_locations: (c.target_locations as string[]) || [],
      mql_threshold: (c.mql_threshold as number) ?? 40,
      sql_threshold: (c.sql_threshold as number) ?? 70,
      is_default: editingTemplate.is_default,
      criteria: {
        firmographic_weight: (c.firmographic_weight as number) ?? 40,
        behavioral_weight: (c.behavioral_weight as number) ?? 35,
        engagement_weight: (c.engagement_weight as number) ?? 25,
      },
    };
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <span className="text-zinc-400 text-sm">Loading ICP templates...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link
              href="/gtm/scoring"
              className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-300 mb-2 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Scoring
            </Link>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Target className="w-7 h-7 text-indigo-400" />
              ICP Templates
            </h1>
            <p className="text-zinc-400 mt-1">
              Define Ideal Customer Profiles with target criteria and scoring thresholds.
            </p>
          </div>
          <button
            onClick={handleCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Template
          </button>
        </div>

        {/* Template Grid */}
        {templates.length === 0 ? (
          <div className="bg-white/5 border border-white/10 border-dashed rounded-xl p-12 text-center">
            <Target className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">
              No ICP templates yet
            </h3>
            <p className="text-zinc-400 text-sm mb-6 max-w-md mx-auto">
              Create an Ideal Customer Profile template to define your target market.
              Leads will be scored against these criteria automatically.
            </p>
            <button
              onClick={handleCreate}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create First Template
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onEdit={() => handleEdit(template)}
                onDelete={() => handleDelete(template)}
              />
            ))}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <TemplateModal
            initial={getFormData()}
            onSave={handleSave}
            onClose={() => setShowModal(false)}
            isSaving={isSaving}
          />
        )}
      </div>
    </div>
  );
}
