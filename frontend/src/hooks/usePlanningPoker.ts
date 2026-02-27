"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
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

export interface AvailableTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  story_points: number | null;
  sprint_id: string | null;
}

export interface FinalizeResult {
  finalized: boolean;
  updated_tasks: { task_id: string; title: string; story_points: number }[];
  total_estimated: number;
}

export interface ChatMessage {
  user_id: string;
  user_name: string;
  text: string;
  timestamp: string;
}

export interface PokerState {
  sessionId: string | null;
  sprintId: string;
  tasks: {
    id: string;
    title: string;
    description: string | null;
    priority: string | null;
    task_type: string | null;
    labels: string[];
    story_points: number | null;
    status: string | null;
  }[];
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
  availableTasks: AvailableTask[];
  isLoadingAvailable: boolean;
  reconnectAttempt: number;
  finalizeResult: FinalizeResult | null;
  chatMessages: ChatMessage[];
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
    availableTasks: [],
    isLoadingAvailable: false,
    reconnectAttempt: 0,
    finalizeResult: null,
    chatMessages: [],
  });

  const connectWebSocket = useCallback(
    (sessionId: string, userId: string, userName: string) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = process.env.NEXT_PUBLIC_WS_URL || `${protocol}//localhost:8000`;
      const authToken = typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";
      const wsUrl = `${host}/api/v1/sprints/${sprintId}/planning-poker/${sessionId}/ws?token=${encodeURIComponent(authToken)}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setState((prev) => ({ ...prev, isConnected: true, reconnectAttempt: 0 }));
      };

      ws.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          console.error("Failed to parse WebSocket message");
          return;
        }

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

          case "task_added":
            setState((prev) => {
              const newTask = data.task;
              const alreadyExists = prev.tasks.some((t) => t.id === newTask.id);
              const updatedTasks = alreadyExists ? prev.tasks : [...prev.tasks, newTask];
              return {
                ...prev,
                tasks: updatedTasks,
                totalTasks: data.total_tasks ?? updatedTasks.length,
                availableTasks: prev.availableTasks.filter((t) => t.id !== newTask.id),
                currentTaskId: prev.currentTaskId ?? newTask.id,
              };
            });
            break;

          case "session_complete":
            setState((prev) => ({
              ...prev,
              results: data.results || prev.results,
            }));
            break;

          case "participant_joined":
            setState((prev) => ({
              ...prev,
              participants: data.participants || prev.participants,
            }));
            if (data.user?.name || data.user_name) {
              toast(`${data.user?.name || data.user_name} joined the session`);
            }
            break;

          case "participant_left":
            setState((prev) => ({
              ...prev,
              participants: data.participants || prev.participants,
            }));
            if (data.user?.name || data.user_name) {
              toast(`${data.user?.name || data.user_name} left the session`);
            }
            break;

          case "chat":
            setState((prev) => ({
              ...prev,
              chatMessages: [...prev.chatMessages, {
                user_id: data.user_id,
                user_name: data.user_name,
                text: data.text,
                timestamp: data.timestamp,
              }],
            }));
            break;

          case "error":
            toast.error(data.message || "An error occurred");
            break;
        }
      };

      ws.onclose = (event) => {
        setState((prev) => {
          const attempt = prev.reconnectAttempt + 1;
          const MAX_RECONNECT_ATTEMPTS = 10;

          // Don't reconnect if closed intentionally (4001 = auth failure) or max attempts reached
          if (event.code === 4001 || attempt > MAX_RECONNECT_ATTEMPTS) {
            if (attempt > MAX_RECONNECT_ATTEMPTS) {
              toast.error("Connection lost. Please refresh the page.");
            }
            return { ...prev, isConnected: false, reconnectAttempt: attempt };
          }

          // Exponential backoff: 1s, 2s, 4s, 8s, ... capped at 30s
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.CLOSED) {
              connectWebSocket(sessionId, userId, userName);
            }
          }, delay);

          return { ...prev, isConnected: false, reconnectAttempt: attempt };
        });
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

  const addTask = useCallback(
    (taskId: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "add_task", task_id: taskId }));
      }
    },
    []
  );

  const addTaskByTitle = useCallback(
    (title: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "add_task", title }));
      }
    },
    []
  );

  const sendChat = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && text.trim()) {
      wsRef.current.send(JSON.stringify({ type: "chat", text: text.trim() }));
    }
  }, []);

  const fetchAvailableTasks = useCallback(async () => {
    if (!state.sessionId) return;
    setState((prev) => ({ ...prev, isLoadingAvailable: true }));
    try {
      const result = await sprintApi.getAvailableTasks(sprintId, state.sessionId);
      setState((prev) => ({
        ...prev,
        availableTasks: result.tasks,
        isLoadingAvailable: false,
      }));
    } catch {
      setState((prev) => ({ ...prev, isLoadingAvailable: false }));
      toast.error("Failed to load available tasks");
    }
  }, [sprintId, state.sessionId]);

  const finalize = useCallback(async () => {
    if (!state.sessionId) return;
    setState((prev) => ({ ...prev, isFinalizing: true }));
    try {
      const result = await sprintApi.finalizePokerSession(sprintId, state.sessionId);
      setState((prev) => ({
        ...prev,
        isFinalizing: false,
        finalizeResult: result as FinalizeResult,
      }));
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
    addTask,
    addTaskByTitle,
    fetchAvailableTasks,
    finalize,
    sendChat,
  };
}
