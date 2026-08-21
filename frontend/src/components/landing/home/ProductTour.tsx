"use client";

import { useState } from "react";
import Image, { type StaticImageData } from "next/image";
import sellShot from "../../../../public/marketing/home/home-sell@2x.webp";
import buildShot from "../../../../public/marketing/home/home-build@2x.webp";
import operateShot from "../../../../public/marketing/home/home-operate@2x.webp";
import growShot from "../../../../public/marketing/home/home-grow@2x.webp";
import knowShot from "../../../../public/marketing/home/home-know@2x.webp";

// The product tour: five tabs, one dark "plate" per pillar. A client island
// for the tab state only — the pane content is plain markup.
//
// Each pillar renders a real screenshot when one exists in
// public/marketing/home/ (add a static import to SHOTS below — static imports
// give width/height/blurDataURL for free, so no layout shift) and falls back
// to a coded schematic otherwise. Schematics are deliberately stylized: they
// state the shape of the surface without pretending to be a screenshot.
// Capture pipeline: e2e/tools/capture-marketing-shots.ts (needs the
// docker-compose stack running).

type TourKey = "sell" | "build" | "operate" | "grow" | "know";

const SHOTS: Partial<Record<TourKey, { src: StaticImageData; alt: string }>> = {
  sell: { src: sellShot, alt: "Aexy CRM deals table with stages, values, and linked companies" },
  build: { src: buildShot, alt: "Aexy sprint board with tasks across status columns and a sprint goal" },
  operate: { src: operateShot, alt: "Aexy automations with real triggers, actions, and run history" },
  grow: { src: growShot, alt: "Aexy performance reviews with an active quarterly cycle" },
  know: { src: knowShot, alt: "Aexy docs workspace with runbooks, templates, and doc-impact tracking" },
};

const TABS: Array<{
  key: TourKey;
  tab: string;
  figure: string;
  caption: string;
  bullets: string[];
}> = [
  {
    key: "sell",
    tab: "Sell",
    figure: "FIG. 03",
    caption: "CRM record, agent-enriched",
    bullets: ["Schema-less CRM", "Visitor ID & lead scoring", "Sequences & routing", "Customer health"],
  },
  {
    key: "build",
    tab: "Build",
    figure: "FIG. 04",
    caption: "Sprint board, GitHub-synced",
    bullets: ["Sprint lifecycle", "Commit & PR auto-linking", "Developer insights", "Release readiness"],
  },
  {
    key: "operate",
    tab: "Operate",
    figure: "FIG. 05",
    caption: "Workflow, branching on record state",
    bullets: ["No-code triggers", "Branching workflows", "Alert → ticket automation", "Audit trails"],
  },
  {
    key: "grow",
    tab: "Grow",
    figure: "FIG. 06",
    caption: "Review cycle, AI-assessed",
    bullets: ["360 reviews", "AI assessments", "Learning paths", "Skill gaps"],
  },
  {
    key: "know",
    tab: "Know",
    figure: "FIG. 07",
    caption: "Knowledge graph over company docs",
    bullets: ["Rich docs", "AI metadata", "Knowledge graph", "MCP tools"],
  },
];

