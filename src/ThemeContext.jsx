import { createContext, useContext } from 'react';

export const THEMES = {
  light_comfort: {
    name: 'فاتح مريح',
    mode: 'light',
    icon: '☀️',
    accent: '#C88A12',
    accentHover: '#A86E00',
    bg: '#F6F8FC',
    sidebar: '#FFFFFF',
    card: '#FFFFFF',
    border: '#D9E2F2',
    text: '#18243A',
    textMuted: '#64748B',
    textSubtle: '#94A3B8',
    success: '#059669',
    danger: '#DC2626',
    info: '#2563EB',
    warning: '#D97706',
  },
};

const ThemeContext = createContext({
  theme: THEMES.light_comfort,
  themeKey: 'light_comfort',
  changeTheme: () => {},
  THEMES,
});

export function ThemeProvider({ children }) {
  const value = {
    theme: THEMES.light_comfort,
    themeKey: 'light_comfort',
    changeTheme: () => {},
    THEMES,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

export function ThemeSwitcher() {
  return null;
}
