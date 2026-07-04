import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './core/router/router';
import { useUiStore } from './core/ui/ui.store';
import './styles.css';

const initialTheme = useUiStore.getState().theme;
document.documentElement.classList.toggle('dark', initialTheme === 'dark');
document.documentElement.style.colorScheme = initialTheme;

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } } });
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></StrictMode>);
