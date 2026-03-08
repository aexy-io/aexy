import { useQuery } from "@tanstack/react-query";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

// Types

export interface DeliveryEvent {
  id: string;
  channel: string;
  status: string;
  provider: string | null;
  provider_message_id: string | null;
  event_metadata: Record<string, unknown>;
  event_timestamp: string;
  created_at: string;
}

export interface ChannelDeliveryStatus {
  channel: string;
  current_status: string;
  events: DeliveryEvent[];
}

export interface NotificationWithDelivery {
  id: string;
  event_type: string;
  title: string;
  body: string;
  created_at: string;
  is_read: boolean;
  channels: Record<string, string>;
}

export interface PaginatedDeliveryStatus {
  items: NotificationWithDelivery[];
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
}

export interface ChannelStats {
  channel: string;
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_clicked: number;
  total_failed: number;
  total_bounced: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
}

export interface DeliveryStatsResponse {
  channels: ChannelStats[];
  overall_delivery_rate: number;
  total_notifications: number;
  period_start: string | null;
  period_end: string | null;
}

export interface DeliveryTimelineResponse {
  notification_id: string;
  channels: Record<string, ChannelDeliveryStatus>;
}

// Filters

export interface DeliveryFilters {
  channel?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  per_page?: number;
}

// API functions

async function fetchDeliveryStatus(filters: DeliveryFilters): Promise<PaginatedDeliveryStatus> {
  const params = new URLSearchParams();
  if (filters.channel) params.set("channel", filters.channel);
  if (filters.status) params.set("status", filters.status);
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);
  params.set("page", String(filters.page || 1));
  params.set("per_page", String(filters.per_page || 20));

  const res = await fetch(`${API_URL}/notification-delivery/?${params}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch delivery status: ${res.status}`);
  return res.json();
}

async function fetchDeliveryTimeline(notificationId: string): Promise<DeliveryTimelineResponse> {
  const res = await fetch(`${API_URL}/notification-delivery/${notificationId}/timeline`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch timeline: ${res.status}`);
  return res.json();
}

async function fetchDeliveryStats(dateFrom?: string, dateTo?: string): Promise<DeliveryStatsResponse> {
  const params = new URLSearchParams();
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);

  const res = await fetch(`${API_URL}/notification-delivery/stats/aggregate?${params}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`);
  return res.json();
}

// Hooks

export function useDeliveryStatus(filters: DeliveryFilters) {
  return useQuery({
    queryKey: ["notification-delivery", "list", filters],
    queryFn: () => fetchDeliveryStatus(filters),
    staleTime: 30_000,
  });
}

export function useDeliveryTimeline(notificationId: string | null) {
  return useQuery({
    queryKey: ["notification-delivery", "timeline", notificationId],
    queryFn: () => fetchDeliveryTimeline(notificationId!),
    enabled: !!notificationId,
    staleTime: 30_000,
  });
}

export function useDeliveryStats(dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ["notification-delivery", "stats", dateFrom, dateTo],
    queryFn: () => fetchDeliveryStats(dateFrom, dateTo),
    staleTime: 60_000,
  });
}
