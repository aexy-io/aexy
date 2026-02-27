"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  X,
  Users,
  Check,
  RotateCcw,
  Eye,
  ChevronRight,
  Loader2,
  HelpCircle,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  MessageCircle,
  Send,
} from "lucide-react";
import { usePlanningPoker } from "@/hooks/usePlanningPoker";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const FIBONACCI_VALUES = [1, 2, 3, 5, 8, 13, 21, "?"] as const;
type VoteValue = (typeof FIBONACCI_VALUES)[number];

interface PlanningPokerProps {
  sprintId: string;
  userId: string;
  userName: string;
  onClose: () => void;
}

export function PlanningPoker({
  sprintId,
  userId,
  userName,
  onClose,
}: PlanningPokerProps) {
  const queryClient = useQueryClient();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const {
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
  } = usePlanningPoker(sprintId);

  const [selectedVote, setSelectedVote] = useState<VoteValue | null>(null);
  const [finalValue, setFinalValue] = useState<number | null>(null);
  const [showAddTasks, setShowAddTasks] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [adHocTitle, setAdHocTitle] = useState("");
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [showChat, setShowChat] = useState(true);

  const currentTask = useMemo(() => {
    if (!state.currentTaskId) return null;
    return state.tasks.find((t) => t.id === state.currentTaskId) || null;
  }, [state.currentTaskId, state.tasks]);

  const filteredAvailableTasks = useMemo(() => {
    if (!taskSearch) return state.availableTasks;
    const q = taskSearch.toLowerCase();
    return state.availableTasks.filter(
      (t) => t.title.toLowerCase().includes(q) || t.status.toLowerCase().includes(q)
    );
  }, [state.availableTasks, taskSearch]);

  // Voting progress
  const votedCount = useMemo(
    () => state.participants.filter((p) => p.has_voted).length,
    [state.participants]
  );
  const totalParticipants = state.participants.length;
  const allVotesIn = totalParticipants > 0 && votedCount === totalParticipants;

  // Unestimated tasks count for finalize dialog
  const estimatedTaskIds = useMemo(
    () => new Set(state.results.map((r) => r.task_id)),
    [state.results]
  );
  const unestimatedCount = state.tasks.length - estimatedTaskIds.size;

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.chatMessages.length]);

  const handleToggleAddTasks = () => {
    const next = !showAddTasks;
    setShowAddTasks(next);
    if (next) {
      fetchAvailableTasks();
      setTaskSearch("");
    }
  };

  const handleAddTask = (taskId: string) => {
    addTask(taskId);
  };

  const handleAddAdHoc = () => {
    const title = adHocTitle.trim();
    if (!title) return;
    addTaskByTitle(title);
    setAdHocTitle("");
  };

  const handleStartSession = async () => {
    try {
      await startSession(userId, userName);
    } catch {
      toast.error("Failed to start session");
    }
  };

  const handleVote = (value: VoteValue) => {
    setSelectedVote(value);
    vote(value);
  };

  const handleReveal = () => {
    reveal();
  };

  const handleReset = () => {
    setSelectedVote(null);
    setFinalValue(null);
    reset();
  };

  const handleAcceptEstimate = () => {
    const value = finalValue ?? (state.stats?.average ? Math.round(state.stats.average) : null);
    if (value !== null) {
      acceptEstimate(value);
      toast.success(`Estimate accepted: ${value} pts`);
      setSelectedVote(null);
      setFinalValue(null);
      if (state.currentTaskIndex < state.totalTasks - 1) {
        setTimeout(() => nextTask(), 1200);
      }
    }
  };

  const handleFinalize = async () => {
    try {
      await finalize();
    } catch {
      toast.error("Failed to finalize session");
    }
  };

  const handleClose = () => {
    queryClient.invalidateQueries({ queryKey: ["projectTasks"] });
    queryClient.invalidateQueries({ queryKey: ["sprintTasks"] });
    onClose();
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    sendChat(chatInput);
    setChatInput("");
    chatInputRef.current?.focus();
  };

  // Keyboard shortcuts
  const isActiveSession = !!state.sessionId && !state.finalizeResult && !showFinalizeConfirm;

  const shortcuts = useMemo(() => {
    if (!isActiveSession) return [];

    const fibShortcuts = FIBONACCI_VALUES.slice(0, -1).map((value, index) => ({
      key: String(index + 1),
      callback: () => {
        if (!state.revealed) handleVote(value);
      },
      enabled: !state.revealed,
    }));

    return [
      ...fibShortcuts,
      {
        key: "?",
        shift: true,
        callback: () => {
          if (!state.revealed) handleVote("?");
        },
        enabled: !state.revealed,
      },
      {
        key: "r",
        callback: handleReveal,
        enabled: !state.revealed && state.votedUsers.length > 0,
      },
      {
        key: "Enter",
        callback: handleAcceptEstimate,
        enabled: state.revealed,
      },
      {
        key: "v",
        callback: handleReset,
        enabled: state.revealed,
      },
      {
        key: "Escape",
        callback: handleClose,
        enabled: true,
      },
    ];
  }, [isActiveSession, state.revealed, state.votedUsers.length]);

  useKeyboardShortcuts({
    shortcuts,
    enabled: isActiveSession,
  });

  // Escape to close in pre-session / summary screens
  useEffect(() => {
    if (isActiveSession) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isActiveSession]);

  // ── Session summary screen after finalize ──
  if (state.finalizeResult) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
        onClick={(e) => e.target === e.currentTarget && handleClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="bg-muted border border-border rounded-xl w-full max-w-md p-6 shadow-2xl"
        >
          <div className="text-center mb-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
            >
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
            </motion.div>
            <h3 className="text-xl font-semibold text-foreground">Session Complete</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {state.finalizeResult.updated_tasks.length} tasks estimated &middot;{" "}
              {state.finalizeResult.total_estimated} total points
            </p>
          </div>

          {state.finalizeResult.updated_tasks.length > 0 && (
            <div className="space-y-1.5 max-h-64 overflow-y-auto mb-6">
              {state.finalizeResult.updated_tasks.map((task) => (
                <div
                  key={task.task_id}
                  className="flex items-center justify-between p-2 bg-background rounded-lg border border-border"
                >
                  <span className="text-sm text-foreground truncate flex-1 mr-2">
                    {task.title}
                  </span>
                  <span className="text-sm font-bold text-primary-500 shrink-0">
                    {task.story_points} pts
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleClose}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition"
          >
            Close
          </button>
        </motion.div>
      </motion.div>
    );
  }

  // ── Pre-session: Start button ──
  if (!state.sessionId) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="bg-muted border border-border rounded-xl w-full max-w-md p-6 shadow-2xl"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-foreground">Planning Poker</h3>
            <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition">
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Start a real-time estimation session. Team members can vote on story points
            simultaneously and reach consensus.
          </p>
          <button
            onClick={handleStartSession}
            disabled={state.isStarting}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {state.isStarting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Users className="h-4 w-4" />
            )}
            {state.isStarting ? "Starting..." : "Start Session"}
          </button>
        </motion.div>
      </motion.div>
    );
  }

  // ── Active session — two-column layout ──
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-muted border border-border rounded-xl w-full max-w-5xl shadow-2xl max-h-[90vh] flex flex-col relative"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-lg font-semibold text-foreground">Planning Poker</h3>
            <span className="text-xs text-muted-foreground bg-accent px-2 py-0.5 rounded-full">
              {state.currentTaskIndex + 1} / {state.totalTasks}
            </span>
            <button
              onClick={handleToggleAddTasks}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition",
                showAddTasks
                  ? "bg-primary-600 text-white"
                  : "bg-accent text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Tasks
            </button>
            {state.isConnected ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-amber-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                Reconnecting{state.reconnectAttempt > 0 ? ` (${state.reconnectAttempt})` : ""}...
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowChat(!showChat)}
              className={cn(
                "p-2 rounded-lg transition relative",
                showChat ? "text-primary-500 bg-primary-500/10" : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
              title="Toggle chat"
            >
              <MessageCircle className="h-4 w-4" />
              {state.chatMessages.length > 0 && !showChat && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary-500" />
              )}
            </button>
            <button onClick={handleClose} className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Add Tasks Panel */}
        <AnimatePresence>
          {showAddTasks && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-border shrink-0"
            >
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={adHocTitle}
                    onChange={(e) => setAdHocTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddAdHoc()}
                    placeholder="Quick add task by title..."
                    className="flex-1 px-3 py-1.5 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  <button
                    onClick={handleAddAdHoc}
                    disabled={!adHocTitle.trim()}
                    className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    placeholder="Search backlog tasks..."
                    className="w-full pl-8 pr-3 py-1.5 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {state.isLoadingAvailable ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredAvailableTasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      {taskSearch ? "No matching tasks" : "No available tasks"}
                    </p>
                  ) : (
                    filteredAvailableTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-accent group transition"
                      >
                        <div className="flex-1 min-w-0 mr-2">
                          <p className="text-sm text-foreground truncate">{task.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent border border-border text-muted-foreground">
                              {task.status}
                            </span>
                            {task.story_points != null && (
                              <span className="text-[10px] text-muted-foreground">{task.story_points} pts</span>
                            )}
                            {!task.sprint_id && (
                              <span className="text-[10px] text-amber-500">backlog</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleAddTask(task.id)}
                          className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-primary-500 hover:bg-primary-500/10 opacity-0 group-hover:opacity-100 transition"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Two-column body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: Main estimation area */}
          <div className="flex-1 overflow-y-auto min-w-0">
            {/* Current Task */}
            <div className="p-4 border-b border-border">
              {currentTask ? (
                <div>
                  <h4 className="text-base font-medium text-foreground mb-1">{currentTask.title}</h4>
                  {(currentTask.priority || currentTask.task_type || (currentTask.labels && currentTask.labels.length > 0) || currentTask.story_points != null) && (
                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                      {currentTask.priority && (
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-medium",
                          currentTask.priority === "critical" ? "bg-red-500/15 text-red-500" :
                          currentTask.priority === "high" ? "bg-orange-500/15 text-orange-500" :
                          currentTask.priority === "medium" ? "bg-yellow-500/15 text-yellow-500" :
                          "bg-blue-500/15 text-blue-500"
                        )}>
                          {currentTask.priority}
                        </span>
                      )}
                      {currentTask.task_type && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent border border-border text-muted-foreground">
                          {currentTask.task_type}
                        </span>
                      )}
                      {currentTask.story_points != null && currentTask.story_points > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-500/10 text-primary-500 font-medium">
                          {currentTask.story_points} pts (current)
                        </span>
                      )}
                      {currentTask.labels?.map((label) => (
                        <span key={label} className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500">
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                  {currentTask.description && (
                    <p className="text-sm text-muted-foreground line-clamp-3">{currentTask.description}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No task selected</p>
              )}
            </div>

            {/* Voting progress bar */}
            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground mr-1">
                  {!state.revealed
                    ? `Voted: ${votedCount}/${totalParticipants}`
                    : `Participants: ${totalParticipants}`}
                </span>
                {state.participants.map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border",
                      p.has_voted
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                        : "bg-accent border-border text-muted-foreground"
                    )}
                  >
                    {p.has_voted && <Check className="h-3 w-3" />}
                    {p.name}
                  </div>
                ))}
              </div>
            </div>

            {/* Voting Cards */}
            {!state.revealed && (
              <div className="p-4 border-b border-border">
                <p className="text-xs text-muted-foreground mb-3">Select your estimate:</p>
                <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap">
                  {FIBONACCI_VALUES.map((value) => (
                    <button
                      key={value}
                      onClick={() => handleVote(value)}
                      className={cn(
                        "w-11 h-16 sm:w-14 sm:h-20 rounded-xl border-2 flex items-center justify-center text-base sm:text-lg font-bold transition-all hover:scale-105",
                        selectedVote === value
                          ? "bg-primary-600 border-primary-500 text-white shadow-lg scale-105"
                          : "bg-background border-border text-foreground hover:border-primary-500/50"
                      )}
                    >
                      {value === "?" ? <HelpCircle className="h-4 w-4 sm:h-5 sm:w-5" /> : value}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground/60 text-center mt-2">
                  Press 1-7 to vote &middot; R to reveal &middot; Enter to accept
                </p>
                {selectedVote !== null && !allVotesIn && (
                  <p className="text-xs text-muted-foreground text-center mt-3">
                    Waiting for {totalParticipants - votedCount} more vote{totalParticipants - votedCount !== 1 ? "s" : ""}...
                  </p>
                )}
              </div>
            )}

            {/* Revealed Votes */}
            {state.revealed && (
              <div className="p-4 border-b border-border">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                  {Object.entries(state.votes).map(([oderId, voteVal], index) => {
                    const participant = state.participants.find((p) => p.id === oderId);
                    return (
                      <motion.div
                        key={oderId}
                        initial={{ rotateY: 180, opacity: 0 }}
                        animate={{ rotateY: 0, opacity: 1 }}
                        transition={{ duration: 0.4, delay: index * 0.1 }}
                        className="flex items-center justify-between p-2 bg-background rounded-lg border border-border"
                        style={{ perspective: 600 }}
                      >
                        <span className="text-sm text-foreground truncate">{participant?.name || "Unknown"}</span>
                        <span className="text-lg font-bold text-primary-500 ml-2">
                          {voteVal === "?" ? <HelpCircle className="h-5 w-5" /> : voteVal}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>

                {state.stats && (
                  <div className="flex items-center gap-4 text-sm flex-wrap">
                    <span className="text-muted-foreground">
                      Avg: <strong className="text-foreground">{state.stats.average}</strong>
                    </span>
                    <span className="text-muted-foreground">
                      Range: <strong className="text-foreground">{state.stats.min} - {state.stats.max}</strong>
                    </span>
                    {state.stats.consensus && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 300, damping: 15 }}
                        className="text-emerald-500 font-semibold flex items-center gap-1"
                      >
                        <Check className="h-4 w-4" /> Consensus!
                      </motion.span>
                    )}
                  </div>
                )}

                {/* Final Estimate Selector */}
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground mb-2">Accept estimate:</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {FIBONACCI_VALUES.filter((v) => v !== "?").map((value) => (
                      <button
                        key={value}
                        onClick={() => setFinalValue(value as number)}
                        className={cn(
                          "w-10 h-10 rounded-lg border text-sm font-bold transition",
                          finalValue === value || (!finalValue && state.stats && Math.round(state.stats.average) === value)
                            ? "bg-primary-600 border-primary-500 text-white"
                            : "bg-background border-border text-foreground hover:border-primary-500/50"
                        )}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                {!state.revealed ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleReveal}
                      disabled={state.votedUsers.length === 0}
                      className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                    >
                      <Eye className="h-4 w-4" />
                      Reveal Votes
                    </button>
                    {allVotesIn && (
                      <span className="text-xs text-emerald-500 font-medium bg-emerald-500/10 px-2 py-1 rounded-full">
                        All votes in!
                      </span>
                    )}
                  </div>
                ) : (
                  <>
                    <button
                      onClick={handleAcceptEstimate}
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition"
                    >
                      <Check className="h-4 w-4" />
                      Accept
                    </button>
                    <button
                      onClick={handleReset}
                      className="flex items-center gap-1.5 px-3 py-2 bg-accent hover:bg-muted text-foreground rounded-lg text-sm transition"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Re-vote
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                {state.currentTaskIndex < state.totalTasks - 1 && (
                  <button
                    onClick={() => {
                      setSelectedVote(null);
                      setFinalValue(null);
                      nextTask();
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg text-sm transition"
                  >
                    Skip
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => setShowFinalizeConfirm(true)}
                  disabled={state.isFinalizing || state.results.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 bg-accent hover:bg-muted text-foreground rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {state.isFinalizing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Finalize ({state.results.length})
                </button>
              </div>
            </div>
          </div>

          {/* Right sidebar: Participants + Chat */}
          {showChat && (
            <div className="w-72 border-l border-border flex flex-col shrink-0 hidden sm:flex">
              {/* Online Participants */}
              <div className="p-3 border-b border-border shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">
                    Online ({totalParticipants})
                  </span>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {state.participants.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs"
                    >
                      <span className="relative shrink-0">
                        <span className="flex items-center justify-center h-6 w-6 rounded-full bg-accent text-foreground text-[10px] font-medium uppercase">
                          {p.name.charAt(0)}
                        </span>
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-muted" />
                      </span>
                      <span className="text-foreground truncate flex-1">{p.name}</span>
                      {p.has_voted && !state.revealed && (
                        <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                      )}
                      {state.revealed && state.votes[p.id] !== undefined && (
                        <span className="text-xs font-bold text-primary-500 shrink-0">
                          {state.votes[p.id] === "?" ? "?" : state.votes[p.id]}
                        </span>
                      )}
                      {p.id === userId && (
                        <span className="text-[10px] text-muted-foreground shrink-0">(you)</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Chat */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="px-3 py-2 border-b border-border shrink-0">
                  <span className="text-xs font-medium text-muted-foreground">Team Chat</span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {state.chatMessages.length === 0 && (
                    <p className="text-[10px] text-muted-foreground/50 text-center py-4">
                      No messages yet. Discuss estimates here.
                    </p>
                  )}
                  {state.chatMessages.map((msg, i) => {
                    const isMe = msg.user_id === userId;
                    return (
                      <div key={i} className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
                        {!isMe && (
                          <span className="text-[10px] text-muted-foreground mb-0.5 px-1">{msg.user_name}</span>
                        )}
                        <div
                          className={cn(
                            "px-2.5 py-1.5 rounded-lg text-xs max-w-[200px] break-words",
                            isMe
                              ? "bg-primary-600 text-white"
                              : "bg-accent text-foreground"
                          )}
                        >
                          {msg.text}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>
                <div className="p-2 border-t border-border shrink-0">
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={chatInputRef}
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                      placeholder="Type a message..."
                      className="flex-1 px-2.5 py-1.5 text-xs bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <button
                      onClick={handleSendChat}
                      disabled={!chatInput.trim()}
                      className="p-1.5 text-primary-500 hover:bg-primary-500/10 rounded-lg transition disabled:opacity-30"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Finalize Confirmation Overlay */}
        <AnimatePresence>
          {showFinalizeConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-muted/95 backdrop-blur-sm flex items-center justify-center rounded-xl z-10"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="p-6 max-w-sm text-center"
              >
                <h4 className="text-lg font-semibold text-foreground mb-2">Finalize Session?</h4>
                <p className="text-sm text-muted-foreground mb-1">
                  This will save {state.results.length} estimate{state.results.length !== 1 ? "s" : ""} and end the session.
                </p>
                {unestimatedCount > 0 && (
                  <p className="text-sm text-amber-500 flex items-center justify-center gap-1 mb-4">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {unestimatedCount} task{unestimatedCount !== 1 ? "s" : ""} remain{unestimatedCount === 1 ? "s" : ""} unestimated
                  </p>
                )}
                {unestimatedCount === 0 && <div className="mb-4" />}
                <div className="flex items-center gap-3 justify-center">
                  <button
                    onClick={() => setShowFinalizeConfirm(false)}
                    className="px-4 py-2 bg-accent hover:bg-muted text-foreground rounded-lg text-sm font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setShowFinalizeConfirm(false);
                      handleFinalize();
                    }}
                    disabled={state.isFinalizing}
                    className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                  >
                    {state.isFinalizing && <Loader2 className="h-4 w-4 animate-spin" />}
                    Finalize
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
