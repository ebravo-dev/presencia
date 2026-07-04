import { useQuery } from '@tanstack/react-query';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import { useEffect } from 'react';
import { coordinationApi } from '../api/coordination.api';
import { useAuthStore } from '../auth/auth.store';
import { AppShell } from '@/shared/components/app-shell';
import { Skeleton } from '@/shared/components/ui';
import { LoginPage } from '@/features/auth/login-page';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { AllocationPage } from '@/features/allocation/allocation-page';
import { ReportsPage } from '@/features/reports/reports-page';
import { InfrastructurePage } from '@/features/infrastructure/infrastructure-page';

function ProtectedApp() {
  const setUser = useAuthStore((state) => state.setUser);
  const auth = useQuery({ queryKey: ['auth', 'me'], queryFn: coordinationApi.me, retry: false, staleTime: 5 * 60_000 });
  useEffect(() => { if (auth.data?.data.user) setUser(auth.data.data.user); }, [auth.data, setUser]);
  if (auth.isLoading) return <div className="grid min-h-screen place-items-center bg-slate-50"><div className="w-72 space-y-3"><Skeleton className="h-8"/><Skeleton className="h-20"/></div></div>;
  if (auth.isError) return <Navigate to="/login" replace />;
  return <AppShell />;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { element: <ProtectedApp />, children: [
    { path: '/', element: <DashboardPage /> },
    { path: '/carga-academica', element: <AllocationPage /> },
    { path: '/infraestructura', element: <InfrastructurePage /> },
    { path: '/reportes/asistencia', element: <ReportsPage /> },
  ] },
  { path: '*', element: <Navigate to="/" replace /> },
], { basename: '/coordinacion' });
