"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWorkspace } from "@/hooks/useWorkspace";
import { bookingApi, EventType, EventTypeUpdate, CustomQuestion } from "@/lib/booking-api";
import { toast } from "sonner";
import {
  ArrowLeft,
  Clock,
  Video,
  MapPin,
  Phone,
  Plus,
  Trash2,
  DollarSign,
  Loader2,
  Users,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";

// Helper to extract user-friendly error messages from API responses
function getErrorMessage(error: any, fallback: string = "An error occurred"): string {
  if (!error) return fallback;

  // Handle axios error responses
  const data = error.response?.data;
  if (data) {
    // FastAPI validation error format: { detail: [{ msg, loc, type }] }
    if (Array.isArray(data.detail)) {
      const messages = data.detail
        .map((d: any) => {
          const field = d.loc?.slice(1).join(".") || "";
          const msg = d.msg || "";
          return field ? `${field}: ${msg}` : msg;
        })
        .filter(Boolean);
      if (messages.length > 0) return messages.join(", ");
    }
    // Simple detail string
    if (typeof data.detail === "string") return data.detail;
    // Error message field
    if (data.message) return data.message;
    if (data.error) return data.error;
  }

  // Network or other errors
  if (error.message) return error.message;

  return fallback;
}

const ASSIGNMENT_TYPES = [
  { value: "round_robin", label: "Round Robin", description: "Rotate through team members" },
  { value: "collective", label: "Collective", description: "First available team member" },
  { value: "all_hands", label: "All Hands", description: "All team members attend together" },
];

const LOCATION_TYPES = [
  { value: "google_meet", label: "Google Meet", icon: Video },
  { value: "zoom", label: "Zoom", icon: Video },
  { value: "microsoft_teams", label: "Microsoft Teams", icon: Video },
  { value: "phone", label: "Phone Call", icon: Phone },
  { value: "in_person", label: "In Person", icon: MapPin },
  { value: "custom", label: "Custom", icon: Video },
];

const DURATIONS = [15, 30, 45, 60, 90, 120];

const COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#06B6D4", "#6366F1", "#14B8A6", "#F97316",
];

