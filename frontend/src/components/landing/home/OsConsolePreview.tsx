import { Bot } from "lucide-react";

// The hero's dark product pane — the first "plate" in the manual. A coded
// preview rather than a screenshot: it states the shape of the product (four
// domains, one operating graph, an agent acting inside it) without staging
// data, and it costs zero image bytes at the top of the page.

const DOMAINS = [
  { title: "Engineering", stat: "24 active tasks", body: "Sprints, releases, velocity" },
  { title: "GTM", stat: "18 hot accounts", body: "Visitor ID, scoring, routing" },
  { title: "People", stat: "7 growth plans", body: "Hiring, reviews, learning" },
  { title: "Knowledge", stat: "1,284 indexed docs", body: "Docs, graph, MCP tools" },
] as const;

export function OsConsolePreview() {
  return (
    <figure className="relative">
      <div className="overflow-hidden rounded-[4px] border border-ledger-ink/25 bg-ledger-pane text-[#E6EDE7] shadow-[0_1px_0_rgba(16,25,19,0.08)]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-white/55">
            FIG. 01 — Operating graph
          </div>
          <div className="font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-mint">
            Synced
          </div>
        </div>
        <div className="grid gap-2.5 p-4 sm:grid-cols-2">
          {DOMAINS.map((domain) => (
            <div key={domain.title} className="rounded-[2px] border border-white/12 p-3.5">
              <div className="flex items-center justify-between">
                <div className="text-[13px] font-medium text-white/85">{domain.title}</div>
                <div className="h-1.5 w-1.5 rounded-full bg-ledger-mint" />
              </div>
              <div className="mt-1.5 font-brand-mono text-base text-white">{domain.stat}</div>
              <div className="mt-1 text-xs leading-5 text-white/50">{domain.body}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-start gap-3 border-l-2 border-ledger-mint bg-white/[0.03] px-3.5 py-3">
            <Bot className="mt-0.5 h-4 w-4 shrink-0 text-ledger-mint" />
            <div>
              <div className="text-[13px] font-medium text-white/90">
                Sales agent routed a high-intent account
              </div>
              <div className="mt-1 font-brand-mono text-[11px] text-white/50">
                policy checked · CRM enriched · task created · Slack notified
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-2.5 font-brand-mono text-[11px] uppercase tracking-[0.14em] text-ledger-ink/45">
        One operating graph across every team
      </figcaption>
    </figure>
  );
}
