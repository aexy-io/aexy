"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";

interface CollaborationUser {
  id: string;
  name: string;
  email?: string;
  color: string;
  cursor?: { anchor: number; head: number } | null;
  selection?: { anchor: number; head: number } | null;
  lastActive?: string;
}

interface CollaborationState {
  isConnected: boolean;
  users: CollaborationUser[];
  connectionStatus: "connecting" | "connected" | "disconnected" | "error";
  error: string | null;
}

interface UseCollaborationOptions {
  documentId: string;
  userId: string;
  userName: string;
  userEmail?: string;
  onSync?: (data: unknown) => void;
  onUpdate?: (data: unknown) => void;
  enabled?: boolean;
}

interface UseCollaborationReturn extends CollaborationState {
  ydoc: Y.Doc | null;
  provider: WebSocketProvider | null;
  sendUpdate: (data: unknown) => void;
  updateAwareness: (cursor?: { anchor: number; head: number } | null, selection?: { anchor: number; head: number } | null) => void;
  disconnect: () => void;
  reconnect: () => void;
}

class WebSocketProvider {
  private ws: WebSocket | null = null;
  private documentId: string;
  private token: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private onMessage: (data: unknown) => void;
  private onStatusChange: (status: "connecting" | "connected" | "disconnected" | "error") => void;
  private onUsersChange: (users: CollaborationUser[]) => void;
  private baseUrl: string;
  private hadError = false;
  private isDestroyed = false;

  constructor(
    documentId: string,
    token: string,
    onMessage: (data: unknown) => void,
    onStatusChange: (status: "connecting" | "connected" | "disconnected" | "error") => void,
    onUsersChange: (users: CollaborationUser[]) => void
  ) {
    this.documentId = documentId;
    this.token = token;
    this.onMessage = onMessage;
    this.onStatusChange = onStatusChange;
    this.onUsersChange = onUsersChange;

    // Determine WebSocket URL based on environment
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    this.baseUrl = apiUrl.replace(/^http/, "ws");
  }

  connect() {
    if (this.isDestroyed) {
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.hadError = false;
    this.onStatusChange("connecting");

    // Build WebSocket URL - remove /api/v1 suffix from base URL and add correct path
    const wsBaseUrl = this.baseUrl.replace(/\/api\/v1$/, "");
    const wsUrl = `${wsBaseUrl}/api/v1/collaboration/ws/${this.documentId}?token=${encodeURIComponent(this.token)}`;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (error) {
      console.error("Failed to create WebSocket:", error);
      this.onStatusChange("error");
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.hadError = false;
      this.onStatusChange("connected");
      this.startPing();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    this.ws.onclose = (event) => {
      this.stopPing();
      this.ws = null;

      if (this.isDestroyed) {
        return;
      }

      if (event.code === 4001) {
        // Authentication error - don't reconnect
        this.onStatusChange("error");
        return;
      }

      // If we had an error, don't auto-reconnect (user can manually reconnect)
      if (this.hadError) {
        this.onStatusChange("error");
        return;
      }

      this.onStatusChange("disconnected");
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.hadError = true;
      this.onStatusChange("error");
    };
  }

  private handleMessage(data: { type: string; users?: CollaborationUser[]; [key: string]: unknown }) {
    switch (data.type) {
      case "connected":
        if (data.users) {
          this.onUsersChange(data.users);
        }
        break;
      case "awareness":
        if (data.users) {
          this.onUsersChange(data.users);
        }
        break;
      case "sync":
      case "update":
        this.onMessage(data);
        break;
      case "pong":
        // Heartbeat received
        break;
      case "error":
        console.error("WebSocket error:", data.message);
        break;
    }
  }

  private startPing() {
    this.pingInterval = setInterval(() => {
      this.send({ type: "ping" });
    }, 30000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.onStatusChange("error");
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  sendSync(syncData: unknown) {
    this.send({ type: "sync", data: syncData });
  }

  sendUpdate(updateData: unknown) {
    this.send({ type: "update", data: updateData });
  }

  sendAwareness(cursor?: { anchor: number; head: number } | null, selection?: { anchor: number; head: number } | null) {
    this.send({ type: "awareness", cursor, selection });
  }

  disconnect() {
    this.isDestroyed = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.stopPing();

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws.close();
      this.ws = null;
    }
  }

  reconnect() {
    this.isDestroyed = false;
    this.hadError = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.stopPing();

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }

    this.reconnectAttempts = 0;
    this.connect();
  }
}

export function useCollaboration({
  documentId,
  userId,
  userName,
  userEmail,
  onSync,
  onUpdate,
  enabled = true,
}: UseCollaborationOptions): UseCollaborationReturn {
  const [state, setState] = useState<CollaborationState>({
    isConnected: false,
    users: [],
    connectionStatus: "disconnected",
    error: null,
  });

  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebSocketProvider | null>(null);

  // Store callbacks in refs to avoid effect re-runs
  const onSyncRef = useRef(onSync);
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onSyncRef.current = onSync;
    onUpdateRef.current = onUpdate;
  }, [onSync, onUpdate]);

