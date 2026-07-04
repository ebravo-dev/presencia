import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ColorTheme = 'light' | 'dark';

interface UiState {
  theme: ColorTheme;
  setTheme: (theme: ColorTheme) => void;
  toggleTheme: () => void;
}

export const useUiStore = create<UiState>()(persist(
  (set) => ({
    theme: preferredTheme(),
    setTheme: (theme) => set({ theme }),
    toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
  }),
  { name: 'coordination-ui', partialize: (state) => ({ theme: state.theme }) },
));

function preferredTheme(): ColorTheme {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}
