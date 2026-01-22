"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import {
  Calendar,
  Clock,
  MapPin,
  Video,
  User,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import { publicBookingApi, RSVPBookingDetails } from "@/lib/booking-api";
import { toast } from "sonner";

export default function RSVPPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [details, setDetails] = useState<RSVPBookingDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [responded, setResponded] = useState(false);

  useEffect(() => {
    if (token) {
      loadDetails();
    }
  }, [token]);

  const loadDetails = async () => {
    try {
      const data = await publicBookingApi.getRSVPDetails(token);
      setDetails(data);

      // Check if already responded
      if (data.attendee_status !== "pending") {
        setResponded(true);
      }
    } catch (err: any) {
      console.error("Failed to load RSVP details:", err);
      setError(
        err.response?.data?.detail ||
          "This RSVP link is invalid or has expired."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRespond = async (accept: boolean) => {
    setSubmitting(true);
    try {
      const response = await publicBookingApi.respondToRSVP(token, accept);
      toast.success(response.message);
      setResponded(true);
      setDetails((prev) =>
        prev
          ? {
              ...prev,
              attendee_status: response.attendee_status,
            }
          : null
      );
    } catch (err: any) {
      console.error("Failed to respond to RSVP:", err);
      toast.error(
        err.response?.data?.detail || "Failed to submit your response"
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Invalid RSVP Link
          </h1>
          <p className="text-gray-500 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!details) return null;

  const startDate = parseISO(details.start_time);
  const endDate = parseISO(details.end_time);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-lg mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 text-white p-6">
            <h1 className="text-xl font-semibold mb-1">Meeting Invitation</h1>
            <p className="text-blue-100 text-sm">
              You&apos;ve been invited to attend this meeting
            </p>
          </div>

          {/* Meeting details */}
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {details.event_name || "Team Meeting"}
            </h2>

            <div className="space-y-3 mb-6">
              {/* Date & Time */}
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <div className="text-gray-900 dark:text-white font-medium">
                    {format(startDate, "EEEE, MMMM d, yyyy")}
                  </div>
                  <div className="text-gray-500 dark:text-gray-400 text-sm">
                    {format(startDate, "h:mm a")} - {format(endDate, "h:mm a")}{" "}
                    ({details.timezone})
                  </div>
                </div>
              </div>

              {/* Host */}
              {details.host_name && (
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-gray-400" />
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 text-sm">
                      Hosted by
                    </span>{" "}
                    <span className="text-gray-900 dark:text-white">
                      {details.host_name}
                    </span>
                  </div>
                </div>
              )}

              {/* Location */}
              {(details.location || details.meeting_link) && (
                <div className="flex items-start gap-3">
                  {details.meeting_link ? (
                    <Video className="h-5 w-5 text-gray-400 mt-0.5" />
                  ) : (
                    <MapPin className="h-5 w-5 text-gray-400 mt-0.5" />
                  )}
                  <div>
                    {details.meeting_link ? (
                      <a
                        href={details.meeting_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700"
                      >
                        Join Video Call
                      </a>
                    ) : (
                      <span className="text-gray-900 dark:text-white">
                        {details.location}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Invitee */}
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-gray-400" />
                <div>
                  <span className="text-gray-500 dark:text-gray-400 text-sm">
                    Guest:
                  </span>{" "}
                  <span className="text-gray-900 dark:text-white">
                    {details.invitee_name}
                  </span>
                </div>
              </div>
            </div>

            {/* Response section */}
            {responded ? (
              <div
                className={`p-4 rounded-lg ${
                  details.attendee_status === "confirmed"
                    ? "bg-green-50 dark:bg-green-900/20"
                    : "bg-red-50 dark:bg-red-900/20"
                }`}
              >
                <div className="flex items-center gap-3">
                  {details.attendee_status === "confirmed" ? (
                    <>
                      <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                      <div>
                        <p className="font-medium text-green-700 dark:text-green-400">
                          You&apos;ve accepted this invitation
                        </p>
                        <p className="text-sm text-green-600 dark:text-green-500">
                          This meeting has been added to your schedule
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                      <div>
                        <p className="font-medium text-red-700 dark:text-red-400">
                          You&apos;ve declined this invitation
                        </p>
                        <p className="text-sm text-red-600 dark:text-red-500">
                          The host will be notified of your response
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : details.status === "cancelled" ? (
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700">
                <p className="text-gray-600 dark:text-gray-400 text-center">
                  This meeting has been cancelled
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-gray-600 dark:text-gray-400 text-sm text-center mb-4">
                  Will you be attending this meeting?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleRespond(true)}
                    disabled={submitting}
                    className="flex-1 py-3 px-4 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle className="h-5 w-5" />
                        Accept
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleRespond(false)}
                    disabled={submitting}
                    className="flex-1 py-3 px-4 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <XCircle className="h-5 w-5" />
                        Decline
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {details.attendee_name
                ? `Invitation for ${details.attendee_name}`
                : "You received this because you are a team member for this event"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
