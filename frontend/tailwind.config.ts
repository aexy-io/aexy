import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
        container: {
          center: true,
          padding: "2rem",
          screens: {
            "2xl": "1400px",
          },
        },
        colors: {
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
          "text-theme": {
            primary: "hsl(var(--text-primary))",
            secondary: "hsl(var(--text-secondary))",
            muted: "hsl(var(--text-muted))",
            inverted: "hsl(var(--text-inverted))",
          },
          "border-theme": {
            DEFAULT: "hsl(var(--border-default))",
            muted: "hsl(var(--border-muted))",
            strong: "hsl(var(--border-strong))",
          },
          sidebar: {
            DEFAULT: "hsl(var(--sidebar-bg))",
            hover: "hsl(var(--sidebar-hover))",
            active: "hsl(var(--sidebar-active))",
          },
          "input-theme": {
            DEFAULT: "hsl(var(--input-bg))",
            border: "hsl(var(--input-border))",
            focus: "hsl(var(--input-focus))",
          },
          success: {
            DEFAULT: "hsl(var(--success))",
            foreground: "hsl(var(--success-foreground))",
          },
          warning: {
            DEFAULT: "hsl(var(--warning))",
            foreground: "hsl(var(--warning-foreground))",
          },
          info: {
            DEFAULT: "hsl(var(--info))",
            foreground: "hsl(var(--info-foreground))",
          },
        },
        borderRadius: {
          lg: "var(--radius)",
          md: "calc(var(--radius) - 2px)",
          sm: "calc(var(--radius) - 4px)",
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