  // Create token from user info - memoize to prevent effect re-runs
  const token = useMemo(
    () => `${userId}:${userName}:${userEmail || ""}`,
    [userId, userName, userEmail]
  );

  const handleMessage = useCallback((data: unknown) => {
    const msg = data as { type: string; data?: unknown };
    if (msg.type === "sync" && onSyncRef.current) {
      onSyncRef.current(msg.data);
    } else if (msg.type === "update" && onUpdateRef.current) {
      onUpdateRef.current(msg.data);
    }
  }, []);

  const handleStatusChange = useCallback(
    (status: "connecting" | "connected" | "disconnected" | "error") => {
      setState((prev) => ({
        ...prev,
        connectionStatus: status,
        isConnected: status === "connected",
        error: status === "error" ? "Connection failed" : null,
      }));
    },
    []
  );

  const handleUsersChange = useCallback((users: CollaborationUser[]) => {
    setState((prev) => ({ ...prev, users }));
  }, []);

  // Initialize Yjs document and provider
  useEffect(() => {
    if (!enabled || !documentId) {
      return;
    }

    // Create Yjs document
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Create WebSocket provider
    const provider = new WebSocketProvider(
      documentId,
      token,
      handleMessage,
      handleStatusChange,
      handleUsersChange
    );
    providerRef.current = provider;

    // Connect
    provider.connect();

    return () => {
      provider.disconnect();
      ydoc.destroy();
      ydocRef.current = null;
      providerRef.current = null;
    };
  // Only reconnect when documentId, token, or enabled changes
  // Callbacks are stable due to useCallback with empty deps
  }, [documentId, token, enabled]);

  const sendUpdate = useCallback((data: unknown) => {
    providerRef.current?.sendUpdate(data);
  }, []);

  const updateAwareness = useCallback(
    (cursor?: { anchor: number; head: number } | null, selection?: { anchor: number; head: number } | null) => {
      providerRef.current?.sendAwareness(cursor, selection);
    },
    []
  );

  const disconnect = useCallback(() => {
    providerRef.current?.disconnect();
  }, []);

  const reconnect = useCallback(() => {
    providerRef.current?.reconnect();
  }, []);

  return {
    ...state,
    ydoc: ydocRef.current,
    provider: providerRef.current,
    sendUpdate,
    updateAwareness,
    disconnect,
    reconnect,
  };
}

// Utility to get a deterministic color for a user
export function getUserColor(userId: string): string {
  const colors = [
    "#f87171", // red
    "#fb923c", // orange
    "#fbbf24", // amber
    "#a3e635", // lime
    "#34d399", // emerald
    "#22d3ee", // cyan
    "#60a5fa", // blue
    "#a78bfa", // violet
    "#f472b6", // pink
  ];
  const hash = userId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}
