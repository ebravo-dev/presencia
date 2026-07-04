import { BarChart3, BookOpenCheck, LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import fiuatLogo from '@/assets/fiuat-logo.png';
import { coordinationApi } from '@/core/api/coordination.api';
import { useAuthStore } from '@/core/auth/auth.store';
import { useUiStore } from '@/core/ui/ui.store';
import { Button, cn } from './ui';

const navigation = [
  { to: '/', label: 'Resumen', icon: BarChart3 },
  { to: '/carga-academica', label: 'Carga académica', icon: BookOpenCheck },
  { to: '/reportes/asistencia', label: 'Reporte semanal', icon: BarChart3 },
];
const pageTitles: Record<string, string> = { '/': 'Resumen institucional', '/carga-academica': 'Carga académica', '/reportes/asistencia': 'Asistencia semanal' };

export function AppShell() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const logout = async () => {
    try { await coordinationApi.logout(); } finally { useAuthStore.getState().setUser(null); navigate('/login', { replace: true }); }
  };

  return (
    <div className="min-h-screen bg-[#f2f3f5] text-[#1e1e20] transition-colors duration-300 dark:bg-[#111317] dark:text-slate-100">
      {/* Backdrop */}
      {open && <button className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} aria-label="Cerrar navegación" />}

      {/* ── Sidebar ────────────────────────────────────────────── */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r transition-all duration-300 lg:translate-x-0',
        'bg-white border-slate-200/80',
        'dark:bg-[#15181d] dark:border-[#1f2229]',
        open ? 'translate-x-0' : '-translate-x-full',
      )}>
        {/* Sidebar header — logo */}
        <div className="flex h-20 items-center justify-between border-b border-slate-200/80 px-5 dark:border-[#1f2229]">
          <div className="flex items-center gap-3">
            <img src={fiuatLogo} alt="FI UAT" className="h-10 w-auto object-contain" />
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[.2em] text-slate-400 dark:text-slate-500">Universidad Autónoma</div>
              <div className="text-sm font-bold text-slate-800 dark:text-white">UAT · FI Tampico</div>
            </div>
          </div>
          <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 lg:hidden" onClick={() => setOpen(false)} aria-label="Cerrar menú"><X size={20} /></button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-5" aria-label="Navegación principal">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) => cn(
                'group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-[#C8102E]/8 text-[#C8102E] dark:bg-[#C8102E]/12 dark:text-[#f87171]'
                  : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200',
              )}
            >
              <Icon size={19} className={cn('shrink-0 transition-colors')} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="border-t border-slate-200/80 p-4 dark:border-[#1f2229]">
          <div className="mb-3 px-2">
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{user?.name}</p>
            <p className="truncate text-xs text-slate-400 dark:text-slate-500">{user?.email}</p>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
            onClick={logout}
          >
            <LogOut size={18} />Cerrar sesión
          </Button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────── */}
      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md transition-colors duration-300 dark:border-[#1f2229] dark:bg-[#15181d]/90 sm:px-8">
          <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu size={20} /></button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#C8102E]">Coordinación Académica</p>
            <h1 className="truncate text-lg font-bold text-slate-800 dark:text-white sm:text-xl">{pageTitles[location.pathname] ?? 'Panel administrativo'}</h1>
          </div>
          <button
            className="group relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-500 transition-all duration-200 hover:border-slate-300 hover:text-slate-700 dark:border-[#2e3138] dark:bg-[#1a1d23] dark:text-slate-400 dark:hover:border-[#3a3e47] dark:hover:text-slate-200"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
            title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          >
            <Sun size={17} className={cn('absolute transition-all duration-300', theme === 'dark' ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0')} />
            <Moon size={17} className={cn('absolute transition-all duration-300', theme === 'dark' ? '-rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100')} />
          </button>
        </header>

        <main className="p-4 sm:p-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
