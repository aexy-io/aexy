/*
 * Radii are pinned to arbitrary values rather than the `rounded-*` scale.
 * This frame imitates a third-party chat client, so its soft corners are the
 * point; Open Ledger set --radius to 2px and routed xl/2xl/3xl through it,
 * which would have squared the mockup off into something that looks like
 * Aexy rather than like the app Aexy is being used from.
 */
import { ArrowRight, Plug } from "lucide-react";

/**
 * "Use Aexy from ChatGPT" stays abstract until somebody sees a sentence move a
 * card. This is that: a chat turn on the left, the board it changed on the
 * right.
 *
 * Stateless and free of `"use client"` on purpose — the homepage is a client
 * component but `/products/mcp` is a server one, and both want this exact
 * visual. A hook here would make it client-only and force the product page to
 * grow its own copy, which is how two versions of a mock start disagreeing
 * about what the product does.
 *
 * The tool names are real. `aexy_sprints` genuinely exposes `bulk_update_status`
 * and `assign_task` on the remote transport — checked against the generated
 * catalogue rather than invented to look plausible. A mock that shows a tool
 * call nobody can make is a support ticket waiting to happen.
 */

const TOOL_CALLS = [
  "aexy_sprints · bulk_update_status",
  "aexy_sprints · assign_task",
] as const;

const COLUMNS = [
  { name: "Todo", cards: ["Rate-limit the webhook retry"] },
  { name: "In Progress", cards: ["Backfill workspace slugs"] },
  { name: "In Review", cards: [], landed: "Auth refresh drops the session" },
] as const;

export function McpChatPreview() {
  return (
    <div className="relative">
      {/* Semantic hooks, not a fork: the defaults below are the dark look
          /products/mcp has always had; the homepage's .theme-ledger scope
          restyles the frame and hides the glow via globals.css. */}
      <div className="mcp-preview-glow absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-teal-500/16 via-cyan-500/16 to-violet-500/12 blur-2xl" />
      <div className="mcp-preview-frame relative overflow-hidden rounded-[24px] border border-white/10 bg-[#0d0f14] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-white text-black">
              <Plug className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">Your assistant</div>
              <div className="text-xs text-white/42">Connected to Aexy over MCP</div>
            </div>
          </div>
          <div className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
            Connected
          </div>
        </div>

        {/* The ask */}
        <div className="space-y-3 border-b border-white/10 p-4">
          <div className="ml-auto max-w-[85%] rounded-[16px] rounded-br-[6px] bg-white/[0.07] px-4 py-3 text-sm text-white/85">
            Move the auth refresh bug to In Review and assign it to Priya.
          </div>
          <div className="flex flex-wrap gap-2">
            {TOOL_CALLS.map((call) => (
              <span
                key={call}
                className="rounded-[8px] border border-teal-400/20 bg-teal-400/10 px-2.5 py-1 font-mono text-[11px] text-teal-200"
              >
                {call}
              </span>
            ))}
          </div>
          <div className="max-w-[85%] rounded-[16px] rounded-bl-[6px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
            Done — moved to In Review and assigned to Priya.
          </div>
        </div>

        {/* The board it changed */}
        <div className="p-4">
          <div className="mb-3 flex items-center gap-2 text-xs text-white/42">
            Sprint 24 board
            <ArrowRight className="h-3 w-3" />
            <span className="text-white/64">updated just now</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {COLUMNS.map((column) => (
              <div
                key={column.name}
                className="rounded-[16px] border border-white/10 bg-white/[0.025] p-3"
              >
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-white/42">
                  {column.name}
                </div>
                <div className="space-y-2">
                  {column.cards.map((card) => (
                    <div
                      key={card}
                      className="rounded-[12px] border border-white/10 bg-white/[0.04] px-3 py-2 text-xs leading-snug text-white/60"
                    >
                      {card}
                    </div>
                  ))}
                  {"landed" in column && column.landed && (
                    <div className="rounded-[12px] border border-teal-400/30 bg-teal-400/10 px-3 py-2 text-xs leading-snug text-white/85">
                      {column.landed}
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-violet-400/25 text-[9px] font-semibold text-violet-100">
                          P
                        </span>
                        <span className="text-[11px] text-white/48">Priya</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
