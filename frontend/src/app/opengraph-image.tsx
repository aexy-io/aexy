import { ImageResponse } from "next/og";

// Social card in the "Open Ledger" brand: paper, ink, ledger green, and the
// signature diff. Colors match the ledger tokens in tailwind.config.ts.

export const alt = "Aexy — The AI Company OS";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "96px",
          background: "#F2F3EE",
          color: "#101913",
          fontFamily: "sans-serif",
          borderTop: "16px solid #0B6B3A",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "88px",
              height: "88px",
              borderRadius: "6px",
              background: "#101913",
            }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#F2F3EE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
          </div>
          <div style={{ fontSize: "64px", fontWeight: 700, letterSpacing: "-0.03em" }}>
            Aexy
          </div>
        </div>
        <div
          style={{
            marginTop: "56px",
            fontSize: "76px",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
          }}
        >
          Replace the stack. Keep the context.
        </div>
        <div
          style={{
            marginTop: "40px",
            display: "flex",
            flexDirection: "column",
            fontSize: "30px",
            fontFamily: "monospace",
          }}
        >
          <div style={{ color: "#A8342A" }}>- hubspot&nbsp;&nbsp;- jira&nbsp;&nbsp;- notion&nbsp;&nbsp;- zapier</div>
          <div style={{ color: "#0B6B3A" }}>+ aexy — the open-source AI company OS</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
