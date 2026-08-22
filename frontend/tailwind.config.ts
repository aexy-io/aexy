import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    // `src/lib`, `src/config` and `src/hooks` were missing, and they are where
    // the app keeps its *shared* class strings — `lib/statusColors.ts` calls
    // itself the "single source of truth for all status colors", and
    // `lib/boardLayout.ts` holds the kanban column width. Classes declared
    // only there were never generated; the ones that still rendered did so
    // because some component happened to spell the same utility inline. That
    // is luck, and it runs out precisely when the raw-palette migration
    // deletes the duplicates.
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/config/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/hooks/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
        fontFamily: {
          display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
          "brand-mono": ["var(--font-brand-mono)", "ui-monospace", "monospace"],
        },
        container: {
          center: true,
          padding: "2rem",
          screens: {
            "2xl": "1400px",
          },
        },
        colors: {
          // "Open Ledger" marketing brand — used by every public marketing
          // page via components/landing/LedgerPage. Static hexes on purpose:
          // the marketing surface does not flip with the app's dark mode.
          ledger: {
            paper: "#F2F3EE",
            card: "#FBFCF9",
            ink: "#101913",
            green: "#0B6B3A",
            red: "#A8342A",
            pane: "#0E1512",
            mint: "#35C77F",
          },
          border: "hsl(var(--border))",
          input: "hsl(var(--input))",
          ring: "hsl(var(--ring))",
          background: "hsl(var(--background))",
          foreground: "hsl(var(--foreground))",
          primary: {
            DEFAULT: "hsl(var(--primary))",
            foreground: "hsl(var(--primary-foreground))",
            50: "#f0f9ff",
            100: "#e0f2fe",
            200: "#bae6fd",
            300: "#7dd3fc",
            400: "#38bdf8",
            500: "#0ea5e9",
            600: "#0284c7",
            700: "#0369a1",
            800: "#075985",
            900: "#0c4a6e",
          },
          secondary: {
            DEFAULT: "hsl(var(--secondary))",
            foreground: "hsl(var(--secondary-foreground))",
          },
          destructive: {
            DEFAULT: "hsl(var(--destructive))",
            foreground: "hsl(var(--destructive-foreground))",
            subtle: "hsl(var(--destructive-subtle))",
            border: "hsl(var(--destructive-border))",
          },
          muted: {
            DEFAULT: "hsl(var(--muted))",
            foreground: "hsl(var(--muted-foreground))",
          },
          accent: {
            DEFAULT: "hsl(var(--accent))",
            foreground: "hsl(var(--accent-foreground))",
          },
          popover: {
            DEFAULT: "hsl(var(--popover))",
            foreground: "hsl(var(--popover-foreground))",
          },
          card: {
            DEFAULT: "hsl(var(--card))",
            foreground: "hsl(var(--card-foreground))",
          },
          // Extended semantic colors
          surface: {
            DEFAULT: "hsl(var(--surface))",
            hover: "hsl(var(--surface-hover))",
            active: "hsl(var(--surface-active))",
            elevated: "hsl(var(--surface-elevated))",
          },
          // ── status roles ────────────────────────────────────────────────
          // `subtle` (tinted background) and `border` are the slots that were
          // missing. Without them the only status colour on offer was a solid
          // fill, so every module that wanted a quiet pill hand-wrote
          // `bg-red-50 text-red-700 border-red-200` — about 5,000 raw palette
          // classes grew out of that gap. `destructive` above is the danger
          // role; there is deliberately no second name for it.
          success: {
            DEFAULT: "hsl(var(--success))",
            foreground: "hsl(var(--success-foreground))",
            subtle: "hsl(var(--success-subtle))",
            border: "hsl(var(--success-border))",
          },
          warning: {
            DEFAULT: "hsl(var(--warning))",
            foreground: "hsl(var(--warning-foreground))",
            subtle: "hsl(var(--warning-subtle))",
            border: "hsl(var(--warning-border))",
          },
          info: {
            DEFAULT: "hsl(var(--info))",
            foreground: "hsl(var(--info-foreground))",
            subtle: "hsl(var(--info-subtle))",
            border: "hsl(var(--info-border))",
          },
          neutral: {
            DEFAULT: "hsl(var(--neutral))",
            foreground: "hsl(var(--neutral-foreground))",
            subtle: "hsl(var(--neutral-subtle))",
            border: "hsl(var(--neutral-border))",
          },
        },
        borderRadius: {
          // --radius is 2px. Tailwind's defaults only wire lg/md/sm to it,
          // which would have left `rounded`, `rounded-xl` and `rounded-2xl`
          // (~3,100 uses across the app) rounded while everything else went
          // square. Routing them here is the difference between a config
          // change and a 3,100-site codemod. `rounded-full` is untouched —
          // avatars and pills are meant to be circular.
          DEFAULT: "var(--radius)",
          sm: "max(calc(var(--radius) - 1px), 0px)",
          md: "var(--radius)",
          lg: "var(--radius)",
          xl: "calc(var(--radius) + 1px)",
          "2xl": "calc(var(--radius) + 2px)",
          "3xl": "calc(var(--radius) + 3px)",
        },
      keyframes: {
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          "0%": { opacity: "0", transform: "translateY(-10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        shimmer: "shimmer 2s infinite",
        "fade-in": "fade-in 0.2s ease-out",
        "slide-up": "slide-up 0.2s ease-out",
        "slide-down": "slide-down 0.2s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
