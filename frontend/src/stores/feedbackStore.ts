/**
 * Whether the feedback composer is open, and what it opens with.
 *
 * A store rather than local state because the composer is opened from places
 * that have nothing to do with each other — the user menu, the command palette,
 * and the access grid's "Contact support" on an app we gate. Threading a prop
 * from a layout down to each of those would be worse than a store.
 */

import { create } from "zustand";
import type { FeedbackKind } from "@/lib/api";

export interface FeedbackPrefill {
  kind?: FeedbackKind;
  subject?: string;
  body?: string;
  /** Merged into the context the composer shows the author before sending. */
  context?: Record<string, unknown>;
}

interface FeedbackState {
  isOpen: boolean;
  prefill: FeedbackPrefill | null;
  open: (prefill?: FeedbackPrefill) => void;
  close: () => void;
}

export const useFeedbackStore = create<FeedbackState>()((set) => ({
  isOpen: false,
  prefill: null,
  open: (prefill) => set({ isOpen: true, prefill: prefill ?? null }),
  close: () => set({ isOpen: false, prefill: null }),
}));