export function ProductTour() {
  const [active, setActive] = useState<TourKey>("sell");
  const current = TABS.find((t) => t.key === active)!;
  const shot = SHOTS[active];

  return (
    <div className="mt-10">
      <div className="flex flex-wrap gap-2 border-b border-ledger-ink/12">
        {TABS.map(({ key, tab }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActive(key)}
            className={`-mb-px border-b-2 px-4 py-2.5 font-brand-mono text-xs font-medium uppercase tracking-[0.14em] transition ${
              active === key
                ? "border-ledger-green text-ledger-ink"
                : "border-transparent text-ledger-ink/50 hover:text-ledger-ink"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div key={active} className="tour-fade mt-8 grid gap-8 lg:grid-cols-[1fr_0.55fr] lg:items-start">
        <figure>
          <div className="overflow-hidden rounded-[4px] border border-ledger-ink/25 bg-ledger-pane text-[#E6EDE7]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <span className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/55">
                {current.figure} — {current.caption}
              </span>
              <span className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-mint">Live</span>
            </div>
            {shot ? (
              <Image
                src={shot.src}
                alt={shot.alt}
                placeholder="blur"
                sizes="(min-width: 1024px) 60vw, 100vw"
                className="w-full"
              />
            ) : (
              <Schematic kind={active} />
            )}
          </div>
          <figcaption className="mt-2.5 font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-ink/45">
            {current.caption}
          </figcaption>
        </figure>

        <div className="space-y-2 lg:pt-2">
          {current.bullets.map((bullet) => (
            <div key={bullet} className="flex items-center gap-2 border-b border-ledger-ink/12 pb-2 text-sm text-ledger-ink/75">
              <span className="font-brand-mono text-ledger-green">+</span>
              {bullet}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// -- coded schematics ---------------------------------------------------------

function PaneCard({ title, meta, accent }: { title: string; meta: string; accent?: boolean }) {
  return (
    <div className={`rounded-[2px] border px-3 py-2.5 ${accent ? "border-ledger-mint/40 bg-ledger-mint/10" : "border-white/12"}`}>
      <div className="text-xs leading-snug text-white/80">{title}</div>
      <div className="mt-1 font-brand-mono text-[10px] text-white/45">{meta}</div>
    </div>
  );
}

function Schematic({ kind }: { kind: TourKey }) {
  if (kind === "sell") {
    return (
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <div className="text-sm font-medium text-white/90">Northwind Traders</div>
            <div className="font-brand-mono text-[10px] text-white/45">deal · $48k · negotiation</div>
          </div>
          <div className="font-brand-mono text-[10px] uppercase tracking-wide text-ledger-mint">score 86</div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <PaneCard title="Visited /pricing 3×" meta="visitor id · today" />
          <PaneCard title="Reply drafted for renewal thread" meta="agent · policy ok" accent />
          <PaneCard title="Eng shipped SSO they asked for" meta="linked from sprint 24" />
        </div>
      </div>
    );
  }
  if (kind === "build") {
    return (
      <div className="grid gap-2 p-4 sm:grid-cols-3">
        {[
          { col: "Todo", items: ["Rate-limit webhook retry"] },
          { col: "In progress", items: ["Backfill workspace slugs"] },
          { col: "In review", items: ["Auth refresh drops session"] },
        ].map(({ col, items }, i) => (
          <div key={col} className="rounded-[2px] border border-white/12 p-3">
            <div className="mb-2 font-brand-mono text-[10px] uppercase tracking-wide text-white/45">{col}</div>
            {items.map((item) => (
              <PaneCard key={item} title={item} meta={i === 2 ? "PR #412 linked" : "sprint 24"} accent={i === 2} />
            ))}
          </div>
        ))}
      </div>
    );
  }
  if (kind === "operate") {
    return (
      <div className="p-4">
        <div className="flex flex-col gap-2">
          <PaneCard title="Trigger — uptime alert fires" meta="monitor · api.aexy.io" />
          <div className="ml-4 border-l border-white/15 pl-4">
            <PaneCard title="Branch — is a customer affected?" meta="reads CRM + tickets" />
          </div>
          <div className="ml-8 grid gap-2 border-l border-white/15 pl-4 sm:grid-cols-2">
            <PaneCard title="Open ticket, tag urgent" meta="yes → service desk" accent />
            <PaneCard title="Log incident only" meta="no → docs" />
          </div>
        </div>
      </div>
    );
  }
  if (kind === "grow") {
    return (
      <div className="grid gap-2 p-4 sm:grid-cols-2">
        <PaneCard title="Q3 engineering review cycle" meta="12 of 14 submitted" />
        <PaneCard title="Skill gap: incident response" meta="ai assessment · 3 devs" accent />
        <PaneCard title="Learning path assigned" meta="on-call fundamentals" />
        <PaneCard title="360 feedback window open" meta="closes friday" />
      </div>
    );
  }
  return (
    <div className="p-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <PaneCard title="Incident runbook" meta="doc · 14 backlinks" />
        <PaneCard title="Escalation path" meta="linked → on-call rota" accent />
        <PaneCard title="Postmortem template" meta="used by workflows" />
      </div>
      <div className="mt-3 border-t border-white/10 pt-3 font-brand-mono text-[10px] text-white/45">
        graph: 1,284 docs · 6,410 edges · queryable over MCP
      </div>
    </div>
  );
}
