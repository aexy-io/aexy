"use client";

import { getApiErrorMessage } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { agentsApi } from "@/lib/api";

/**
 * Server-side wizard draft persistence (UX-DEF-003).
 *
 * The wizard already saves to `localStorage` (UX-WIZ-001) for the
 * same-browser-Cmd+R case. This hook layers a cross-device draft on
 * top:
 *
 *   1. On mount, fetch the server draft. If it's newer than the
 *      local draft (or local is absent), surface it to the caller.
 *   2. Whenever the caller calls `save(payload)`, debounce + PUT to
 *      the server. Frontend keeps writing through localStorage
 *      independently so the cross-device path doesn't block on a
 *      slow network round-trip.
 *   3. On successful agent creation, the caller fires `clear()`
 *      which DELETEs the server draft + lets localStorage's own
 *      clear handle the same-browser path.
 *
 * The hook returns a `serverDraft` snapshot for the wizard's "Resumed
 * from another device" toast and `lastSavedAt` for the live "saved
 * 3s ago" indicator. `isSaving` lets the UI dim the save indicator
 * during in-flight writes.
 *
 * Failure modes:
 *  - GET 404 on mount → no draft, no error
 *  - PUT 401/403 → caller's existing API interceptor handles auth;
 *    we surface the error via `error` so the wizard can render a
 *    "couldn't sync to cloud — local draft only" warning.
 */
export interface ServerAgentDraft {
  id: string;
  payload: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

interface UseAgentDraftReturn {
  /** The most recently fetched / saved server draft. Null when
   *  no server draft exists. */
  serverDraft: ServerAgentDraft | null;
  /** True while the initial GET is in flight. */
  isLoading: boolean;
  /** True while a PUT is in flight. */
  isSaving: boolean;
  /** Most recent error from any of get/save/delete. Cleared on next
   *  successful op. */
  error: string | null;
  /** ISO string of the last successful save. Drives the "saved Xs
   *  ago" indicator. */
  lastSavedAt: string | null;
  /** Debounced save. Coalesces rapid-fire calls (typing) into one
   *  network round-trip. */
  save: (payload: Record<string, unknown>) => void;
  /** Clear the server draft. Idempotent. Caller fires this after
   *  a successful agent creation. */
  clear: () => Promise<void>;
}

const SAVE_DEBOUNCE_MS = 1200;

export function useAgentDraft(
  workspaceId: string | null,
  /** When false (e.g. wizard closed), the hook stays inert — no
   *  network calls. */
  enabled = true,
): UseAgentDraftReturn {
  const [serverDraft, setServerDraft] = useState<ServerAgentDraft | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Refs so the save closure stays stable across renders. Caller
  // should be able to fire `save(payload)` on every keystroke
  // without re-creating the debounce timer.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPayloadRef = useRef<Record<string, unknown> | null>(null);
  // Tracks the most recently issued save so a slow in-flight request
  // can't overwrite state after a faster newer one finished — and so
  // saves that resolve after unmount silently no-op instead of
  // triggering React's "set state on unmounted component" warning.
  const saveSeqRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Initial fetch.
  useEffect(() => {
    if (!enabled || !workspaceId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    agentsApi
      .getAgentDraft(workspaceId)
      .then((draft) => {
        if (cancelled) return;
        setServerDraft(draft);
        if (draft?.updated_at) setLastSavedAt(draft.updated_at);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(getApiErrorMessage(err, "Failed to load draft"));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, workspaceId]);

  // Clean up the debounce timer on unmount + flush any pending save
  // so a navigation away doesn't lose the most recent keystroke. The
  // saveSeqRef bump invalidates any in-flight non-flushed save so its
  // late-arriving result can't fight the flush we're about to issue.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        const pending = pendingPayloadRef.current;
        pendingPayloadRef.current = null;
        if (pending && workspaceId) {
          saveSeqRef.current++;
          // Fire-and-forget — we're unmounting, can't surface the
          // result anywhere useful. The bumped seq makes sure if the
          // hook remounts before this resolves, its save() calls
          // override this one.
          agentsApi.saveAgentDraft(workspaceId, pending).catch(() => {
            // Silent — user's already left.
          });
        }
      }
    };
  }, [workspaceId]);

  const save = useCallback(
    (payload: Record<string, unknown>) => {
      if (!enabled || !workspaceId) return;
      pendingPayloadRef.current = payload;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        saveTimerRef.current = null;
        const next = pendingPayloadRef.current;
        if (!next) return;
        pendingPayloadRef.current = null;
        const seq = ++saveSeqRef.current;
        setIsSaving(true);
        try {
          const draft = await agentsApi.saveAgentDraft(workspaceId, next);
          // Discard stale results: a newer save (or unmount) makes
          // this one obsolete and applying it would flicker the UI
          // back to older state.
          if (!mountedRef.current || seq !== saveSeqRef.current) return;
          setServerDraft(draft);
          if (draft.updated_at) setLastSavedAt(draft.updated_at);
          setError(null);
        } catch (err) {
          if (!mountedRef.current || seq !== saveSeqRef.current) return;
          setError(getApiErrorMessage(err, "Save failed"));
        } finally {
          if (mountedRef.current && seq === saveSeqRef.current) {
            setIsSaving(false);
          }
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [enabled, workspaceId],
  );

  const clear = useCallback(async () => {
    if (!workspaceId) return;
    // Cancel any pending save first so it doesn't re-create the
    // row we're about to delete.
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    pendingPayloadRef.current = null;
    try {
      await agentsApi.deleteAgentDraft(workspaceId);
      setServerDraft(null);
      setLastSavedAt(null);
      setError(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "Clear failed"));
    }
  }, [workspaceId]);

  return {
    serverDraft,
    isLoading,
    isSaving,
    error,
    lastSavedAt,
    save,
    clear,
  };
}
