import { api } from "./api";

// Types

export interface EventType {
  id: string;
  workspace_id: string;
  owner_id: string;
  owner?: {
    id: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  location_type: string;
  custom_location: string | null;
  color: string;
  is_active: boolean;
  is_team_event: boolean;
  assignment_type?: "round_robin" | "collective" | "all_hands";
  buffer_before: number;
  buffer_after: number;
  min_notice_hours: number;
  max_future_days: number;
  questions: CustomQuestion[];
  payment_enabled: boolean;
  payment_amount: number | null;
  payment_currency: string;
  confirmation_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomQuestion {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox";
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export interface EventTypeCreate {
  name: string;
  slug: string;
  description?: string | null;
  duration_minutes?: number;
  location_type?: string;
  custom_location?: string | null;
  color?: string;
  is_active?: boolean;
  is_team_event?: boolean;
  buffer_before?: number;
  buffer_after?: number;
  min_notice_hours?: number;
  max_future_days?: number;
  questions?: CustomQuestion[];
  payment_enabled?: boolean;
  payment_amount?: number | null;
  payment_currency?: string;
  confirmation_message?: string | null;
}

export interface EventTypeUpdate {
  name?: string;
  slug?: string;
  description?: string | null;
  duration_minutes?: number;
  location_type?: string;
  custom_location?: string | null;
  color?: string;
  is_active?: boolean;
  is_team_event?: boolean;
  buffer_before?: number;
  buffer_after?: number;
  min_notice_hours?: number;
  max_future_days?: number;
  questions?: CustomQuestion[];
  payment_enabled?: boolean;
  payment_amount?: number | null;
  payment_currency?: string;
  confirmation_message?: string | null;
}

export interface AvailabilitySlot {
  id: string;
  user_id: string;
  workspace_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DayAvailability {
  day_of_week: number;
  day_name: string;
  is_available: boolean;
  slots: AvailabilitySlot[];
}

export interface AvailabilitySchedule {
  user_id: string;
  workspace_id: string;
  timezone: string;
  schedule: DayAvailability[];
}

export interface AvailabilityOverride {
  id: string;
  user_id: string;
  date: string;
  is_available: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingAttendee {
  id: string;
  user_id: string;
  status: "pending" | "confirmed" | "declined";
  responded_at: string | null;
  user?: {
    id: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
}

export interface Booking {
  id: string;
  event_type_id: string;
  workspace_id: string;
  host_id: string | null;
  event_type?: {
    id: string;
    name: string;
    slug: string;
    duration_minutes: number;
    location_type: string;
    color: string;
  };
  host?: {
    id: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
  attendees?: BookingAttendee[];
  invitee_email: string;
  invitee_name: string;
  invitee_phone: string | null;
  start_time: string;
  end_time: string;
  timezone: string;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  location: string | null;
  meeting_link: string | null;
  answers: Record<string, any>;
  cancellation_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  payment_status: "none" | "pending" | "paid" | "refunded" | "failed";
  payment_amount: number | null;
  payment_currency: string | null;
  calendar_event_id: string | null;
  reminder_sent: boolean;
  created_at: string;
  updated_at: string;
}

export interface TimeSlot {
  start_time: string;
  end_time: string;
  available: boolean;
}

export interface CalendarConnection {
  id: string;
  user_id: string;
  workspace_id: string;
  provider: "google" | "microsoft";
  calendar_id: string;
  calendar_name: string;
  account_email: string | null;
  is_primary: boolean;
  sync_enabled: boolean;
  check_conflicts: boolean;
  create_events: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

// Team Availability Types
export interface TimeWindow {
  start: string; // HH:MM format
  end: string; // HH:MM format
}

export interface BusyTime {
  start: string;
  end: string;
  title?: string;
}

export interface DayMemberAvailability {
  date: string; // YYYY-MM-DD format
  windows: TimeWindow[];
  busy_times: BusyTime[];
}

export interface TeamMemberAvailability {
  user_id: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
  availability: DayMemberAvailability[];
}

export interface OverlappingSlot {
  date: string; // YYYY-MM-DD format
  windows: TimeWindow[];
}

export interface TeamBookingBrief {
  id: string;
  event_type_id: string;
  event_name: string | null;
  host_id: string | null;
  host_name: string | null;
  invitee_name: string;
  start_time: string;
  end_time: string;
  status: string;
}

export interface TeamAvailability {
  event_type_id: string | null;
  team_id: string | null;
  start_date: string;
  end_date: string;
  timezone: string;
  members: TeamMemberAvailability[];
  overlapping_slots: OverlappingSlot[];
  bookings: TeamBookingBrief[];
}

// RSVP Types
export interface RSVPBookingDetails {
  booking_id: string;
  event_name: string | null;
  host_name: string | null;
  invitee_name: string;
  invitee_email: string;
  start_time: string;
  end_time: string;
  timezone: string;
  status: string;
  location: string | null;
  meeting_link: string | null;
  attendee_status: string;
  attendee_name: string | null;
}

export interface RSVPResponse {
  success: boolean;
  message: string;
  attendee_status: string;
}

// API functions

export const bookingApi = {
  // Event Types
  eventTypes: {
    list: async (workspaceId: string, params?: { is_active?: boolean; is_team_event?: boolean }) => {
      const response = await api.get(`/workspaces/${workspaceId}/booking/event-types`, { params });
      return response.data as { event_types: EventType[]; total: number };
    },

    listMy: async (workspaceId: string, params?: { is_active?: boolean }) => {
      const response = await api.get(`/workspaces/${workspaceId}/booking/event-types/my`, { params });
      return response.data as { event_types: EventType[]; total: number };
    },

    get: async (workspaceId: string, eventTypeId: string) => {
      const response = await api.get(`/workspaces/${workspaceId}/booking/event-types/${eventTypeId}`);
      return response.data as EventType;
    },

    create: async (workspaceId: string, data: EventTypeCreate) => {
      const response = await api.post(`/workspaces/${workspaceId}/booking/event-types`, data);
      return response.data as EventType;
    },

    update: async (workspaceId: string, eventTypeId: string, data: Partial<EventTypeCreate>) => {
      const response = await api.patch(`/workspaces/${workspaceId}/booking/event-types/${eventTypeId}`, data);
      return response.data as EventType;
    },

    delete: async (workspaceId: string, eventTypeId: string) => {
      await api.delete(`/workspaces/${workspaceId}/booking/event-types/${eventTypeId}`);
    },

    duplicate: async (workspaceId: string, eventTypeId: string, newName?: string) => {
      const response = await api.post(`/workspaces/${workspaceId}/booking/event-types/${eventTypeId}/duplicate`, null, {
        params: { new_name: newName },
      });
      return response.data as EventType;
    },
  },

  // Availability
  availability: {
    get: async (workspaceId: string) => {
      const response = await api.get(`/workspaces/${workspaceId}/booking/availability`);
      return response.data as AvailabilitySchedule;
    },

    update: async (workspaceId: string, data: { timezone: string; slots: Array<{ day_of_week: number; start_time: string; end_time: string }> }) => {
      const response = await api.put(`/workspaces/${workspaceId}/booking/availability`, data);
      return response.data as AvailabilitySchedule;
    },

    listOverrides: async (workspaceId: string, params?: { start_date?: string; end_date?: string }) => {
      const response = await api.get(`/workspaces/${workspaceId}/booking/availability/overrides`, { params });
      return response.data as AvailabilityOverride[];
    },

    createOverride: async (workspaceId: string, data: { date: string; is_available: boolean; start_time?: string; end_time?: string; reason?: string; notes?: string }) => {
      const response = await api.post(`/workspaces/${workspaceId}/booking/availability/overrides`, data);
      return response.data as AvailabilityOverride;
    },

    deleteOverride: async (workspaceId: string, overrideId: string) => {
      await api.delete(`/workspaces/${workspaceId}/booking/availability/overrides/${overrideId}`);
    },
  },

  // Bookings
  bookings: {
    list: async (workspaceId: string, params?: { status?: string; event_type_id?: string; start_date?: string; end_date?: string; limit?: number; offset?: number }) => {
      const response = await api.get(`/workspaces/${workspaceId}/booking/bookings`, { params });
      return response.data as { bookings: Booking[]; total: number };
    },

    listMy: async (workspaceId: string, params?: { status?: string; start_date?: string; end_date?: string; limit?: number; offset?: number }) => {
      const response = await api.get(`/workspaces/${workspaceId}/booking/bookings/my`, { params });
      return response.data as { bookings: Booking[]; total: number };
    },

    getUpcoming: async (workspaceId: string, limit?: number) => {
      const response = await api.get(`/workspaces/${workspaceId}/booking/bookings/upcoming`, { params: { limit } });
      return response.data as Booking[];
    },

    get: async (workspaceId: string, bookingId: string) => {
      const response = await api.get(`/workspaces/${workspaceId}/booking/bookings/${bookingId}`);
      return response.data as Booking;
    },

    cancel: async (workspaceId: string, bookingId: string, reason?: string) => {
      const response = await api.put(`/workspaces/${workspaceId}/booking/bookings/${bookingId}/cancel`, { reason });
      return response.data as Booking;
    },

    reschedule: async (workspaceId: string, bookingId: string, newStartTime: string, timezone: string) => {
      const response = await api.put(`/workspaces/${workspaceId}/booking/bookings/${bookingId}/reschedule`, {
        new_start_time: newStartTime,
        timezone,
      });
      return response.data as Booking;
    },

    markNoShow: async (workspaceId: string, bookingId: string) => {
      const response = await api.put(`/workspaces/${workspaceId}/booking/bookings/${bookingId}/no-show`);
      return response.data as Booking;
    },

    getStats: async (workspaceId: string, params?: { start_date?: string; end_date?: string }) => {
      const response = await api.get(`/workspaces/${workspaceId}/booking/bookings/stats`, { params });
      return response.data;
    },
  },

  // Team Availability
  teamAvailability: {
    get: async (
      workspaceId: string,
      params: {
        start_date: string;
        end_date: string;
        timezone?: string;
        event_type_id?: string;
        team_id?: string;
        user_ids?: string[];
      }
    ) => {
      const queryParams: Record<string, string> = {
        start_date: params.start_date,
        end_date: params.end_date,
        timezone: params.timezone || "UTC",
      };
      if (params.event_type_id) queryParams.event_type_id = params.event_type_id;
      if (params.team_id) queryParams.team_id = params.team_id;
      if (params.user_ids && params.user_ids.length > 0) {
        queryParams.user_ids = params.user_ids.join(",");
      }
      const response = await api.get(`/workspaces/${workspaceId}/booking/availability/team-calendar`, {
        params: queryParams,
      });
      return response.data as TeamAvailability;
    },
  },

  // Calendars
  calendars: {
    list: async (workspaceId: string) => {
      const response = await api.get(`/workspaces/${workspaceId}/booking/calendars`);
      return (response.data.calendars || []) as CalendarConnection[];
    },

    connect: async (workspaceId: string, provider: string) => {
      const response = await api.get(`/workspaces/${workspaceId}/booking/calendars/connect/${provider}`);
      return response.data as { auth_url: string };
    },

    connectGoogle: async (workspaceId: string, authCode: string) => {
      const response = await api.post(`/workspaces/${workspaceId}/booking/calendars/connect/google`, {
        provider: "google",
        auth_code: authCode,
      });
      return response.data as CalendarConnection;
    },

    connectMicrosoft: async (workspaceId: string, authCode: string) => {
      const response = await api.post(`/workspaces/${workspaceId}/booking/calendars/connect/microsoft`, {
        provider: "microsoft",
        auth_code: authCode,
      });
      return response.data as CalendarConnection;
    },

    disconnect: async (workspaceId: string, calendarId: string) => {
      await api.delete(`/workspaces/${workspaceId}/booking/calendars/${calendarId}`);
    },

    sync: async (workspaceId: string, calendarId: string) => {
      const response = await api.post(`/workspaces/${workspaceId}/booking/calendars/${calendarId}/sync`);
      return response.data;
    },

    setPrimary: async (workspaceId: string, calendarId: string) => {
      const response = await api.put(`/workspaces/${workspaceId}/booking/calendars/${calendarId}/primary`);
      return response.data as CalendarConnection;
    },
  },
};

// Team Info for public booking
export interface TeamPublicInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  members: Array<{
    id: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  }>;
}

// Public booking API (no auth required)
export const publicBookingApi = {
  getWorkspaceBookingPage: async (workspaceSlug: string) => {
    const response = await api.get(`/public/book/${workspaceSlug}`);
    return response.data as {
      workspace: { id: string; name: string; slug: string };
      event_types: Array<{ id: string; name: string; slug: string; description: string | null; duration_minutes: number; color: string }>;
    };
  },

  getTeamInfo: async (workspaceSlug: string, teamId: string) => {
    const response = await api.get(`/public/book/${workspaceSlug}/team/${teamId}`);
    return response.data as TeamPublicInfo;
  },

  getTeams: async (workspaceSlug: string) => {
    const response = await api.get(`/public/book/${workspaceSlug}/teams`);
    return response.data as { teams: TeamPublicInfo[] };
  },

  getEventType: async (workspaceSlug: string, eventSlug: string) => {
    const response = await api.get(`/public/book/${workspaceSlug}/${eventSlug}`);
    return response.data as {
      id: string;
      name: string;
      slug: string;
      description: string | null;
      duration_minutes: number;
      location_type: string;
      color: string;
      questions: CustomQuestion[];
      payment_enabled: boolean;
      payment_amount: number | null;
      payment_currency: string;
      host_name: string | null;
      host_avatar_url: string | null;
    };
  },

  getAvailableSlots: async (workspaceSlug: string, eventSlug: string, date: string, timezone: string) => {
    const response = await api.get(`/public/book/${workspaceSlug}/${eventSlug}/slots`, {
      params: { date, timezone },
    });
    return response.data as {
      event_type_id: string;
      date: string;
      timezone: string;
      slots: TimeSlot[];
    };
  },

  getTeamAvailableSlots: async (
    workspaceSlug: string,
    eventSlug: string,
    date: string,
    timezone: string,
    teamId: string,
    memberIds?: string[]
  ) => {
    const params: Record<string, string> = { date, timezone, team_id: teamId };
    if (memberIds && memberIds.length > 0) {
      params.member_ids = memberIds.join(",");
    }
    const response = await api.get(`/public/book/${workspaceSlug}/${eventSlug}/slots`, { params });
    return response.data as {
      event_type_id: string;
      date: string;
      timezone: string;
      slots: TimeSlot[];
    };
  },

  getSlots: async (workspaceSlug: string, eventTypeId: string, date: string, timezone: string) => {
    const response = await api.get(`/public/book/${workspaceSlug}/slots/${eventTypeId}`, {
      params: { date, timezone },
    });
    return response.data as TimeSlot[];
  },

  createBooking: async (
    workspaceSlug: string,
    eventSlug: string,
    data: {
      start_time: string;
      timezone: string;
      name: string;
      email: string;
      phone?: string;
      answers?: Record<string, any>;
      payment_method_id?: string;
    }
  ) => {
    const response = await api.post(`/public/book/${workspaceSlug}/${eventSlug}/book`, data);
    return response.data as {
      id: string;
      event_name: string;
      host_name: string | null;
      host_email: string | null;
      invitee_name: string;
      invitee_email: string;
      start_time: string;
      end_time: string;
      timezone: string;
      status: string;
      location: string | null;
      meeting_link: string | null;
      confirmation_message: string | null;
      can_cancel: boolean;
      can_reschedule: boolean;
      cancel_token: string | null;
    };
  },

  createTeamBooking: async (
    workspaceSlug: string,
    eventSlug: string,
    data: {
      start_time: string;
      timezone: string;
      name: string;
      email: string;
      phone?: string;
      answers?: Record<string, any>;
      team_id: string;
      member_ids?: string[];
      payment_method_id?: string;
    }
  ) => {
    const response = await api.post(`/public/book/${workspaceSlug}/${eventSlug}/book`, data);
    return response.data as {
      id: string;
      event_name: string;
      host_name: string | null;
      host_email: string | null;
      invitee_name: string;
      invitee_email: string;
      start_time: string;
      end_time: string;
      timezone: string;
      status: string;
      location: string | null;
      meeting_link: string | null;
      confirmation_message: string | null;
      can_cancel: boolean;
      can_reschedule: boolean;
      cancel_token: string | null;
    };
  },

  getBooking: async (bookingId: string) => {
    const response = await api.get(`/public/book/booking/${bookingId}`);
    return response.data;
  },

  getBookingConfirmation: async (bookingId: string, token: string) => {
    const response = await api.get(`/public/book/booking/${bookingId}`, { params: { token } });
    return response.data;
  },

  cancelBooking: async (bookingId: string, token: string, reason?: string) => {
    const response = await api.post(`/public/book/booking/${bookingId}/cancel`, { reason }, { params: { token } });
    return response.data;
  },

  rescheduleBooking: async (bookingId: string, token: string, newStartTime: string, timezone: string) => {
    const response = await api.post(
      `/public/book/booking/${bookingId}/reschedule`,
      { new_start_time: newStartTime, timezone },
      { params: { token } }
    );
    return response.data;
  },

  // RSVP
  getRSVPDetails: async (token: string) => {
    const response = await api.get(`/booking/rsvp/${token}`);
    return response.data as RSVPBookingDetails;
  },

  respondToRSVP: async (token: string, accept: boolean) => {
    const response = await api.post(`/booking/rsvp/${token}/respond`, { accept });
    return response.data as RSVPResponse;
  },
};
