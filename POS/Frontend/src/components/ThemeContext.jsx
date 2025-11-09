/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const THEME_CATALOG = {
  mauve: {
    id: 'mauve',
    name: 'Mauve & Grey',
    description: 'Soft mauve and warm neutrals (custom).',
    preview: ['#877c93', '#ae838e', '#c98d95', '#ddcdc0', '#e7cb82'],
  },
  slate: {
    id: 'slate',
    name: 'Slate & Charcoal',
    description: 'Cool grey palette with blue undertones.',
    preview: ['#475569', '#e2e8f0', '#0f172a'],
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald & Fog',
    description: 'Fresh green with misty neutrals.',
    preview: ['#059669', '#d1fae5', '#f4f6f5'],
  },
  // Dark, eye-friendly themes
  charcoal: {
    id: 'charcoal',
    name: 'Charcoal Night',
    description: 'Deep charcoal with soft slate accents — low contrast and easy on the eyes.',
    preview: ['#0f1724', '#1f2a37', '#3a4b5c', '#7b8794', '#cbd5e1'],
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight Blue',
    description: 'Warm navy with muted cyan highlights for comfortable long sessions.',
    preview: ['#001219', '#002a3a', '#034f4f', '#2a9d8f', '#bde6dc'],
  },
  forest: {
    id: 'forest',
    name: 'Forest Night',
    description: 'Deep green/teal palette with gentle accents for reduced eye strain.',
    preview: ['#08211b', '#0b3a33', '#134e44', '#2e8b76', '#bfeee2'],
  },
};

const STORAGE_KEY = 'itnvend_theme';

const ThemeContext = createContext({
  theme: 'mauve',
  setTheme: () => {},
  themes: Object.values(THEME_CATALOG),
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    if (typeof window === 'undefined') return 'mauve';
    return localStorage.getItem(STORAGE_KEY) || 'mauve';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme: setThemeState,
      themes: Object.values(THEME_CATALOG),
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
