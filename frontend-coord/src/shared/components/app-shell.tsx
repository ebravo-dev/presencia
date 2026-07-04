import { BarChart3, BookOpenCheck, LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
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
  const [open, setOpen] = useState(false); const location = useLocation(); const navigate = useNavigate(); const user = useAuthStore((state) => state.user);
  const theme = useUiStore((state) => state.theme); const toggleTheme = useUiStore((state) => state.toggleTheme);
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); document.documentElement.style.colorScheme = theme; }, [theme]);
  const logout = async () => { try { await coordinationApi.logout(); } finally { useAuthStore.getState().setUser(null); navigate('/login', { replace: true }); } };
  return <div className="min-h-screen bg-[#F8FAFC] text-[#111111] transition-colors dark:bg-[#0b0d10] dark:text-slate-100">
    {open && <button className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} aria-label="Cerrar navegación" />}
    <aside className={cn('fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-[#111111] text-white transition-transform lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
      <div className="flex h-20 items-center justify-between border-b border-white/10 px-6"><div><div className="text-xs font-semibold uppercase tracking-[.22em] text-white/55">Universidad Autónoma</div><div className="mt-1 text-lg font-bold">UAT · FI Tampico</div></div><button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Cerrar menú"><X /></button></div>
      <nav className="flex-1 space-y-1 px-4 py-6" aria-label="Navegación principal">{navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)} className={({ isActive }) => cn('flex items-center gap-3 rounded-lg border-l-2 px-4 py-3 text-sm font-medium transition', isActive ? 'border-[#C8102E] bg-white/10 text-white' : 'border-transparent text-white/65 hover:bg-white/5 hover:text-white')}><Icon size={19} />{label}</NavLink>)}</nav>
      <div className="border-t border-white/10 p-4"><div className="mb-3 px-2"><p className="truncate text-sm font-semibold">{user?.name}</p><p className="truncate text-xs text-white/50">{user?.email}</p></div><Button variant="ghost" className="w-full justify-start text-white/70 hover:bg-white/10 hover:text-white" onClick={logout}><LogOut size={18} />Cerrar sesión</Button></div>
    </aside>
    <div className="lg:pl-72"><header className="sticky top-0 z-20 flex h-20 items-center gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur transition-colors dark:border-slate-800 dark:bg-[#111317]/95 sm:px-8"><button className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu /></button><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#C8102E]">Coordinación Académica</p><h1 className="truncate text-xl font-bold sm:text-2xl">{pageTitles[location.pathname] ?? 'Panel administrativo'}</h1></div><Button variant="ghost" className="h-10 w-10 p-0" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'} title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}>{theme === 'dark' ? <Sun size={19}/> : <Moon size={19}/>}</Button></header><main className="p-4 sm:p-8"><Outlet /></main></div>
  </div>;
}
