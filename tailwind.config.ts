import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Navy is the sole accent. Kept as the deep brand color for the sidebar,
        // primary buttons, active nav states, and header emphasis. Everything
        // else in the UI reads on white with slate/gray text.
        navy: {
          DEFAULT: '#1E3A5F',       // lighter than before (was #0B1A2B) so it feels less heavy on white
          light: '#2A4B78',
          lighter: '#3B5F92',
          dark: '#122240',
        },
        // Amber kept as a token so any straggler references still resolve to
        // something reasonable — but it now points at a muted slate so the UI
        // no longer flashes yellow/orange anywhere. Aliased to slate-600.
        amber: {
          DEFAULT: '#475569',
          light: '#64748B',
          dark: '#334155',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          dark: '#F8FAFC',
        },
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
export default config;
