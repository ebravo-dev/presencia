import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Bluetooth, Bug, Database, KeyRound, Link2, Lock, LogOut, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { superUserApi } from '@/core/api/coordination.api';
import type { Beacon, CoordinatorAccount } from '@/core/api/types';
import { Button, Card, EmptyState, Skeleton, cn } from '@/shared/components/ui';
import { useDebounce } from '@/shared/hooks/use-debounce';

const REFRESH_INTERVAL_MS = 10_000;
type Section = 'coordinators' | 'beacons' | 'students' | 'debug';

export function SuperUserPage() {
  const session = useQuery({ queryKey: ['super-user', 'me'], queryFn: superUserApi.me, retry: false });

  if (session.isLoading) {
    return <div className="grid min-h-screen place-items-center bg-slate-950"><Skeleton className="h-32 w-96" /></div>;
  }

  if (session.isError || !session.data) {
    return <SuperUserLogin onSuccess={() => session.refetch()} />;
  }

  return <SuperUserConsole />;
}

function SuperUserLogin({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const login = useMutation({
    mutationFn: superUserApi.login,
    onSuccess,
    onError: () => setMessage('Contraseña inválida. Revisa SUPER_USER_PASSWORD en el .env.'),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    login.mutate({ password });
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#111317] p-5 text-slate-100">
      <Card className="w-full max-w-md border-[#2e3138] bg-[#1a1d23] p-7 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-2xl bg-[#C8102E]/15 p-3 text-[#f87171]"><Lock size={24} /></div>
          <div>
            <h1 className="text-xl font-bold text-white">Super usuario</h1>
            <p className="text-sm text-slate-400">Acceso reservado para infraestructura y cuentas.</p>
          </div>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <label className="block text-sm font-semibold text-slate-200">
            Contraseña maestra
            <input
              className="field mt-1 border-[#2e3138] bg-[#15181d] text-white"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="SUPER_USER_PASSWORD"
              required
            />
          </label>
          {message && <p role="alert" className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-300">{message}</p>}
          <Button className="w-full" disabled={login.isPending}>
            <KeyRound size={17} />{login.isPending ? 'Validando...' : 'Entrar'}
          </Button>
        </form>
      </Card>
    </main>
  );
}

function SuperUserConsole() {
  const [section, setSection] = useState<Section>('coordinators');
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: superUserApi.logout,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['super-user'] });
      window.location.assign('/coordinacion/superUsuario');
    },
  });

  return (
    <main className="min-h-screen bg-[#f2f3f5] text-slate-900 dark:bg-[#111317] dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white px-5 py-5 dark:border-[#1f2229] dark:bg-[#15181d] sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#C8102E]">Administración restringida</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight">Super usuario</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Beacons, celulares vinculados y permisos de coordinadores.</p>
          </div>
          <Button variant="secondary" onClick={() => logout.mutate()}><LogOut size={17} />Salir</Button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl p-5 sm:p-8">
        <div className="mb-6 flex flex-wrap gap-2">
          <SectionButton current={section} value="coordinators" onClick={setSection} icon={<UserCog size={17} />} label="Coordinadores" />
          <SectionButton current={section} value="beacons" onClick={setSection} icon={<Bluetooth size={17} />} label="Beacons" />
          <SectionButton current={section} value="students" onClick={setSection} icon={<Link2 size={17} />} label="Alumnos vinculados" />
          <SectionButton current={section} value="debug" onClick={setSection} icon={<Bug size={17} />} label="Debug" />
        </div>

        {section === 'coordinators' && <CoordinatorAdmin />}
        {section === 'beacons' && <BeaconAdmin />}
        {section === 'students' && <StudentBindingAdmin />}
        {section === 'debug' && <DebugAdmin />}
      </div>
    </main>
  );
}

function SectionButton({ current, value, onClick, icon, label }: { current: Section; value: Section; onClick: (value: Section) => void; icon: React.ReactNode; label: string }) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={cn(
        'inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition',
        active
          ? 'border-[#C8102E] bg-[#C8102E] text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-[#2e3138] dark:bg-[#1a1d23] dark:text-slate-300',
      )}
    >
      {icon}{label}
    </button>
  );
}

