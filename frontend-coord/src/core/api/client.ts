import axios from 'axios';
import { useAuthStore } from '../auth/auth.store';

export const api = axios.create({ baseURL: '/api', withCredentials: true, timeout: 15_000 });
api.interceptors.response.use((response) => response, (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
    useAuthStore.getState().setUser(null);
    if (!window.location.pathname.endsWith('/login')) window.location.assign('/coordinacion/login');
  }
  return Promise.reject(error);
});
