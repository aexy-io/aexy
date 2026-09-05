"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

/**
 * Collaborative editing against the server's copy of the document.
 *
 * What this replaces
 * ------------------
 *
 * The previous hook built its own WebSocket client, its own JSON message
 * envelope, and its own "token":
 *
 *     const token = `${userId}:${userName}:${userEmail || ""}`;
 *
 * The server split that on `:` and believed it. There was no signature, no
 * session, and no check that the person had any business opening the document
 * — so anybody who knew a document id could read every keystroke on it and
 * appear in the participant list as whoever they liked.
 *
 * It was also lossy when nobody was attacking it. Every client created an
 * empty `Y.Doc` and then seeded it by calling `setContent()` with the REST
 * body, so two people opening one page each inserted the *whole document* into
 * their own Yjs history and the merge duplicated the content.
 *
 * Now: the real bearer token, and `y-websocket` speaking the standard
 * y-protocol against a server that holds the document. The client never seeds
 * the `Y.Doc` from REST — it syncs, and whatever comes back is the document.
 * `synced` is what the editor waits for before rendering, because an empty
 * `Y.Doc` before the first sync looks exactly like an empty document.
 */

export interface CollaborationUser {
  id: string;
  name: string;
  color: string;
  avatarUrl?: string | null;
}

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

interface UseCollaborationOptions {
  documentId: string;
  /** Bearer token — the same one the REST client sends. */
  token: string | null;
  userName: string;
  userColor: string;
  avatarUrl?: string | null;
  enabled?: boolean;
}

interface UseCollaborationReturn {
  ydoc: Y.Doc | null;
  provider: WebsocketProvider | null;
  /**
   * Whether the server's state has arrived. The editor must not render — or
   * worse, autosave — before this: an unsynced `Y.Doc` is empty, and writing
   * it back would blank the document.
   */
  synced: boolean;
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  /** Set when the server refused the connection outright, with its reason. */
  error: string | null;
  /**
   * The refusal is expected behaviour, not a fault — a space that reviews
   * changes. Rendered as an explanation rather than a warning, and the editor
   * stays fully usable.
   */
  reviewedSpace: boolean;
  /** False when the server admitted us read-only. */
  canWrite: boolean;
  users: CollaborationUser[];
  reconnect: () => void;
}

/** Close codes the server sends. 4001/4003/4004 are ours; see api/collaboration.py. */
const CLOSE_REASONS: Record<number, string> = {
  4001: "Your session has expired. Reload the page to sign in again.",
  4003: "You have read-only access to this document.",
  4004: "This document is no longer available.",
  // Not an error. This space reviews changes before publishing, so there is no
  // shared room to join — the document is perfectly editable, and a save
  // becomes a proposal for a reviewer.
  4005: "Changes in this space are reviewed before publishing, so live editing is off. Your edits are saved as a proposal.",
};

/** Codes that will never succeed on retry, so the provider must stop trying. */
const FATAL_CODES = new Set([4001, 4003, 4004, 4005]);

/** Codes that describe how the document works rather than something going wrong. */
const INFORMATIONAL_CODES = new Set([4005]);

function websocketBase(): string {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
  return apiUrl.replace(/^http/, "ws").replace(/\/$/, "");
}

export function useCollaboration({
  documentId,
  token,
  userName,
  userColor,
  avatarUrl,
  enabled = true,
}: UseCollaborationOptions): UseCollaborationReturn {
  const [synced, setSynced] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [canWrite, setCanWrite] = useState(true);
  const [reviewedSpace, setReviewedSpace] = useState(false);
  const [users, setUsers] = useState<CollaborationUser[]>([]);
  const [generation, setGeneration] = useState(0);

  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);

  useEffect(() => {
    if (!enabled || !documentId || !token) {
      setConnectionStatus("disconnected");
      return;
    }

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // y-websocket joins `serverUrl` and `roomName` with a slash and appends
    // `params` as a query string, which is exactly the shape of the endpoint:
    // /api/v1/collaboration/ws/{document_id}?token=…
    const provider = new WebsocketProvider(
      `${websocketBase()}/collaboration/ws`,
      documentId,
      ydoc,
      { params: { token }, connect: true }
    );
    providerRef.current = provider;
    setConnectionStatus("connecting");

    provider.awareness.setLocalStateField("user", {
      name: userName,
      color: userColor,
      avatarUrl: avatarUrl ?? null,
    });

    const onStatus = ({ status }: { status: string }) => {
      setConnectionStatus(
        status === "connected"
          ? "connected"
          : status === "connecting"
            ? "connecting"
            : "disconnected"
      );
    };

    const onSync = (isSynced: boolean) => {
      setSynced(isSynced);
      if (isSynced) setError(null);
    };

    const onClose = (event: CloseEvent) => {
      const reason = CLOSE_REASONS[event.code];
      if (!reason) return;

      setError(reason);
      if (event.code === 4003) setCanWrite(false);
      if (INFORMATIONAL_CODES.has(event.code)) setReviewedSpace(true);

      if (FATAL_CODES.has(event.code)) {
        // y-websocket reconnects with backoff by default, which for a refusal
        // means retrying forever against an answer that will not change —
        // and, for an expired token, hammering the endpoint until the tab is
        // closed.
        provider.shouldConnect = false;
        provider.disconnect();
        setConnectionStatus("error");
      }
    };

    const onAwareness = () => {
      const states = Array.from(
        provider.awareness.getStates().entries()
      ) as [number, { user?: CollaborationUser }][];
      setUsers(
        states
          .filter(([clientId]) => clientId !== ydoc.clientID)
          .map(([clientId, state]) => ({
            id: String(clientId),
            name: state.user?.name || "Someone",
            color: state.user?.color || "#94a3b8",
            avatarUrl: state.user?.avatarUrl ?? null,
          }))
      );
    };

    provider.on("status", onStatus);
    provider.on("sync", onSync);
    provider.on("connection-close", onClose);
    provider.awareness.on("change", onAwareness);

    return () => {
      provider.off("status", onStatus);
      provider.off("sync", onSync);
      provider.off("connection-close", onClose);
      provider.awareness.off("change", onAwareness);
      provider.destroy();
      ydoc.destroy();
      ydocRef.current = null;
      providerRef.current = null;
      setSynced(false);
      setUsers([]);
    };
    // `generation` is the reconnect handle: bumping it tears the provider down
    // and builds a fresh one, which is the only way back from a fatal close.
  }, [documentId, token, enabled, userName, userColor, avatarUrl, generation]);

  const reconnect = useCallback(() => {
    setError(null);
    setCanWrite(true);
    setReviewedSpace(false);
    setGeneration((n) => n + 1);
  }, []);

  return {
    ydoc: ydocRef.current,
    provider: providerRef.current,
    synced,
    isConnected: connectionStatus === "connected",
    connectionStatus,
    error,
    canWrite,
    reviewedSpace,
    users,
    reconnect,
  };
}

/** A stable colour per person, matching the server's palette. */
export function getUserColor(id: string): string {
  const palette = [
    "#f87171",
    "#fb923c",
    "#fbbf24",
    "#a3e635",
    "#34d399",
    "#22d3ee",
    "#60a5fa",
    "#a78bfa",
    "#f472b6",
  ];
  let sum = 0;
  for (const char of id) sum += char.charCodeAt(0);
  return palette[sum % palette.length];
}
