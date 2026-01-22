"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWorkspace } from "@/hooks/useWorkspace";
import { bookingApi } from "@/lib/booking-api";
import { toast } from "sonner";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function CalendarCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentWorkspace } = useWorkspace();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleCallback();
  }, [searchParams, currentWorkspace?.id]);

  const handleCallback = async () => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const errorParam = searchParams.get("error");

    // Handle OAuth error
    if (errorParam) {
      setStatus("error");
      setError(searchParams.get("error_description") || "Authorization was denied");
      return;
    }

    if (!code) {
      setStatus("error");
      setError("No authorization code received");
      return;
    }

    // Parse state to get workspace ID and provider
    // State format: "workspaceId:provider"
    let workspaceId = currentWorkspace?.id;
    let provider = "google"; // default

    if (state) {
      const [stateWorkspaceId, stateProvider] = state.split(":");
      if (stateWorkspaceId) workspaceId = stateWorkspaceId;
      if (stateProvider) provider = stateProvider;
    }

    if (!workspaceId) {
      // Wait for workspace to load
      if (!currentWorkspace) {
        return;
      }
      workspaceId = currentWorkspace.id;
    }

    try {
      // Exchange code for tokens and create connection
      if (provider === "google") {
        await bookingApi.calendars.connectGoogle(workspaceId, code);
      } else if (provider === "microsoft") {
        await bookingApi.calendars.connectMicrosoft(workspaceId, code);
      }

      setStatus("success");
      toast.success("Calendar connected successfully!");

      // Redirect back to calendars page after a short delay
      setTimeout(() => {
        router.push("/booking/calendars");
      }, 1500);
    } catch (err: any) {
      console.error("Failed to connect calendar:", err);
      setStatus("error");
      setError(err.response?.data?.detail || "Failed to connect calendar");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        {status === "loading" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Connecting Calendar
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Please wait while we connect your calendar...
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Calendar Connected!
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Redirecting you back to settings...
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Connection Failed
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {error || "An error occurred while connecting your calendar."}
            </p>
            <button
              onClick={() => router.push("/booking/calendars")}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Back to Calendars
            </button>
          </>
        )}
      </div>
    </div>
  );
}
