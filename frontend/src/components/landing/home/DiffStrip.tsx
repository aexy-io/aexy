// The signature motif of the Open Ledger brand: the pitch — replace the
// SaaS stack, keep one system — rendered literally as a git diff that types
// itself on load. Pure CSS animation (keyframes in globals.css), so this
// stays a server component and the text is in the crawlable HTML either way.

const REMOVED = ["hubspot", "jira", "notion", "zapier"] as const;

export function DiffStrip() {
  return (
    <div
      aria-label="Replaces HubSpot, Jira, Notion, and Zapier with Aexy"
      className="border-t border-ledger-ink/12 pt-4 font-brand-mono text-sm leading-7"
    >
      <div className="text-ledger-red">
        <span
          className="diff-typed"
          style={{ "--type-w": "37ch" } as React.CSSProperties}
        >
          {REMOVED.map((tool) => `- ${tool}`).join("  ")}
        </span>
      </div>
      <div className="text-ledger-green">
        <span
          className="diff-typed"
          style={{ "--type-w": "6ch", animationDelay: "1s" } as React.CSSProperties}
        >
          + aexy
        </span>
      </div>
    </div>
  );
}
