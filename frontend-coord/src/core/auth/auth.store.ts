import { create } from 'zustand';
import type { CoordinatorUser } from '../api/types';

interface AuthState { user: CoordinatorUser | null; hydrated: boolean; setUser: (user: CoordinatorUser | null) => void; setHydrated: (value: boolean) => void }
export const useAuthStore = create<AuthState>((set) => ({
  user: null, hydrated: false, setUser: (user) => set({ user }), setHydrated: (hydrated) => set({ hydrated }),
}));
