"use client";

import { useState, useMemo } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Check,
  CalendarDays,
  ToggleLeft,
  ToggleRight,
  Star,
} from "lucide-react";
import { Holiday, HolidayCreate } from "@/lib/leave-api";
import { useHolidays, useHolidayMutations } from "@/hooks/useLeave";

interface HolidayFormData {
  name: string;
  date: string;
  description: string;
  is_optional: boolean;
}

const emptyForm: HolidayFormData = {
  name: "",
  date: "",
  description: "",
  is_optional: false,
};

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function HolidaySettings() {
  const { data: holidays, isLoading } = useHolidays();
  const { create, update, remove } = useHolidayMutations();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<HolidayFormData>(emptyForm);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openCreateForm = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setShowForm(true);
  };

  const openEditForm = (holiday: Holiday) => {
    setEditingId(holiday.id);
    setFormData({
      name: holiday.name,
      date: holiday.date,
      description: holiday.description || "",
      is_optional: holiday.is_optional,
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
    const data: HolidayCreate = {
      name: formData.name,
      date: formData.date,
      description: formData.description || null,
      is_optional: formData.is_optional,
    };

    try {
      if (editingId) {
        await update.mutateAsync({ holidayId: editingId, data });
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

  // Sort holidays by date (memoized)
  const sortedHolidays = useMemo(
    () => (holidays ? [...holidays].sort((a, b) => a.date.localeCompare(b.date)) : []),
    [holidays]
  );

  // Today's date string for past comparison (avoids creating Date objects every render)
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const isPast = (dateStr: string) => dateStr < todayStr;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Holidays</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage public holidays and optional holidays for your workspace
          </p>
        </div>
        <button
          onClick={openCreateForm}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition"
        >
          <Plus className="h-4 w-4" />
          Add Holiday
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-muted/50 border border-border/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-foreground">
              {editingId ? "Edit Holiday" : "New Holiday"}
            </h4>
            <button
              onClick={closeForm}
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Holiday Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="e.g. New Year's Day"
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/50"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) =>
                    setFormData({ ...formData, date: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-blue-500/50 [color-scheme:dark]"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Optional description"
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/50"
              />
            </div>

            {/* Optional toggle */}
            <button
              type="button"
              onClick={() =>
                setFormData({
                  ...formData,
                  is_optional: !formData.is_optional,
                })
              }
              className="flex items-center gap-2 text-sm text-foreground"
            >
              {formData.is_optional ? (
                <ToggleRight className="h-5 w-5 text-blue-400" />
              ) : (
                <ToggleLeft className="h-5 w-5 text-muted-foreground" />
              )}
              Optional Holiday
              <span className="text-xs text-muted-foreground">
                (employees can choose to work)
              </span>
            </button>

            {/* Submit */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition"
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
      <div className="bg-background border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                Holiday
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                Date
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                Type
              </th>
              <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedHolidays.map((holiday) => (
              <tr
                key={holiday.id}
                className={`hover:bg-muted/50 transition ${
                  isPast(holiday.date) ? "opacity-50" : ""
                }`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <CalendarDays className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <span className="text-sm font-medium text-foreground">
                        {holiday.name}
                      </span>
                      {holiday.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {holiday.description}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-foreground">
                    {formatDate(holiday.date)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {holiday.is_optional ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <Star className="h-3 w-3" />
                      Optional
                    </span>
                  ) : (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
                      Mandatory
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => openEditForm(holiday)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(holiday.id)}
                      disabled={remove.isPending}
                      className={`p-1.5 rounded-lg transition ${
                        deletingId === holiday.id
                          ? "text-red-400 bg-red-500/10"
                          : "text-muted-foreground hover:text-red-400 hover:bg-accent"
                      }`}
                      title={
                        deletingId === holiday.id
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
            {sortedHolidays.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  No holidays configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
