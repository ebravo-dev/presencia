import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { coordinationApi } from '@/core/api/coordination.api';
import { useAuthStore } from '@/core/auth/auth.store';
import { Button } from '@/shared/components/ui';

export function LoginPage() {
  const currentUser = useAuthStore((state) => state.user); const setUser = useAuthStore((state) => state.setUser);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate(); const queryClient = useQueryClient();
  const login = useMutation({ mutationFn: coordinationApi.login, onSuccess: ({ data }) => { setUser(data.user); queryClient.setQueryData(['auth', 'me'], { data: { user: data.user } }); navigate('/', { replace: true }); } });
  if (currentUser) return <Navigate to="/" replace />;
  const submit = (event: FormEvent) => { event.preventDefault(); login.mutate({ email, password }); };
  const message = axios.isAxiosError(login.error) && login.error.response?.status === 401 ? 'Correo o contraseña incorrectos.' : login.isError ? 'No fue posible iniciar sesión. Intenta nuevamente.' : null;
  return <main className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_.95fr]">
    <section className="relative hidden overflow-hidden bg-[#111111] p-12 text-white lg:flex lg:flex-col lg:justify-between"><div className="absolute -right-32 -top-32 h-96 w-96 rounded-full border-[70px] border-[#C8102E]/30"/><div className="relative"><p className="text-xs font-semibold uppercase tracking-[.25em] text-white/50">Universidad Autónoma de Tamaulipas</p><h1 className="mt-3 text-2xl font-bold">FI Tampico</h1></div><div className="relative max-w-xl"><div className="mb-8 h-1 w-16 bg-[#C8102E]"/><h2 className="text-5xl font-bold leading-[1.08]">La carga académica,<br/>clara y verificable.</h2><p className="mt-6 max-w-md text-lg leading-8 text-white/60">Consulta asignaciones reales y cumplimiento semanal desde un solo espacio administrativo.</p></div><p className="relative text-xs text-white/35">Plataforma Presencia · Coordinación Académica</p></section>
    <section className="flex items-center justify-center bg-[#F8FAFC] px-6 py-12"><div className="w-full max-w-md"><div className="mb-10 lg:hidden"><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#C8102E]">UAT · FI Tampico</p></div><div className="mb-8 inline-flex rounded-xl bg-red-50 p-3 text-[#C8102E]"><LockKeyhole size={26}/></div><h2 className="text-3xl font-bold tracking-tight">Acceso de coordinación</h2><p className="mt-3 text-slate-500">Ingresa con tu cuenta administrativa autorizada.</p>
      <form className="mt-9 space-y-5" onSubmit={submit}><div><label className="label" htmlFor="email">Correo institucional</label><input className="field" id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="coordinacion@uat.edu.mx"/></div><div><label className="label" htmlFor="password">Contraseña</label><div className="relative"><input className="field pr-12" id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}/><button type="button" className="absolute inset-y-0 right-0 px-4 text-slate-400 hover:text-slate-700" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></div>{message && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[#C8102E]">{message}</p>}<Button className="w-full" disabled={login.isPending}>{login.isPending ? 'Validando…' : <>Entrar al panel <ArrowRight size={17}/></>}</Button></form>
    </div></section>
  </main>;
}
