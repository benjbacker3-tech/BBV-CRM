'use client';

import { createContext, useContext, useEffect } from 'react';

// Sandpiper Capital CRM is a light-only design (white / gray / navy).
// The dark palette was retired when we lightened the theme, so this
// provider now just enforces light mode: it strips any legacy `.dark`
// class the browser saved from earlier sessions and clears the stored
// preference so it can't come back.

type Theme = 'light';
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({ theme: 'light', toggleTheme: () => {} });

export function useTheme() { return useContext(ThemeContext); }

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    try { localStorage.removeItem('sandpiper-theme'); } catch { /* private mode */ }
  }, []);

  const toggleTheme = () => { /* no-op — dark mode retired */ };

  return <ThemeContext.Provider value={{ theme: 'light', toggleTheme }}>{children}</ThemeContext.Provider>;
}

// Kept as an export because TopBar imports it. Renders nothing now.
export function ThemeToggle() {
  return null;
}