function CoordinatorAdmin() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CoordinatorAccount | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('COORDINATOR');
  const [disabled, setDisabled] = useState(false);

  const coordinators = useQuery({ queryKey: ['super-user', 'coordinators'], queryFn: superUserApi.coordinators });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['super-user', 'coordinators'] });
  const reset = () => { setEditing(null); setEmail(''); setName(''); setPassword(''); setRole('COORDINATOR'); setDisabled(false); };

  const save = useMutation({
    mutationFn: () => editing
      ? superUserApi.updateCoordinator(editing.id, { email, name, password, role, disabled })
      : superUserApi.createCoordinator({ email, name, password, role }),
    onSuccess: async () => { reset(); await invalidate(); },
  });
  const remove = useMutation({ mutationFn: superUserApi.deleteCoordinator, onSuccess: invalidate });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!editing && password.length < 8) return;
    save.mutate();
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-red-50 p-2.5 text-[#C8102E]"><ShieldCheck size={21} /></div>
          <div><h2 className="font-bold">{editing ? 'Editar coordinador' : 'Agregar coordinador'}</h2><p className="text-sm text-slate-500">Define acceso y permisos del panel normal.</p></div>
        </div>
        <form className="space-y-3" onSubmit={submit}>
          <label className="block text-sm font-semibold">Nombre<input className="field mt-1" value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <label className="block text-sm font-semibold">Correo<input className="field mt-1" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label className="block text-sm font-semibold">Contraseña<input className="field mt-1" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={editing ? 'Dejar vacía para conservar' : 'Mínimo 8 caracteres'} required={!editing} /></label>
          <label className="block text-sm font-semibold">Permiso<select className="field mt-1" value={role} onChange={(event) => setRole(event.target.value)}><option value="COORDINATOR">Coordinador completo</option><option value="READ_ONLY">Solo lectura</option></select></label>
          {editing && <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={disabled} onChange={(event) => setDisabled(event.target.checked)} />Cuenta bloqueada</label>}
          <div className="flex gap-2"><Button disabled={save.isPending}>{editing ? 'Actualizar' : 'Crear cuenta'}</Button>{editing && <Button type="button" variant="secondary" onClick={reset}>Cancelar</Button>}</div>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-5 dark:border-[#1f2229]"><h2 className="font-bold">Cuentas coordinadoras</h2><p className="text-sm text-slate-500">Usuarios que entran al panel de coordinación.</p></div>
        {coordinators.isLoading ? <div className="p-5"><Skeleton className="h-32" /></div> : !coordinators.data?.data.length ? <div className="p-5"><EmptyState icon={<UserCog />} title="Sin coordinadores" description="Crea la primera cuenta coordinadora." /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-[#15181d]"><tr><th className="px-5 py-3">Usuario</th><th className="px-5 py-3">Permiso</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3 text-right">Acciones</th></tr></thead>
              <tbody>{coordinators.data.data.map((user) => (
                <tr key={user.id} className="border-t border-slate-100 dark:border-[#1f2229]">
                  <td className="px-5 py-3"><b>{user.name}</b><p className="text-xs text-slate-500">{user.email}</p></td>
                  <td className="px-5 py-3">{user.role === 'READ_ONLY' ? 'Solo lectura' : 'Coordinador completo'}</td>
                  <td className="px-5 py-3"><span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', user.disabled ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>{user.disabled ? 'Bloqueada' : 'Activa'}</span></td>
                  <td className="px-5 py-3"><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => { setEditing(user); setName(user.name); setEmail(user.email); setRole(user.role); setDisabled(user.disabled); setPassword(''); }}>Editar</Button><Button variant="ghost" onClick={() => remove.mutate(user.id)}><Trash2 size={16} /></Button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function BeaconAdmin() {
  const queryClient = useQueryClient();
  const [beaconEdit, setBeaconEdit] = useState<Beacon | null>(null);
  const [classroom, setClassroom] = useState('');
  const [uuid, setUuid] = useState('');

  const beacons = useQuery({ queryKey: ['super-user', 'beacons'], queryFn: superUserApi.beacons, refetchInterval: REFRESH_INTERVAL_MS });
  const reset = () => { setBeaconEdit(null); setClassroom(''); setUuid(''); };
  const save = useMutation({
    mutationFn: () => beaconEdit ? superUserApi.updateBeacon(beaconEdit.id, { classroom, uuid }) : superUserApi.createBeacon({ classroom, uuid }),
    onSuccess: async () => { reset(); await queryClient.invalidateQueries({ queryKey: ['super-user', 'beacons'] }); },
  });
  const remove = useMutation({ mutationFn: superUserApi.deleteBeacon, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['super-user', 'beacons'] }) });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!classroom || !uuid) return;
    save.mutate();
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-red-50 p-2.5 text-[#C8102E]"><Bluetooth size={21} /></div>
          <div><h2 className="font-bold">{beaconEdit ? 'Editar beacon' : 'Registrar beacon de salón'}</h2><p className="text-sm text-slate-500">UUID BLE para validar aulas.</p></div>
        </div>
        <form className="space-y-3" onSubmit={submit}>
          <label className="block text-sm font-semibold">Salón<input className="field mt-1" value={classroom} onChange={(event) => setClassroom(event.target.value.toUpperCase())} placeholder="AULA 304" required /></label>
          <label className="block text-sm font-semibold">UUID<input className="field mt-1 font-mono" value={uuid} onChange={(event) => setUuid(event.target.value)} placeholder="12345678-1234-1234-1234-123456789abc" required /></label>
          <div className="flex gap-2"><Button disabled={save.isPending}>{beaconEdit ? 'Actualizar' : 'Guardar'}</Button>{beaconEdit && <Button type="button" variant="secondary" onClick={reset}>Cancelar</Button>}</div>
        </form>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-5 dark:border-[#1f2229]"><h2 className="font-bold">Beacons registrados</h2><p className="text-sm text-slate-500">Configuración consumida por la app de profesores.</p></div>
        {beacons.isLoading ? <div className="p-5"><Skeleton className="h-32" /></div> : !beacons.data?.data.length ? <div className="p-5"><EmptyState icon={<Bluetooth />} title="Sin beacons" description="Registra el primer salón para activar validación BLE." /></div> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-[#15181d]"><tr><th className="px-5 py-3">Salón</th><th className="px-5 py-3">UUID</th><th className="px-5 py-3 text-right">Acciones</th></tr></thead><tbody>{beacons.data.data.map((beacon) => <tr key={beacon.id} className="border-t border-slate-100 dark:border-[#1f2229]"><td className="px-5 py-3 font-semibold">{beacon.classroom}</td><td className="px-5 py-3 font-mono text-xs">{beacon.uuid}</td><td className="px-5 py-3"><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => { setBeaconEdit(beacon); setClassroom(beacon.classroom); setUuid(beacon.uuid); }}>Editar</Button><Button variant="ghost" onClick={() => remove.mutate(beacon.id)}><Trash2 size={16} /></Button></div></td></tr>)}</tbody></table></div>}
      </Card>
    </div>
  );
}

function StudentBindingAdmin() {
  const queryClient = useQueryClient();
  const [studentSearch, setStudentSearch] = useState('');
  const debouncedStudentSearch = useDebounce(studentSearch);
  const bindings = useQuery({ queryKey: ['super-user', 'bindings', debouncedStudentSearch], queryFn: () => superUserApi.studentDeviceBindings({ q: debouncedStudentSearch || undefined }), refetchInterval: REFRESH_INTERVAL_MS });
  const remove = useMutation({ mutationFn: superUserApi.deleteStudentDeviceBinding, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['super-user', 'bindings'] }) });

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-5 dark:border-[#1f2229] sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-bold">Alumnos vinculados</h2><p className="text-sm text-slate-500">Matrícula y UUID estable generado por la app de alumnos.</p></div><label className="relative block sm:w-80"><Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input className="field pl-9" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Buscar matrícula" /></label></div>
      {bindings.isLoading ? <div className="p-5"><Skeleton className="h-32" /></div> : !bindings.data?.data.length ? <div className="p-5"><EmptyState icon={<Link2 />} title="Sin alumnos vinculados" description="Los alumnos aparecerán cuando vinculen su celular desde la app." /></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-[#15181d]"><tr><th className="px-5 py-3">Matrícula</th><th className="px-5 py-3">UUID</th><th className="px-5 py-3">Alumno / grupo</th><th className="px-5 py-3">Dispositivo</th><th className="px-5 py-3 text-right">Acciones</th></tr></thead><tbody>{bindings.data.data.map((binding) => <tr key={binding.id} className="border-t border-slate-100 dark:border-[#1f2229]"><td className="px-5 py-3 font-semibold">{binding.matricula}</td><td className="px-5 py-3 font-mono text-xs">{binding.attendanceUuid}</td><td className="px-5 py-3">{binding.students.length ? binding.students.map((student) => <div key={student.id} className="mb-1 last:mb-0"><b>{student.name}</b><p className="text-xs text-slate-500">{student.group.name} · {student.group.classroom || 'Sin salón'} · {student.group.professor.name}</p></div>) : <span className="text-slate-400">No aparece en grupos sincronizados</span>}</td><td className="px-5 py-3">{binding.platform || '-'}<p className="text-xs text-slate-500">{binding.deviceInfo || ''}</p></td><td className="px-5 py-3 text-right"><Button variant="ghost" onClick={() => remove.mutate(binding.matricula)}><Trash2 size={16} /></Button></td></tr>)}</tbody></table></div>}
    </Card>
  );
}

function DebugAdmin() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ['super-user', 'debug', 'status'], queryFn: superUserApi.debugStatus, refetchInterval: REFRESH_INTERVAL_MS });
  const classes = useQuery({ queryKey: ['super-user', 'debug', 'classes'], queryFn: superUserApi.debugClasses, refetchInterval: REFRESH_INTERVAL_MS });
  const attendance = useQuery({ queryKey: ['super-user', 'debug', 'attendance'], queryFn: superUserApi.debugStudentAttendance, refetchInterval: REFRESH_INTERVAL_MS });
  const logs = useQuery({ queryKey: ['super-user', 'debug', 'logs'], queryFn: superUserApi.debugFlowLogs, refetchInterval: REFRESH_INTERVAL_MS });
  const createClass = useMutation({
    mutationFn: () => superUserApi.createDebugClass({
      professorEmail: 'debug.profesor@uat.edu.mx',
      professorName: 'Profesor Debug',
      code: '990001',
      groupLetter: 'DBG',
      name: 'DEBUG ASISTENCIA',
      classroom: 'DEBUG-101',
      beaconUuid: '11111111-2222-4333-8444-555555555555',
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['super-user', 'debug'] }),
        queryClient.invalidateQueries({ queryKey: ['super-user', 'beacons'] }),
        queryClient.invalidateQueries({ queryKey: ['super-user', 'bindings'] }),
      ]);
    },
  });

  const enabled = status.data?.data.enabled ?? false;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-red-50 p-2.5 text-[#C8102E]"><Bug size={21} /></div>
            <div>
              <h2 className="font-bold">Modo debug de backend</h2>
              <p className="text-sm text-slate-500">{status.data?.data.apiRestPolicy ?? 'Cargando estado...'}</p>
            </div>
          </div>
          <span className={cn('rounded-full px-3 py-1 text-xs font-black uppercase', enabled ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')}>
            {enabled ? 'Activo' : 'Release real'}
          </span>
        </div>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <InfoBox label="Periodo" value={status.data?.data.period ?? '-'} />
          <InfoBox label="Horas clase debug" value={String(status.data?.data.classHours ?? '-')} />
          <InfoBox label="Actualizado" value={status.data?.meta.generatedAt ? new Date(status.data.meta.generatedAt).toLocaleTimeString('es-MX') : '-'} />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><Database size={21} /></div>
            <div><h2 className="font-bold">Clase debug base</h2><p className="text-sm text-slate-500">Crea profesor, materia, alumnos, beacon y UUIDs locales.</p></div>
          </div>
          <Button disabled={createClass.isPending} onClick={() => createClass.mutate()}>
            {createClass.isPending ? 'Creando...' : 'Crear/actualizar clase debug'}
          </Button>
          {createClass.isError && <p className="mt-3 text-sm font-semibold text-red-600">No se pudo crear la clase debug.</p>}
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 p-5 dark:border-[#1f2229]"><h2 className="font-bold">Clases debug en base</h2></div>
          {classes.isLoading ? <div className="p-5"><Skeleton className="h-24" /></div> : !classes.data?.data.length ? <div className="p-5"><EmptyState icon={<Database />} title="Sin clases debug" description="Crea una clase para probar el flujo completo." /></div> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-[#15181d]"><tr><th className="px-5 py-3">Materia</th><th className="px-5 py-3">Profesor</th><th className="px-5 py-3">Salón</th><th className="px-5 py-3">Alumnos</th><th className="px-5 py-3">Registros</th></tr></thead>
                <tbody>{classes.data.data.map((item) => <tr key={item.id} className="border-t border-slate-100 dark:border-[#1f2229]"><td className="px-5 py-3"><b>{item.name}</b><p className="text-xs text-slate-500">{item.code} {item.groupLetter} · {item.period}</p></td><td className="px-5 py-3">{item.professor.name}<p className="text-xs text-slate-500">{item.professor.institutionalEmail}</p></td><td className="px-5 py-3">{item.classroom}</td><td className="px-5 py-3">{item.students.length}</td><td className="px-5 py-3">{item.attendanceRecords.length}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 p-5 dark:border-[#1f2229]"><h2 className="font-bold">Asistencia de alumnos</h2><p className="text-sm text-slate-500">Últimos registros recibidos del maestro.</p></div>
          {attendance.isLoading ? <div className="p-5"><Skeleton className="h-28" /></div> : !attendance.data?.data.length ? <div className="p-5"><EmptyState icon={<Activity />} title="Sin asistencias" description="Cuando la app de profesor suba datos aparecerán aquí." /></div> : (
            <div className="max-h-[520px] overflow-auto">
              {attendance.data.data.map((record) => <div key={record.id} className="border-b border-slate-100 p-5 text-sm last:border-b-0 dark:border-[#1f2229]"><b>{record.group.name}</b><p className="text-xs text-slate-500">{record.professor.name} · {new Date(record.date).toLocaleDateString('es-MX')} · {record.portalSyncStatus}</p><p className="mt-2 text-xs text-slate-500">Entrada: {formatDateTime(record.professorEntryAt)} · Salida: {formatDateTime(record.professorExitAt)}</p><div className="mt-3 flex flex-wrap gap-2">{record.attendances.map((attendanceItem) => <span key={attendanceItem.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs dark:bg-[#15181d]">{attendanceItem.student.name}: {attendanceItem.status}</span>)}</div></div>)}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 p-5 dark:border-[#1f2229]"><h2 className="font-bold">Logs de flujo</h2><p className="text-sm text-slate-500">Sync jobs, registros del maestro y vínculos recientes.</p></div>
          {logs.isLoading ? <div className="p-5"><Skeleton className="h-28" /></div> : (
            <div className="max-h-[520px] overflow-auto text-sm">
              {logs.data?.data.syncJobs.map((job) => <div key={job.id} className="border-b border-slate-100 p-4 dark:border-[#1f2229]"><b>{job.status}</b> · {job.professor.name}<p className="text-xs text-slate-500">{job.currentGroupName || job.error || 'Sin detalle'} · {formatDateTime(job.startedAt)}</p></div>)}
              {logs.data?.data.attendanceRecords.map((record) => <div key={record.id} className="border-b border-slate-100 p-4 dark:border-[#1f2229]"><b>{record.group.name}</b><p className="text-xs text-slate-500">{record.portalSyncStatus} · alumnos: {record._count.attendances} · BLE: {record._count.studentBeaconDetections}</p></div>)}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-[#2e3138] dark:bg-[#15181d]"><p className="text-xs font-bold uppercase text-slate-400">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString('es-MX') : '-';
}
