"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { publicBookingApi } from "@/lib/booking-api";
import { toast } from "sonner";
import {
  Calendar,
  Clock,
  Users,
} from "lucide-react";
import Link from "next/link";

interface WorkspaceInfo {
  id: string;
  name: string;
  slug: string;
}

interface EventTypeSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  color: string;
}

export default function WorkspaceBookingPage() {
  const params = useParams();
  const workspaceSlug = params.workspaceSlug as string;

  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [eventTypes, setEventTypes] = useState<EventTypeSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkspaceData();
  }, [workspaceSlug]);

  const loadWorkspaceData = async () => {
    try {
      const data = await publicBookingApi.getWorkspaceBookingPage(workspaceSlug);
      setWorkspace(data.workspace);
      setEventTypes(data.event_types);
    } catch (error) {
      toast.error("Workspace not found");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Workspace Not Found
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            This booking page doesn&apos;t exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {workspace.name}
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Select an event type to book a meeting
          </p>
        </div>

        {/* Event Types List */}
        {eventTypes.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-12 text-center">
            <Calendar className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              No Event Types Available
            </h2>
            <p className="text-gray-500 dark:text-gray-400">
              There are no event types available for booking at this time.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {eventTypes.map((eventType) => (
              <Link
                key={eventType.id}
                href={`/book/${workspaceSlug}/${eventType.slug}`}
                className="block"
              >
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow border-l-4"
                     style={{ borderLeftColor: eventType.color }}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                        {eventType.name}
                      </h2>
                      {eventType.description && (
                        <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">
                          {eventType.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {eventType.duration_minutes} min
                        </span>
                      </div>
                    </div>
                    <div
                      className="w-3 h-12 rounded-full ml-4"
                      style={{ backgroundColor: eventType.color }}
                    />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-8">
          Powered by Aexy
        </p>
      </div>
    </div>
  );
}
