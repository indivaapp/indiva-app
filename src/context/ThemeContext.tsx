import React, { createContext, useContext, useState, useEffect } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  effectiveTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getEffectiveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
  }
  return theme;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>('system');
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(
    getEffectiveTheme('system')
  );

  useEffect(() => {
    AsyncStorage.getItem('theme').then(saved => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setThemeState(saved as Theme);
        setEffectiveTheme(getEffectiveTheme(saved as Theme));
      }
    });
  }, []);

  useEffect(() => {
    setEffectiveTheme(getEffectiveTheme(theme));
    AsyncStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setEffectiveTheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => sub.remove();
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);

  return (
    <ThemeContext.Provider value={{ theme, effectiveTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
};
