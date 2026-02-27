"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { sprintApi } from "@/lib/api";

interface Participant {
  id: string;
  name: string;
  avatar_url?: string;
  has_voted: boolean;
}

interface PokerResult {
  task_id: string;
  votes: Record<string, number | string>;
  final_estimate: number;
  at: string;
}

interface VoteStats {
  average: number;
  min: number;
  max: number;
  consensus: boolean;
}

export interface PokerState {
  sessionId: string | null;
  sprintId: string;
  tasks: { id: string; title: string; description: string | null }[];
  currentTaskId: string | null;
  currentTaskIndex: number;
  totalTasks: number;
  votes: Record<string, number | string>;
  votedUsers: string[];
  revealed: boolean;
  participants: Participant[];
  results: PokerResult[];
  stats: VoteStats | null;
  isConnected: boolean;
  isStarting: boolean;
  isFinalizing: boolean;
}

export function usePlanningPoker(sprintId: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const [state, setState] = useState<PokerState>({
    sessionId: null,
    sprintId,
    tasks: [],
    currentTaskId: null,
    currentTaskIndex: 0,
    totalTasks: 0,
    votes: {},
    votedUsers: [],
    revealed: false,
    participants: [],
    results: [],
    stats: null,
    isConnected: false,
    isStarting: false,
    isFinalizing: false,
  });

  const connectWebSocket = useCallback(
    (sessionId: string, userId: string, userName: string) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = process.env.NEXT_PUBLIC_WS_URL || `${protocol}//localhost:8000`;
      const wsUrl = `${host}/api/v1/sprints/${sprintId}/planning-poker/${sessionId}/ws?token=&user_id=${userId}&user_name=${encodeURIComponent(userName)}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setState((prev) => ({ ...prev, isConnected: true }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "state":
            setState((prev) => ({
              ...prev,
              currentTaskId: data.current_task_id,
              currentTaskIndex: data.current_task_index,
              totalTasks: data.total_tasks,
              revealed: data.revealed,
              participants: data.participants || [],
              results: data.results || [],
              votes: data.votes || {},
              votedUsers: data.voted_users || [],
            }));
            break;

          case "vote_cast":
            setState((prev) => ({
              ...prev,
              votedUsers: data.voted_users || [],
              participants: data.participants || prev.participants,
            }));
            break;

          case "votes_revealed":
            setState((prev) => ({
              ...prev,
              revealed: true,
              votes: data.votes || {},
              stats: data.stats || null,
              participants: data.participants || prev.participants,
            }));
            break;

          case "votes_reset":
            setState((prev) => ({
              ...prev,
              votes: {},
              votedUsers: [],
              revealed: false,
              stats: null,
              currentTaskId: data.current_task_id,
              participants: data.participants || prev.participants,
            }));
            break;

          case "estimate_accepted":
            setState((prev) => ({
              ...prev,
              results: [
                ...prev.results,
                {
                  task_id: data.task_id,
                  votes: prev.votes,
                  final_estimate: data.final_estimate,
                  at: new Date().toISOString(),
                },
              ],
            }));
            break;

          case "next_task":
            setState((prev) => ({
              ...prev,
              currentTaskId: data.current_task_id,
              currentTaskIndex: data.current_task_index,
              totalTasks: data.total_tasks,
              votes: {},
              votedUsers: [],
              revealed: false,
              stats: null,
              participants: data.participants || prev.participants,
            }));
            break;

          case "session_complete":
            setState((prev) => ({
              ...prev,
              results: data.results || prev.results,
            }));
            break;

          case "participant_joined":
          case "participant_left":
            setState((prev) => ({
              ...prev,
              participants: data.participants || prev.participants,
            }));
            break;
        }
      };

      ws.onclose = () => {
        setState((prev) => ({ ...prev, isConnected: false }));
        // Reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.CLOSED) {
            connectWebSocket(sessionId, userId, userName);
          }
        }, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    },
    [sprintId]
  );

  const startSession = useCallback(
    async (userId: string, userName: string) => {
      setState((prev) => ({ ...prev, isStarting: true }));
      try {
        const result = await sprintApi.startPokerSession(sprintId);
        setState((prev) => ({
          ...prev,
          sessionId: result.session_id,
          tasks: result.tasks,
          totalTasks: result.total_tasks,
          currentTaskId: result.tasks[0]?.id || null,
          isStarting: false,
        }));
        connectWebSocket(result.session_id, userId, userName);
        return result.session_id;
      } catch (error) {
        setState((prev) => ({ ...prev, isStarting: false }));
        throw error;
      }
    },
    [sprintId, connectWebSocket]
  );

  const vote = useCallback((value: number | string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "vote", value }));
    }
  }, []);

  const reveal = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "reveal" }));
    }
  }, []);

  const reset = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "reset" }));
    }
  }, []);

  const acceptEstimate = useCallback((value: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "final_estimate", value }));
    }
  }, []);

  const nextTask = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "next_task" }));
    }
  }, []);

  const finalize = useCallback(async () => {
    if (!state.sessionId) return;
    setState((prev) => ({ ...prev, isFinalizing: true }));
    try {
      const result = await sprintApi.finalizePokerSession(sprintId, state.sessionId);
      setState((prev) => ({ ...prev, isFinalizing: false }));
      return result;
    } catch (error) {
      setState((prev) => ({ ...prev, isFinalizing: false }));
      throw error;
    }
  }, [sprintId, state.sessionId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return {
    state,
    startSession,
    vote,
    reveal,
    reset,
    acceptEstimate,
    nextTask,
    finalize,
  };
}
