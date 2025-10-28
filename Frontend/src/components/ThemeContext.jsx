import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const THEME_CATALOG = {
  mauve: {
    id: 'mauve',
    name: 'Mauve & Grey',
    description: 'Soft purple accent with neutral greys.',
    preview: ['#7c3aed', '#ede9fe', '#f6f4fb'],
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
