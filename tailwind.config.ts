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
        navy: {
          DEFAULT: '#0B1A2B',
          light: '#122240',
          lighter: '#1A2D4A',
        },
        amber: {
          DEFAULT: '#BA7517',
          light: '#D4922E',
          dark: '#9A6012',
        },
        surface: {
          DEFAULT: '#1a1d27',
          dark: '#0f1117',
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
