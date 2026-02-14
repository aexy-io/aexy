"use client";

import { useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Check,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { LeaveType, LeaveTypeCreate } from "@/lib/leave-api";
import { useLeaveTypes, useLeaveTypeMutations } from "@/hooks/useLeave";

const DEFAULT_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

interface LeaveTypeFormData {
  name: string;
  slug: string;
  description: string;
  color: string;
  is_paid: boolean;
  requires_approval: boolean;
  allows_half_day: boolean;
  min_notice_days: number;
}

const emptyForm: LeaveTypeFormData = {
  name: "",
  slug: "",
  description: "",
  color: "#3b82f6",
  is_paid: true,
  requires_approval: true,
  allows_half_day: true,
  min_notice_days: 0,
};

export function LeaveTypeSettings() {
  const { data: leaveTypes, isLoading } = useLeaveTypes(true);
  const { create, update, remove } = useLeaveTypeMutations();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<LeaveTypeFormData>(emptyForm);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openCreateForm = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setShowForm(true);
  };

  const openEditForm = (type: LeaveType) => {
    setEditingId(type.id);
    setFormData({
      name: type.name,
      slug: type.slug,
      description: type.description || "",
      color: type.color,
      is_paid: type.is_paid,
      requires_approval: type.requires_approval,
      allows_half_day: type.allows_half_day,
      min_notice_days: type.min_notice_days,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(emptyForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data: LeaveTypeCreate = {
      name: formData.name,
      slug: formData.slug || slugify(formData.name),
      description: formData.description || null,
      color: formData.color,
      is_paid: formData.is_paid,
      requires_approval: formData.requires_approval,
      allows_half_day: formData.allows_half_day,
      min_notice_days: formData.min_notice_days,
    };

    try {
      if (editingId) {
        await update.mutateAsync({ typeId: editingId, data });
      } else {
        await create.mutateAsync(data);
      }
      closeForm();
    } catch {
      // Error handled by react-query
    }
  };

  const handleDelete = async (id: string) => {
    if (deletingId === id) {
      try {
        await remove.mutateAsync(id);
      } catch {
        // Error handled by react-query
      }
      setDeletingId(null);
    } else {
      setDeletingId(id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">Leave Types</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure the types of leave available in your workspace
          </p>
        </div>
        <button
          onClick={openCreateForm}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition"
        >
          <Plus className="h-4 w-4" />
          Add Type
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-white">
              {editingId ? "Edit Leave Type" : "New Leave Type"}
            </h4>
            <button
              onClick={closeForm}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      name: e.target.value,
                      slug: slugify(e.target.value),
                    })
                  }
                  placeholder="e.g. Sick Leave"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Slug
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) =>
                    setFormData({ ...formData, slug: e.target.value })
                  }
                  placeholder="sick_leave"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Description
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Optional description"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>

            {/* Color picker */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Color
              </label>
              <div className="flex gap-2">
                {DEFAULT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormData({ ...formData, color })}
                    className={`w-7 h-7 rounded-full border-2 transition ${
                      formData.color === color
                        ? "border-white scale-110"
                        : "border-transparent hover:border-slate-500"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Min Notice Days
                </label>
                <input
                  type="number"
                  min={0}
                  value={formData.min_notice_days}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      min_notice_days: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500/50"
                />
              </div>
            </div>

            {/* Toggles */}
            <div className="flex flex-wrap gap-4">
              {[
                { key: "is_paid" as const, label: "Paid Leave" },
                { key: "requires_approval" as const, label: "Requires Approval" },
                { key: "allows_half_day" as const, label: "Allows Half Day" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, [key]: !formData[key] })
                  }
                  className="flex items-center gap-2 text-sm text-slate-300"
                >
                  {formData[key] ? (
                    <ToggleRight className="h-5 w-5 text-blue-400" />
                  ) : (
                    <ToggleLeft className="h-5 w-5 text-slate-500" />
                  )}
                  {label}
                </button>
              ))}
            </div>

            {/* Submit */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={create.isPending || update.isPending}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition disabled:opacity-50"
              >
                {(create.isPending || update.isPending) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {editingId ? "Update" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                Name
              </th>
              <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                Paid
              </th>
              <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                Approval
              </th>
              <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                Half Day
              </th>
              <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                Status
              </th>
              <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {leaveTypes?.map((type) => (
              <tr
                key={type.id}
                className="hover:bg-slate-800/50 transition"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: type.color }}
                    />
                    <div>
                      <span className="text-sm font-medium text-white">
                        {type.name}
                      </span>
                      {type.description && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px]">
                          {type.description}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs ${type.is_paid ? "text-emerald-400" : "text-slate-500"}`}>
                    {type.is_paid ? "Yes" : "No"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs ${type.requires_approval ? "text-yellow-400" : "text-slate-500"}`}>
                    {type.requires_approval ? "Required" : "Auto"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs ${type.allows_half_day ? "text-blue-400" : "text-slate-500"}`}>
                    {type.allows_half_day ? "Yes" : "No"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      type.is_active
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-slate-500/10 text-slate-500"
                    }`}
                  >
                    {type.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => openEditForm(type)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(type.id)}
                      disabled={remove.isPending}
                      className={`p-1.5 rounded-lg transition ${
                        deletingId === type.id
                          ? "text-red-400 bg-red-500/10"
                          : "text-slate-400 hover:text-red-400 hover:bg-slate-700"
                      }`}
                      title={deletingId === type.id ? "Click again to confirm" : "Delete"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {(!leaveTypes || leaveTypes.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                  No leave types configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
