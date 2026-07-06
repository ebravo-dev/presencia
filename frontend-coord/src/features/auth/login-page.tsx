import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { ArrowRight, Eye, EyeOff, KeyRound, Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { coordinationApi } from '@/core/api/coordination.api';
import { useAuthStore } from '@/core/auth/auth.store';
import { Button } from '@/shared/components/ui';
import campusBackground from '@/assets/ingenieria-campus.jpg';
import fiuatLogo from '@/assets/fiuat-logo.png';

export function LoginPage() {
  const currentUser = useAuthStore((state) => state.user); const setUser = useAuthStore((state) => state.setUser);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate(); const queryClient = useQueryClient();
  const login = useMutation({ mutationFn: coordinationApi.login, onSuccess: ({ data }) => { setUser(data.user); queryClient.setQueryData(['auth', 'me'], { data: { user: data.user } }); navigate('/', { replace: true }); } });
  if (currentUser) return <Navigate to="/" replace />;
  const submit = (event: FormEvent) => { event.preventDefault(); login.mutate({ email, password }); };
  const message = axios.isAxiosError(login.error) && login.error.response?.status === 401 ? 'Correo o contraseña incorrectos.' : login.isError ? 'No fue posible iniciar sesión. Intenta nuevamente.' : null;
  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#111111] px-4 py-8 sm:px-6">
    <img src={campusBackground} alt="" className="absolute inset-0 h-full w-full object-cover object-center"/>
    <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(10,12,14,.86),rgba(17,17,17,.62)_48%,rgba(79,9,20,.63))]"/>
    <div className="absolute inset-0 bg-black/20"/>

    <section className="absolute bottom-9 left-8 z-10 hidden max-w-sm text-white lg:block">
      <p className="text-xl font-extrabold uppercase leading-tight tracking-tight">Universidad Autónoma de Tamaulipas</p>
      <div className="my-3 h-1 w-14 bg-[#C8102E]"/>
      <p className="text-sm font-semibold text-white/85">Plataforma de Presencia</p>
      <p className="mt-1 text-sm text-white/60">Coordinación Académica · FI Tampico</p>
    </section>

    <section className="light-surface relative z-10 w-full max-w-[460px] rounded-xl border border-white/50 bg-white px-7 py-7 shadow-2xl shadow-black/40 sm:px-10 sm:py-8">
      <div className="mx-auto mb-3 flex h-20 max-w-[260px] items-center justify-center overflow-hidden">
        <img src={fiuatLogo} alt="Facultad de Ingeniería Tampico" className="w-full object-contain"/>
      </div>
      <div className="text-center"><h1 className="text-2xl font-bold tracking-tight sm:text-[1.7rem]">Acceso de coordinación</h1><p className="mt-2 text-sm text-slate-500">Ingresa con tu cuenta administrativa autorizada.</p></div>
      <form className="mt-7 space-y-4" onSubmit={submit}>
        <div><label className="label" htmlFor="email">Correo institucional</label><div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17}/><input className="field field-leading-icon" id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo.coordinador@ejemplo.edu.mx"/></div></div>
        <div><label className="label" htmlFor="password">Contraseña</label><div className="relative"><KeyRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17}/><input className="field field-both-icons" id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}/><button type="button" className="absolute inset-y-0 right-0 px-4 text-slate-400 hover:text-slate-700" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></div>
        {message && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[#C8102E]">{message}</p>}
        <Button className="mt-1 w-full rounded-md py-3" disabled={login.isPending}>{login.isPending ? 'Validando…' : <>Entrar al panel <ArrowRight size={17}/></>}</Button>
      </form>
      <p className="mt-6 text-center text-xs text-slate-400">¿Problemas para acceder? Contacta a soporte técnico.</p>
    </section>
  </main>;
}
