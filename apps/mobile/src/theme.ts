import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';

const palettes = {
  light: {
    ink: '#172b4d',
    green: '#176b57',
    greenDark: '#125443',
    greenSoft: '#edf3ef',
    paper: '#ffffff',
    surface: '#ffffff',
    surfaceSoft: '#f7f8f9',
    line: '#dfe1e6',
    lineStrong: '#c1c7d0',
    muted: '#5e6c84',
    danger: '#ae2a19',
    dangerSoft: '#fff2f0',
    warning: '#974f0c',
    cream: '#fafbfc',
    sidebar: '#17372e',
    sidebarText: '#b7c7c1',
    pressed: '#f4f6f5',
    overlay: 'rgba(9,25,20,.44)',
  },
  dark: {
    ink: '#edf4f2',
    green: '#65b99e',
    greenDark: '#91d1bc',
    greenSoft: '#19392f',
    paper: '#0d1613',
    surface: '#14211d',
    surfaceSoft: '#182620',
    line: '#283a34',
    lineStrong: '#40534c',
    muted: '#9eafa9',
    danger: '#ff9383',
    dangerSoft: '#3a201d',
    warning: '#efb16c',
    cream: '#111d19',
    sidebar: '#09120f',
    sidebarText: '#aebfb9',
    pressed: '#20312b',
    overlay: 'rgba(0,0,0,.64)',
  },
} as const;

export type ThemeColors = (typeof palettes)['light'] | (typeof palettes)['dark'];

const makeCommon = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.paper },
    content: { paddingHorizontal: 14, paddingTop: 26, paddingBottom: 48, gap: 0 },
    title: {
      color: colors.ink,
      fontSize: 25,
      lineHeight: 30,
      fontWeight: '700',
      letterSpacing: -0.8,
    },
    subtitle: { color: colors.muted, fontSize: 12, lineHeight: 19 },
    eyebrow: { color: colors.green, fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
    card: {
      backgroundColor: 'transparent',
      borderTopColor: colors.lineStrong,
      borderTopWidth: 1,
      borderRadius: 0,
      paddingHorizontal: 4,
      paddingVertical: 20,
      gap: 12,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    between: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    grow: { flex: 1, minWidth: 0 },
    label: { color: colors.muted, fontSize: 11, lineHeight: 17, fontWeight: '500' },
    value: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '700' },
    body: { color: colors.ink, fontSize: 13, lineHeight: 20 },
    muted: { color: colors.muted, fontSize: 11, lineHeight: 17 },
    button: {
      minHeight: 44,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: colors.green,
      backgroundColor: colors.green,
      paddingHorizontal: 17,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    buttonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
    secondaryButton: {
      minHeight: 44,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: colors.lineStrong,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryText: { color: colors.ink, fontWeight: '600', fontSize: 13 },
    dangerText: { color: colors.danger },
    input: {
      minHeight: 48,
      borderRadius: 4,
      borderColor: colors.lineStrong,
      borderWidth: 1,
      paddingHorizontal: 13,
      backgroundColor: colors.surface,
      color: colors.ink,
      fontSize: 14,
    },
  });

type ThemeValue = {
  preference: ThemePreference;
  resolved: 'light' | 'dark';
  isDark: boolean;
  colors: ThemeColors;
  common: ReturnType<typeof makeCommon>;
  setPreference: (value: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);
const storageKey = 'saldo.theme-preference';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  useEffect(() => {
    void SecureStore.getItemAsync(storageKey)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setPreferenceState(stored);
        }
      })
      .catch(() => undefined);
  }, []);
  const setPreference = (value: ThemePreference) => {
    setPreferenceState(value);
    void SecureStore.setItemAsync(storageKey, value).catch(() => undefined);
  };
  const resolved = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const value = useMemo<ThemeValue>(() => {
    const colors = palettes[resolved];
    return {
      preference,
      resolved,
      isDark: resolved === 'dark',
      colors,
      common: makeCommon(colors),
      setPreference,
    };
  }, [preference, resolved]);
  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme precisa estar dentro de ThemeProvider.');
  return value;
}
