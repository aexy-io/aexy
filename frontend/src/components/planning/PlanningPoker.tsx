"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Users,
  Check,
  RotateCcw,
  Eye,
  ChevronRight,
  Loader2,
  HelpCircle,
  Wifi,
  WifiOff,
} from "lucide-react";
import { usePlanningPoker } from "@/hooks/usePlanningPoker";
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
  const {
    state,
    startSession,
    vote,
    reveal,
    reset,
    acceptEstimate,
    nextTask,
    finalize,
  } = usePlanningPoker(sprintId);

  const [selectedVote, setSelectedVote] = useState<VoteValue | null>(null);
  const [finalValue, setFinalValue] = useState<number | null>(null);

  const currentTask = useMemo(() => {
    if (!state.currentTaskId) return null;
    return state.tasks.find((t) => t.id === state.currentTaskId) || null;
  }, [state.currentTaskId, state.tasks]);

  const handleStartSession = async () => {
    try {
      await startSession(userId, userName);
    } catch {
      // Error handled by hook
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
      setSelectedVote(null);
      setFinalValue(null);
      // Auto-advance to next
      setTimeout(() => nextTask(), 500);
    }
  };

  const handleFinalize = async () => {
    try {
      await finalize();
      onClose();
    } catch {
      // Error handled by hook
    }
  };

  // Pre-session: Start button
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

  // Active session
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
        className="bg-muted border border-border rounded-xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-foreground">Planning Poker</h3>
            <span className="text-xs text-muted-foreground bg-accent px-2 py-0.5 rounded-full">
              {state.currentTaskIndex + 1} / {state.totalTasks}
            </span>
            {state.isConnected ? (
              <Wifi className="h-4 w-4 text-emerald-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
          </div>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Current Task */}
        <div className="p-4 border-b border-border">
          {currentTask ? (
            <div>
              <h4 className="text-base font-medium text-foreground mb-1">{currentTask.title}</h4>
              {currentTask.description && (
                <p className="text-sm text-muted-foreground line-clamp-3">{currentTask.description}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No task selected</p>
          )}
        </div>

        {/* Participants */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">Participants:</span>
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
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {FIBONACCI_VALUES.map((value) => (
                <button
                  key={value}
                  onClick={() => handleVote(value)}
                  className={cn(
                    "w-14 h-20 rounded-xl border-2 flex items-center justify-center text-lg font-bold transition-all hover:scale-105",
                    selectedVote === value
                      ? "bg-primary-600 border-primary-500 text-white shadow-lg scale-105"
                      : "bg-background border-border text-foreground hover:border-primary-500/50"
                  )}
                >
                  {value === "?" ? <HelpCircle className="h-5 w-5" /> : value}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Revealed Votes */}
        {state.revealed && (
          <div className="p-4 border-b border-border">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {Object.entries(state.votes).map(([oderId, voteVal]) => {
                const participant = state.participants.find((p) => p.id === oderId);
                return (
                  <div
                    key={oderId}
                    className="flex items-center justify-between p-2 bg-background rounded-lg border border-border"
                  >
                    <span className="text-sm text-foreground truncate">{participant?.name || "Unknown"}</span>
                    <span className="text-lg font-bold text-primary-500 ml-2">
                      {voteVal === "?" ? <HelpCircle className="h-5 w-5" /> : voteVal}
                    </span>
                  </div>
                );
              })}
            </div>

            {state.stats && (
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">
                  Avg: <strong className="text-foreground">{state.stats.average}</strong>
                </span>
                <span className="text-muted-foreground">
                  Range: <strong className="text-foreground">{state.stats.min} - {state.stats.max}</strong>
                </span>
                {state.stats.consensus && (
                  <span className="text-emerald-500 font-medium flex items-center gap-1">
                    <Check className="h-4 w-4" /> Consensus!
                  </span>
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
        <div className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {!state.revealed ? (
              <button
                onClick={handleReveal}
                disabled={state.votedUsers.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                <Eye className="h-4 w-4" />
                Reveal Votes
              </button>
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
              onClick={handleFinalize}
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
      </motion.div>
    </motion.div>
  );
}
