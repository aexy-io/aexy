import { useState, useEffect, useCallback } from "react";
import {
  googleIntegrationApi,
  GoogleIntegrationStatus,
  SyncedEmail,
  SyncedCalendarEvent,
  GoogleCalendar,
} from "@/lib/api";

/**
 * Hook for Google integration connection status
 */
export function useGoogleIntegrationStatus(workspaceId: string | null) {
  const [status, setStatus] = useState<GoogleIntegrationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await googleIntegrationApi.getStatus(workspaceId);
      setStatus(data);
    } catch (err) {
      console.error("Failed to get Google integration status:", err);
      setError("Failed to load integration status");
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, isLoading, error, refresh };
}

/**
 * Hook for connecting/disconnecting Google integration
 */
export function useGoogleIntegrationConnect(workspaceId: string | null) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const connect = useCallback(
    async (_scopes?: ("gmail" | "calendar")[]) => {
      if (!workspaceId) return;
      setIsConnecting(true);
      try {
        const { auth_url } = await googleIntegrationApi.getConnectUrl(workspaceId);
        window.location.href = auth_url;
      } catch (err) {
        console.error("Failed to get connect URL:", err);
        setIsConnecting(false);
        throw err;
      }
    },
    [workspaceId]
  );

  const disconnect = useCallback(async () => {
    if (!workspaceId) return;
    setIsDisconnecting(true);
    try {
      await googleIntegrationApi.disconnect(workspaceId);
    } catch (err) {
      console.error("Failed to disconnect:", err);
      throw err;
    } finally {
      setIsDisconnecting(false);
    }
  }, [workspaceId]);

  return { connect, disconnect, isConnecting, isDisconnecting };
}

/**
 * Hook for listing and managing synced emails
 */
export function useGoogleEmails(workspaceId: string | null) {
  const [emails, setEmails] = useState<SyncedEmail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEmails = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await googleIntegrationApi.gmail.listEmails(workspaceId);
      setEmails(data.emails);
    } catch (err) {
      console.error("Failed to load emails:", err);
      setError("Failed to load emails");
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  const syncEmails = useCallback(async () => {
    if (!workspaceId) return;
    setIsSyncing(true);
    setError(null);
    try {
      await googleIntegrationApi.gmail.sync(workspaceId);
      await loadEmails();
    } catch (err) {
      console.error("Failed to sync emails:", err);
      setError("Failed to sync emails");
    } finally {
      setIsSyncing(false);
    }
  }, [workspaceId, loadEmails]);

  const getEmail = useCallback(
    async (emailId: string) => {
      if (!workspaceId) return null;
      try {
        return await googleIntegrationApi.gmail.getEmail(workspaceId, emailId);
      } catch (err) {
        console.error("Failed to get email:", err);
        return null;
      }
    },
    [workspaceId]
  );

  const sendEmail = useCallback(
    async (data: {
      to: string;
      subject: string;
      body_html: string;
      reply_to_message_id?: string;
    }) => {
      if (!workspaceId) throw new Error("No workspace");
      return await googleIntegrationApi.gmail.sendEmail(workspaceId, data);
    },
    [workspaceId]
  );

  const linkToRecord = useCallback(
    async (emailId: string, recordId: string, linkType?: string) => {
      if (!workspaceId) throw new Error("No workspace");
      return await googleIntegrationApi.gmail.linkEmailToRecord(
        workspaceId,
        emailId,
        { record_id: recordId, link_type: linkType }
      );
    },
    [workspaceId]
  );

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  return {
    emails,
    isLoading,
    isSyncing,
    error,
    refresh: loadEmails,
    sync: syncEmails,
    getEmail,
    sendEmail,
    linkToRecord,
  };
}

/**
 * Hook for listing and managing synced calendar events
 */
export function useGoogleCalendarEvents(workspaceId: string | null) {
  const [events, setEvents] = useState<SyncedCalendarEvent[]>([]);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await googleIntegrationApi.calendar.listEvents(workspaceId);
      setEvents(data.events);
    } catch (err) {
      console.error("Failed to load events:", err);
      setError("Failed to load calendar events");
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  const loadCalendars = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const data = await googleIntegrationApi.calendar.listCalendars(workspaceId);
      setCalendars(data.calendars);
    } catch (err) {
      console.error("Failed to load calendars:", err);
    }
  }, [workspaceId]);

  const syncEvents = useCallback(async () => {
    if (!workspaceId) return;
    setIsSyncing(true);
    setError(null);
    try {
      await googleIntegrationApi.calendar.sync(workspaceId);
      await loadEvents();
    } catch (err) {
      console.error("Failed to sync events:", err);
      setError("Failed to sync calendar");
    } finally {
      setIsSyncing(false);
    }
  }, [workspaceId, loadEvents]);

  const getEvent = useCallback(
    async (eventId: string) => {
      if (!workspaceId) return null;
      try {
        return await googleIntegrationApi.calendar.getEvent(workspaceId, eventId);
      } catch (err) {
        console.error("Failed to get event:", err);
        return null;
      }
    },
    [workspaceId]
  );

  const createEvent = useCallback(
    async (data: {
      calendar_id: string;
      title: string;
      start_time: string;
      end_time: string;
      description?: string;
      location?: string;
      attendee_emails?: string[];
    }) => {
      if (!workspaceId) throw new Error("No workspace");
      const result = await googleIntegrationApi.calendar.createEvent(workspaceId, data);
      await loadEvents(); // Refresh list
      return result;
    },
    [workspaceId, loadEvents]
  );

  const linkToRecord = useCallback(
    async (eventId: string, recordId: string, linkType?: string) => {
      if (!workspaceId) throw new Error("No workspace");
      return await googleIntegrationApi.calendar.linkEventToRecord(
        workspaceId,
        eventId,
        { record_id: recordId, link_type: linkType }
      );
    },
    [workspaceId]
  );

  useEffect(() => {
    loadEvents();
    loadCalendars();
  }, [loadEvents, loadCalendars]);

  return {
    events,
    calendars,
    isLoading,
    isSyncing,
    error,
    refresh: loadEvents,
    sync: syncEvents,
    getEvent,
    createEvent,
    linkToRecord,
  };
}
