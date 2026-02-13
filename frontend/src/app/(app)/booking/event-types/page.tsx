"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { bookingApi, EventType } from "@/lib/booking-api";
import Link from "next/link";
import {
  Calendar,
  Clock,
  Video,
  MapPin,
  Phone,
  Plus,
  MoreVertical,
  Copy,
  Edit,
  Trash2,
  Users,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";

export default function EventTypesPage() {
  const { currentWorkspace } = useWorkspace();
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    if (currentWorkspace?.id) {
      loadEventTypes();
    }
  }, [currentWorkspace?.id]);

  const loadEventTypes = async () => {
    if (!currentWorkspace?.id) return;

    try {
      const data = await bookingApi.eventTypes.listMy(currentWorkspace.id);
      setEventTypes(data.event_types);
    } catch (error) {
      console.error("Failed to load event types:", error);
      toast.error("Failed to load event types");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = (eventType: EventType) => {
    const link = `${window.location.origin}/book/${currentWorkspace?.slug}/${eventType.slug}`;
    navigator.clipboard.writeText(link);
    toast.success("Booking link copied!");
    setMenuOpen(null);
  };

  const toggleActive = async (eventType: EventType) => {
    if (!currentWorkspace?.id) return;

    try {
      await bookingApi.eventTypes.update(currentWorkspace.id, eventType.id, {
        is_active: !eventType.is_active,
      });
      await loadEventTypes();
      toast.success(eventType.is_active ? "Event type deactivated" : "Event type activated");
    } catch (error) {
      toast.error("Failed to update event type");
    }
    setMenuOpen(null);
  };

  const duplicateEventType = async (eventType: EventType) => {
    if (!currentWorkspace?.id) return;

    try {
      await bookingApi.eventTypes.duplicate(currentWorkspace.id, eventType.id);
      await loadEventTypes();
      toast.success("Event type duplicated");
    } catch (error) {
      toast.error("Failed to duplicate event type");
    }
    setMenuOpen(null);
  };

  const deleteEventType = async (eventType: EventType) => {
    if (!currentWorkspace?.id) return;
    if (!confirm(`Are you sure you want to delete "${eventType.name}"?`)) return;

    try {
      await bookingApi.eventTypes.delete(currentWorkspace.id, eventType.id);
      await loadEventTypes();
      toast.success("Event type deleted");
    } catch (error) {
      toast.error("Failed to delete event type");
    }
    setMenuOpen(null);
  };

  const getLocationIcon = (locationType: string) => {
    switch (locationType) {
      case "zoom":
      case "google_meet":
      case "microsoft_teams":
        return <Video className="h-4 w-4" />;
      case "phone":
        return <Phone className="h-4 w-4" />;
      case "in_person":
        return <MapPin className="h-4 w-4" />;
      default:
        return <Video className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Event Types</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Create and manage your bookable event types
          </p>
        </div>
        <Link
          href="/booking/event-types/new"
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New Event Type
        </Link>
      </div>

      {/* Event Types Grid */}
      {eventTypes.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Calendar className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No event types yet
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
            Event types are the different kinds of meetings you offer. Create one to start accepting bookings.
          </p>
          <Link
            href="/booking/event-types/new"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Create Your First Event Type
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {eventTypes.map((eventType) => (
            <div
              key={eventType.id}
              className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${
                !eventType.is_active ? "opacity-60" : ""
              }`}
            >
              <div className="flex">
                <div
                  className="w-2"
                  style={{ backgroundColor: eventType.color }}
                />
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between">
                    <Link
                      href={`/booking/event-types/${eventType.id}`}
                      className="flex-1"
                    >
                      <h3 className="font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400">
                        {eventType.name}
                      </h3>
                      {eventType.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                          {eventType.description}
                        </p>
                      )}
                    </Link>

                    {/* Menu */}
                    <div className="relative ml-2">
                      <button
                        onClick={() => setMenuOpen(menuOpen === eventType.id ? null : eventType.id)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>

                      {menuOpen === eventType.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setMenuOpen(null)}
                          />
                          <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20">
                            <button
                              onClick={() => copyLink(eventType)}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                            >
                              <Copy className="h-4 w-4" />
                              Copy Link
                            </button>
                            <Link
                              href={`/booking/event-types/${eventType.id}`}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                              onClick={() => setMenuOpen(null)}
                            >
                              <Edit className="h-4 w-4" />
                              Edit
                            </Link>
                            <button
                              onClick={() => duplicateEventType(eventType)}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                            >
                              <Copy className="h-4 w-4" />
                              Duplicate
                            </button>
                            <button
                              onClick={() => toggleActive(eventType)}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                            >
                              {eventType.is_active ? (
                                <>
                                  <EyeOff className="h-4 w-4" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <Eye className="h-4 w-4" />
                                  Activate
                                </>
                              )}
                            </button>
                            <hr className="my-1 border-gray-200 dark:border-gray-700" />
                            <button
                              onClick={() => deleteEventType(eventType)}
                              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Meta info */}
                  <div className="flex items-center gap-4 mt-3 text-sm text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {eventType.duration_minutes} min
                    </span>
                    <span className="flex items-center gap-1">
                      {getLocationIcon(eventType.location_type)}
                      {eventType.location_type.replace("_", " ")}
                    </span>
                    {eventType.is_team_event && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        Team
                      </span>
                    )}
                  </div>

                  {/* Status badges */}
                  <div className="flex items-center gap-2 mt-3">
                    {!eventType.is_active && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                        Inactive
                      </span>
                    )}
                    {eventType.payment_enabled && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                        ${((eventType.payment_amount || 0) / 100).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