export default function EditEventTypePage() {
  const params = useParams();
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eventType, setEventType] = useState<EventType | null>(null);

  const [formData, setFormData] = useState<EventTypeUpdate>({});

  useEffect(() => {
    if (currentWorkspace?.id && params.eventTypeId) {
      loadEventType();
    }
  }, [currentWorkspace?.id, params.eventTypeId]);

  const loadEventType = async () => {
    if (!currentWorkspace?.id) return;

    try {
      const data = await bookingApi.eventTypes.get(
        currentWorkspace.id,
        params.eventTypeId as string
      );
      setEventType(data);
      setFormData({
        name: data.name,
        slug: data.slug,
        description: data.description || "",
        duration_minutes: data.duration_minutes,
        location_type: data.location_type,
        color: data.color,
        buffer_before: data.buffer_before,
        buffer_after: data.buffer_after,
        min_notice_hours: data.min_notice_hours,
        max_future_days: data.max_future_days,
        questions: data.questions || [],
        payment_enabled: data.payment_enabled,
        payment_amount: data.payment_amount || 0,
        payment_currency: data.payment_currency || "USD",
        is_active: data.is_active,
        is_team_event: data.is_team_event,
      });
    } catch (error) {
      console.error("Failed to load event type:", error);
      toast.error("Failed to load event type");
      router.push("/booking/event-types");
    } finally {
      setLoading(false);
    }
  };

  const addQuestion = () => {
    const newQuestion: CustomQuestion = {
      id: `q-${Date.now()}`,
      label: "",
      type: "text",
      required: false,
    };
    setFormData({
      ...formData,
      questions: [...(formData.questions || []), newQuestion],
    });
  };

  const updateQuestion = (index: number, updates: Partial<CustomQuestion>) => {
    const questions = [...(formData.questions || [])];
    questions[index] = { ...questions[index], ...updates };
    setFormData({ ...formData, questions });
  };

  const removeQuestion = (index: number) => {
    const questions = [...(formData.questions || [])];
    questions.splice(index, 1);
    setFormData({ ...formData, questions });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentWorkspace?.id || !eventType) return;

    if (!formData.name?.trim()) {
      toast.error("Event name is required");
      return;
    }

    if (!formData.slug?.trim()) {
      toast.error("URL slug is required");
      return;
    }

    // Filter out questions with empty labels
    const validQuestions = (formData.questions || []).filter(
      (q) => q.label && q.label.trim().length > 0
    );

    setSaving(true);

    try {
      await bookingApi.eventTypes.update(currentWorkspace.id, eventType.id, {
        ...formData,
        questions: validQuestions,
      });
      toast.success("Event type updated!");
      router.push("/booking/event-types");
    } catch (error: any) {
      console.error("Failed to update:", error);
      const status = error.response?.status;

      if (status === 409) {
        toast.error("An event type with this slug already exists. Please choose a different URL slug.");
      } else if (status === 400) {
        toast.error(getErrorMessage(error, "Invalid data provided. Please check your inputs."));
      } else if (status === 403) {
        toast.error("You don't have permission to update this event type.");
      } else if (status === 404) {
        toast.error("Event type not found. It may have been deleted.");
        router.push("/booking/event-types");
      } else if (status >= 500) {
        toast.error("Server error. Please try again later.");
      } else {
        toast.error(getErrorMessage(error, "Failed to update event type"));
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!eventType) {
    return null;
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/booking/event-types"
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Event Types
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Edit Event Type
          </h1>
          <label className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Active</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </label>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Basic Information
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Event Name *
              </label>
              <input
                type="text"
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="30 Minute Meeting"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                URL Slug *
              </label>
              <div className="flex items-center">
                <span className="text-sm text-gray-500 dark:text-gray-400 mr-1">
                  /book/{currentWorkspace?.slug}/
                </span>
                <input
                  type="text"
                  value={formData.slug || ""}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="30-min"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <textarea
                value={formData.description || ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="A quick call to discuss..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Color
              </label>
              <div className="flex gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormData({ ...formData, color })}
                    className={`w-8 h-8 rounded-full ${
                      formData.color === color ? "ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-gray-800" : ""
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Duration & Location */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Duration & Location
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Duration
              </label>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((duration) => (
                  <button
                    key={duration}
                    type="button"
                    onClick={() => setFormData({ ...formData, duration_minutes: duration })}
                    className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1 ${
                      formData.duration_minutes === duration
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    <Clock className="h-4 w-4" />
                    {duration} min
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Location
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {LOCATION_TYPES.map((location) => {
                  const Icon = location.icon;
                  return (
                    <button
                      key={location.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, location_type: location.value })}
                      className={`px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
                        formData.location_type === location.value
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {location.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Scheduling */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Scheduling
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Buffer Before (minutes)
              </label>
              <input
                type="number"
                value={formData.buffer_before || 0}
                onChange={(e) => setFormData({ ...formData, buffer_before: parseInt(e.target.value) || 0 })}
                min={0}
                max={120}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Buffer After (minutes)
              </label>
              <input
                type="number"
                value={formData.buffer_after || 0}
                onChange={(e) => setFormData({ ...formData, buffer_after: parseInt(e.target.value) || 0 })}
                min={0}
                max={120}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Minimum Notice (hours)
              </label>
              <input
                type="number"
                value={formData.min_notice_hours || 0}
                onChange={(e) => setFormData({ ...formData, min_notice_hours: parseInt(e.target.value) || 0 })}
                min={0}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Max Future Days
              </label>
              <input
                type="number"
                value={formData.max_future_days || 60}
                onChange={(e) => setFormData({ ...formData, max_future_days: parseInt(e.target.value) || 60 })}
                min={1}
                max={365}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Custom Questions */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Custom Questions
            </h2>
            <button
              type="button"
              onClick={addQuestion}
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <Plus className="h-4 w-4" />
              Add Question
            </button>
          </div>

          {formData.questions && formData.questions.length > 0 ? (
            <div className="space-y-4">
              {formData.questions.map((question, index) => (
                <div key={question.id} className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 space-y-3">
                      <input
                        type="text"
                        value={question.label}
                        onChange={(e) => updateQuestion(index, { label: e.target.value })}
                        placeholder="Question"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                      <div className="flex items-center gap-4">
                        <select
                          value={question.type}
                          onChange={(e) => updateQuestion(index, { type: e.target.value as any })}
                          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        >
                          <option value="text">Short Text</option>
                          <option value="textarea">Long Text</option>
                          <option value="select">Dropdown</option>
                          <option value="checkbox">Checkbox</option>
                        </select>
                        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                          <input
                            type="checkbox"
                            checked={question.required}
                            onChange={(e) => updateQuestion(index, { required: e.target.checked })}
                            className="rounded border-gray-300 dark:border-gray-600"
                          />
                          Required
                        </label>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeQuestion(index)}
                      className="p-2 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Add custom questions to collect information from invitees
            </p>
          )}
        </div>

        {/* Payment (Optional) */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Payment
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Collect payment when booking
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.payment_enabled}
                onChange={(e) => setFormData({ ...formData, payment_enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {formData.payment_enabled && (
            <div className="flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-gray-400" />
              <input
                type="number"
                value={(formData.payment_amount || 0) / 100}
                onChange={(e) => setFormData({ ...formData, payment_amount: Math.round(parseFloat(e.target.value) * 100) || 0 })}
                min={0}
                step="0.01"
                className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                placeholder="0.00"
              />
              <select
                value={formData.payment_currency}
                onChange={(e) => setFormData({ ...formData, payment_currency: e.target.value })}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          )}
        </div>

        {/* Team Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-gray-400" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Team Event
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Enable for team-based bookings
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_team_event}
                onChange={(e) => setFormData({ ...formData, is_team_event: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {formData.is_team_event && (
            <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-700 dark:text-blue-300">
                    <p className="font-medium mb-1">Team Event Configuration</p>
                    <p className="text-blue-600 dark:text-blue-400">
                      Team members can be assigned to this event type in the{" "}
                      <Link
                        href="/booking/team-calendar"
                        className="underline hover:no-underline"
                      >
                        Team Calendar
                      </Link>{" "}
                      page. Members will receive RSVP invitations for each booking.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Assignment Type
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  How team members are assigned to bookings
                </p>
                <div className="grid gap-2">
                  {ASSIGNMENT_TYPES.map((type) => (
                    <label
                      key={type.value}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        eventType?.assignment_type === type.value
                          ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600"
                          : "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                      }`}
                    >
                      <input
                        type="radio"
                        name="assignment_type"
                        value={type.value}
                        checked={eventType?.assignment_type === type.value}
                        disabled
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {type.label}
                        </span>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {type.description}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Assignment type is configured when creating team event members.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Link
            href="/booking/event-types"
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
