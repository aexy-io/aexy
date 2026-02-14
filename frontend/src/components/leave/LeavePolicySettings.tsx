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
import { LeavePolicy, LeavePolicyCreate } from "@/lib/leave-api";
import {
  useLeaveTypes,
  useLeavePolicies,
  useLeavePolicyMutations,
} from "@/hooks/useLeave";

interface PolicyFormData {
  leave_type_id: string;
  annual_quota: number;
  accrual_type: string;
  carry_forward_enabled: boolean;
  max_carry_forward_days: number;
}

const emptyForm: PolicyFormData = {
  leave_type_id: "",
  annual_quota: 12,
  accrual_type: "annual",
  carry_forward_enabled: false,
  max_carry_forward_days: 0,
};

const ACCRUAL_TYPES = [
  { value: "annual", label: "Annual (all at once)" },
  { value: "monthly", label: "Monthly (accrues each month)" },
  { value: "quarterly", label: "Quarterly (accrues each quarter)" },
];

export function LeavePolicySettings() {
  const { data: leaveTypes } = useLeaveTypes();
  const { data: policies, isLoading } = useLeavePolicies();
  const { create, update, remove } = useLeavePolicyMutations();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<PolicyFormData>(emptyForm);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openCreateForm = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setShowForm(true);
  };

  const openEditForm = (policy: LeavePolicy) => {
    setEditingId(policy.id);
    setFormData({
      leave_type_id: policy.leave_type_id,
      annual_quota: policy.annual_quota,
      accrual_type: policy.accrual_type,
      carry_forward_enabled: policy.carry_forward_enabled,
      max_carry_forward_days: policy.max_carry_forward_days,
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
    const data: LeavePolicyCreate = {
      leave_type_id: formData.leave_type_id,
      annual_quota: formData.annual_quota,
      accrual_type: formData.accrual_type,
      carry_forward_enabled: formData.carry_forward_enabled,
      max_carry_forward_days: formData.carry_forward_enabled
        ? formData.max_carry_forward_days
        : 0,
    };

    try {
      if (editingId) {
        await update.mutateAsync({ policyId: editingId, data });
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

  const getLeaveTypeName = (typeId: string) => {
    return leaveTypes?.find((t) => t.id === typeId)?.name || "Unknown";
  };

  const getLeaveTypeColor = (typeId: string) => {
    return leaveTypes?.find((t) => t.id === typeId)?.color || "#6366f1";
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
          <h3 className="text-base font-semibold text-white">Leave Policies</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Define quotas and accrual rules for each leave type
          </p>
        </div>
        <button
          onClick={openCreateForm}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition"
        >
          <Plus className="h-4 w-4" />
          Add Policy
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-white">
              {editingId ? "Edit Policy" : "New Policy"}
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
                  Leave Type
                </label>
                <select
                  value={formData.leave_type_id}
                  onChange={(e) =>
                    setFormData({ ...formData, leave_type_id: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500/50"
                  required
                >
                  <option value="" disabled>
                    Select leave type
                  </option>
                  {leaveTypes?.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Annual Quota (days)
                </label>
                <input
                  type="number"
                  min={0}
                  value={formData.annual_quota}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      annual_quota: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500/50"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Accrual Type
              </label>
              <select
                value={formData.accrual_type}
                onChange={(e) =>
                  setFormData({ ...formData, accrual_type: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500/50"
              >
                {ACCRUAL_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Carry forward */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() =>
                  setFormData({
                    ...formData,
                    carry_forward_enabled: !formData.carry_forward_enabled,
                  })
                }
                className="flex items-center gap-2 text-sm text-slate-300"
              >
                {formData.carry_forward_enabled ? (
                  <ToggleRight className="h-5 w-5 text-blue-400" />
                ) : (
                  <ToggleLeft className="h-5 w-5 text-slate-500" />
                )}
                Allow Carry Forward
              </button>
              {formData.carry_forward_enabled && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Max Carry Forward Days
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.max_carry_forward_days}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        max_carry_forward_days: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full max-w-[200px] px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              )}
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
                Leave Type
              </th>
              <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                Quota
              </th>
              <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                Accrual
              </th>
              <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                Carry Forward
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
            {policies?.map((policy) => (
              <tr
                key={policy.id}
                className="hover:bg-slate-800/50 transition"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: policy.leave_type?.color || getLeaveTypeColor(policy.leave_type_id),
                      }}
                    />
                    <span className="text-sm font-medium text-white">
                      {policy.leave_type?.name || getLeaveTypeName(policy.leave_type_id)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-slate-300">
                    {policy.annual_quota} days/year
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-slate-300 capitalize">
                    {policy.accrual_type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {policy.carry_forward_enabled ? (
                    <span className="text-sm text-blue-400">
                      Up to {policy.max_carry_forward_days} days
                    </span>
                  ) : (
                    <span className="text-sm text-slate-500">Disabled</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      policy.is_active
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-slate-500/10 text-slate-500"
                    }`}
                  >
                    {policy.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => openEditForm(policy)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(policy.id)}
                      disabled={remove.isPending}
                      className={`p-1.5 rounded-lg transition ${
                        deletingId === policy.id
                          ? "text-red-400 bg-red-500/10"
                          : "text-slate-400 hover:text-red-400 hover:bg-slate-700"
                      }`}
                      title={
                        deletingId === policy.id
                          ? "Click again to confirm"
                          : "Delete"
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {(!policies || policies.length === 0) && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-slate-500"
                >
                  No leave policies configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
