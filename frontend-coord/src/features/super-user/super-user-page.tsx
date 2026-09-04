import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, Bluetooth, Bug, CalendarRange, ChevronDown, ChevronUp, Clock3, Copy, Database, FilterX, KeyRound, Link2, ListTree, Lock, LogOut, Pencil, Play, PlusCircle, RefreshCw, Search, ShieldCheck, Smartphone, Trash2, UserCog, Users } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { superUserApi } from '@/core/api/coordination.api';
import type { AppLogApplication, AppLogEvent, AppLogLevel, Beacon, CoordinatorAccount, DatabaseTargetId, DebugClassResponse, DebugMutationResponse, DebugScheduleInput, ScheduleDay } from '@/core/api/types';
import { Badge, Button, Card, EmptyState, Skeleton, cn } from '@/shared/components/ui';
import { useDebounce } from '@/shared/hooks/use-debounce';

const REFRESH_INTERVAL_MS = 10_000;
type Section = 'cycle' | 'coordinators' | 'beacons' | 'students' | 'logs' | 'databases' | 'debug';

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
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Operación, dispositivos, cuentas y diagnóstico de las aplicaciones.</p>
          </div>
          <Button variant="secondary" onClick={() => logout.mutate()}><LogOut size={17} />Salir</Button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl p-5 sm:p-8">
        <div className="mb-6 flex flex-wrap gap-2">
          <SectionButton current={section} value="cycle" onClick={setSection} icon={<CalendarRange size={17} />} label="Ciclo escolar" />
          <SectionButton current={section} value="coordinators" onClick={setSection} icon={<UserCog size={17} />} label="Coordinadores" />
          <SectionButton current={section} value="beacons" onClick={setSection} icon={<Bluetooth size={17} />} label="Beacons" />
          <SectionButton current={section} value="students" onClick={setSection} icon={<Link2 size={17} />} label="Alumnos vinculados" />
          <SectionButton current={section} value="logs" onClick={setSection} icon={<ListTree size={17} />} label="Logs de apps" />
          <SectionButton current={section} value="databases" onClick={setSection} icon={<Database size={17} />} label="Bases de datos" />
          <SectionButton current={section} value="debug" onClick={setSection} icon={<Bug size={17} />} label="Debug" />
        </div>

        {section === 'cycle' && <AcademicCycleAdmin />}
        {section === 'coordinators' && <CoordinatorAdmin />}
        {section === 'beacons' && <BeaconAdmin />}
        {section === 'students' && <StudentBindingAdmin />}
        {section === 'logs' && <AppLogsAdmin />}
        {section === 'databases' && <DatabaseAdmin />}
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

function AppLogsAdmin() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 350);
  const [application, setApplication] = useState<AppLogApplication | ''>('');
  const [level, setLevel] = useState<AppLogLevel | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filters = {
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
    ...(application ? { application } : {}),
    ...(level ? { level } : {}),
    ...(from ? { from: new Date(from).toISOString() } : {}),
    ...(to ? { to: new Date(to).toISOString() } : {}),
    ...(cursor ? { cursor } : {}),
    limit: 50,
  };
  const logs = useQuery({
    queryKey: ['super-user', 'app-logs', filters],
    queryFn: () => superUserApi.logs(filters),
    refetchInterval: cursor ? false : 15_000,
  });
  const summary = useQuery({
    queryKey: ['super-user', 'app-logs-summary'],
    queryFn: superUserApi.logSummary,
    refetchInterval: 15_000,
  });

  const resetPagination = () => {
    setCursor(undefined);
    setCursorHistory([]);
    setExpandedId(null);
  };
  const clearFilters = () => {
    setSearch('');
    setApplication('');
    setLevel('');
    setFrom('');
    setTo('');
    resetPagination();
  };
  const nextPage = () => {
    const next = logs.data?.meta.nextCursor;
    if (!next) return;
    setCursorHistory((history) => [...history, cursor]);
    setCursor(next);
    setExpandedId(null);
  };
  const previousPage = () => {
    const history = [...cursorHistory];
    const previous = history.pop();
    setCursorHistory(history);
    setCursor(previous);
    setExpandedId(null);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <LogMetric label="Eventos totales" value={summary.data?.data.total} icon={<ListTree size={19} />} />
        <LogMetric label="Últimas 24 h" value={summary.data?.data.last24Hours} icon={<Clock3 size={19} />} />
        <LogMetric label="Errores 24 h" value={summary.data?.data.errorsLast24Hours} icon={<AlertTriangle size={19} />} tone="danger" />
        <LogMetric label="Fatales 24 h" value={summary.data?.data.fatalLast24Hours} icon={<Bug size={19} />} tone="danger" />
        <LogMetric label="Instalaciones activas" value={summary.data?.data.activeInstallationsLast24Hours} icon={<Smartphone size={19} />} />
      </div>

      {(summary.data?.data.topErrors ?? []).length > 0 && (
        <Card className="p-4">
          <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">Errores más frecuentes · 24 h</p>
          <div className="flex flex-wrap gap-2">
            {summary.data!.data.topErrors.map((item) => (
              <button
                key={item.eventName}
                type="button"
                onClick={() => { setSearch(item.eventName); resetPagination(); }}
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-left text-xs font-bold text-red-800 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
              >
                <span className="font-mono">{item.eventName}</span>
                <span className="ml-2 rounded-full bg-white/70 px-2 py-0.5 dark:bg-black/20">{item.count}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_170px_150px_190px_190px_auto]">
          <label className="relative block">
            <span className="sr-only">Buscar logs</span>
            <Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={17} />
            <input
              className="field pl-10"
              value={search}
              onChange={(event) => { setSearch(event.target.value); resetPagination(); }}
              placeholder="Mensaje, evento, usuario o correlación"
            />
          </label>
          <label>
            <span className="sr-only">Aplicación</span>
            <select className="field" value={application} onChange={(event) => { setApplication(event.target.value as AppLogApplication | ''); resetPagination(); }}>
              <option value="">Todas las apps</option>
              <option value="STUDENT">Alumnos</option>
              <option value="PROFESSOR">Profesores</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Severidad</span>
            <select className="field" value={level} onChange={(event) => { setLevel(event.target.value as AppLogLevel | ''); resetPagination(); }}>
              <option value="">Toda severidad</option>
              {(['FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG'] as const).map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-500">
            Desde
            <input className="field mt-1" type="datetime-local" value={from} onChange={(event) => { setFrom(event.target.value); resetPagination(); }} />
          </label>
          <label className="text-xs font-bold text-slate-500">
            Hasta
            <input className="field mt-1" type="datetime-local" value={to} onChange={(event) => { setTo(event.target.value); resetPagination(); }} />
          </label>
          <Button variant="secondary" onClick={clearFilters} title="Limpiar filtros"><FilterX size={17} />Limpiar</Button>
        </div>
      </Card>

      {logs.isLoading && <Card className="p-5"><Skeleton className="h-80" /></Card>}
      {logs.isError && (
        <Card className="p-5"><EmptyState icon={<AlertTriangle />} title="Logs no disponibles" description="No se pudo consultar App Log Service. Revisa su estado y vuelve a intentar." /></Card>
      )}
      {logs.data && logs.data.data.length === 0 && (
        <Card className="p-5"><EmptyState icon={<Search />} title="Sin coincidencias" description="No hay eventos con los filtros seleccionados." /></Card>
      )}
      {logs.data && logs.data.data.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-[#2e3138]">
            <p className="text-sm font-bold">{logs.data.meta.total.toLocaleString()} eventos encontrados</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Actualizado {formatLogDate(logs.data.meta.generatedAt)}</span>
              <Button variant="ghost" onClick={() => logs.refetch()} disabled={logs.isFetching}><RefreshCw className={cn(logs.isFetching && 'animate-spin')} size={16} />Actualizar</Button>
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-[#2e3138]">
            {logs.data.data.map((event) => (
              <LogEventRow key={event.eventId} event={event} expanded={expandedId === event.eventId} onToggle={() => setExpandedId(expandedId === event.eventId ? null : event.eventId)} />
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 p-4 dark:border-[#2e3138]">
            <Button variant="secondary" disabled={cursorHistory.length === 0} onClick={previousPage}>Anterior</Button>
            <span className="text-xs font-semibold text-slate-400">Página {cursorHistory.length + 1}</span>
            <Button variant="secondary" disabled={!logs.data.meta.nextCursor} onClick={nextPage}>Más antiguos</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function LogMetric({ label, value, icon, tone = 'neutral' }: { label: string; value?: number; icon: React.ReactNode; tone?: 'neutral' | 'danger' }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className={cn('rounded-xl p-2.5', tone === 'danger' ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' : 'bg-slate-100 text-slate-600 dark:bg-[#15181d] dark:text-slate-300')}>{icon}</div>
      <div><p className="text-xs font-bold text-slate-500">{label}</p><p className="text-2xl font-black">{value === undefined ? '—' : value.toLocaleString()}</p></div>
    </Card>
  );
}

function LogEventRow({ event, expanded, onToggle }: { event: AppLogEvent; expanded: boolean; onToggle: () => void }) {
  const tone = event.level === 'ERROR' || event.level === 'FATAL' ? 'danger' : event.level === 'WARN' ? 'warning' : event.level === 'INFO' ? 'info' : 'neutral';
  return (
    <article>
      <button type="button" className="grid w-full gap-3 px-4 py-4 text-left hover:bg-slate-50 dark:hover:bg-white/[.03] md:grid-cols-[90px_115px_155px_minmax(0,1fr)_auto] md:items-start" onClick={onToggle}>
        <Badge tone={tone}>{event.level}</Badge>
        <span className="text-xs font-bold text-slate-500">{event.application === 'STUDENT' ? 'Alumnos' : 'Profesores'}</span>
        <span className="text-xs text-slate-500">{formatLogDate(event.occurredAt)}</span>
        <span className="min-w-0"><span className="block truncate text-sm font-bold">{event.message}</span><span className="mt-1 block truncate font-mono text-xs text-slate-400">{event.eventName}{event.userIdentifier ? ` · ${event.userIdentifier}` : ''}</span></span>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-5 dark:border-[#2e3138] dark:bg-[#15181d]">
          <div className="grid gap-4 lg:grid-cols-3">
            <LogDetail title="Dispositivo" entries={[
              ['Instalación', event.installationId], ['Plataforma', event.platform], ['Sistema', event.osVersion],
              ['Modelo', [event.deviceManufacturer, event.deviceModel].filter(Boolean).join(' ')], ['Locale', event.locale],
              ['Zona horaria', event.timezoneOffset], ['Red', event.networkType],
            ]} />
            <LogDetail title="Aplicación" entries={[
              ['Versión', `${event.appVersion} (${event.buildNumber})`], ['Sesión', event.appSessionId], ['Secuencia', String(event.sequence)],
              ['Usuario', event.userIdentifier], ['Recibido', formatLogDate(event.receivedAt)], ['Correlación', event.correlationId],
            ]} />
            <LogDetail title="Error" entries={[
              ['Tipo', event.errorType], ['Detalle', event.errorMessage], ['IP origen', event.sourceIp], ['Evento', event.eventId],
            ]} />
          </div>
          <LogCode title="Mensaje completo" value={event.message} />
          {event.stackTrace && <LogCode title="Stack trace" value={event.stackTrace} />}
          {event.context && Object.keys(event.context).length > 0 && <LogCode title="Contexto estructurado" value={JSON.stringify(event.context, null, 2)} />}
        </div>
      )}
    </article>
  );
}

function LogDetail({ title, entries }: { title: string; entries: Array<[string, string | undefined]> }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">{title}</h3>
      <dl className="space-y-2">
        {entries.filter(([, value]) => value).map(([label, value]) => (
          <div key={label} className="grid grid-cols-[85px_minmax(0,1fr)] gap-2 text-xs"><dt className="font-bold text-slate-400">{label}</dt><dd className="break-all font-mono text-slate-700 dark:text-slate-200">{value}</dd></div>
        ))}
      </dl>
    </div>
  );
}

function LogCode({ title, value }: { title: string; value: string }) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</h3><Button variant="ghost" onClick={() => navigator.clipboard?.writeText(value)}><Copy size={14} />Copiar</Button></div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-4 text-xs leading-relaxed text-slate-200">{value}</pre>
    </div>
  );
}

function formatLogDate(value: string): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value));
}

function DatabaseAdmin() {
  const queryClient = useQueryClient();
  const [selectedTargetId, setSelectedTargetId] = useState<DatabaseTargetId | 'all' | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const catalog = useQuery({
    queryKey: ['super-user', 'databases'],
    queryFn: superUserApi.databases,
  });
  const selectedTarget = selectedTargetId === 'all'
    ? catalog.data?.data.all
    : catalog.data?.data.databases.find(({ id }) => id === selectedTargetId);
  const purge = useMutation({
    mutationFn: () => {
      if (!selectedTargetId) throw new Error('DATABASE_TARGET_REQUIRED');
      return superUserApi.purgeDatabase({ target: selectedTargetId, confirmation });
    },
    onSuccess: async (response) => {
      setConfirmation('');
      setSelectedTargetId(null);
      if (response.data.sessionInvalidated) {
        queryClient.clear();
        window.location.assign('/coordinacion/superUsuario');
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['super-user'] }),
        queryClient.invalidateQueries({ queryKey: ['coordination'] }),
        queryClient.invalidateQueries({ queryKey: ['shared-classes'] }),
      ]);
    },
  });

  const selectTarget = (target: DatabaseTargetId | 'all') => {
    purge.reset();
    setConfirmation('');
    setSelectedTargetId(target);
  };

  if (catalog.isLoading) return <Card className="p-5"><Skeleton className="h-48" /></Card>;
  if (catalog.isError || !catalog.data) {
    return <Card className="p-5"><EmptyState icon={<Database />} title="Bases no disponibles" description="No se pudo consultar el catálogo de bases de datos." /></Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="border-red-200 bg-red-50/70 p-5 dark:border-red-950 dark:bg-red-950/15">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-red-100 p-2.5 text-red-700 dark:bg-red-950 dark:text-red-300"><AlertTriangle size={22} /></div>
          <div>
            <h2 className="font-black text-red-950 dark:text-red-100">Zona destructiva</h2>
            <p className="mt-1 text-sm leading-relaxed text-red-800 dark:text-red-200">
              Estas acciones eliminan registros de forma irreversible. Se conservan el esquema, las tablas y las migraciones para que los servicios puedan volver a iniciar.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {catalog.data.data.databases.map((database) => (
          <Card key={database.id} className="flex flex-col p-5">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700 dark:bg-[#15181d] dark:text-slate-200"><Database size={20} /></div>
              <div><h3 className="font-black">{database.name}</h3><p className="font-mono text-xs text-slate-400">{database.id}</p></div>
            </div>
            <p className="mb-5 flex-1 text-sm leading-relaxed text-slate-500">{database.description}</p>
            <Button variant="danger" onClick={() => selectTarget(database.id)} disabled={purge.isPending}>
              <Trash2 size={16} />Borrar esta base
            </Button>
          </Card>
        ))}
      </div>

      <Card className="border-red-300 p-5 dark:border-red-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-black text-red-700 dark:text-red-300">{catalog.data.data.all.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{catalog.data.data.all.description} La sesión actual se cerrará.</p>
          </div>
          <Button variant="danger" onClick={() => selectTarget('all')} disabled={purge.isPending}>
            <Trash2 size={17} />Borrar todas
          </Button>
        </div>
      </Card>

      {selectedTarget && (
        <Card className="border-red-300 p-5 shadow-lg dark:border-red-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-red-600" size={22} />
            <div className="w-full">
              <h2 className="font-black">Confirmar borrado de {selectedTarget.name}</h2>
              <p className="mt-1 text-sm text-slate-500">Esta operación no se puede deshacer. Escribe exactamente:</p>
              <code className="mt-3 block rounded-lg bg-slate-950 px-3 py-2 font-mono text-sm font-bold text-red-300">{selectedTarget.confirmationPhrase}</code>
              <input
                className="field mt-3 font-mono"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={selectedTarget.confirmationPhrase}
                autoComplete="off"
                autoFocus
              />
              {selectedTarget.invalidatesSuperUserSession && (
                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                  Este borrado elimina Identidad y cerrará la sesión de Super Usuario al finalizar.
                </p>
              )}
              {purge.isError && <p role="alert" className="mt-3 text-sm font-semibold text-red-600">{apiErrorMessage(purge.error, 'No se pudo completar el borrado. Algunas bases podrían haberse eliminado; revisa los servicios antes de reintentar.')}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  disabled={purge.isPending || confirmation !== selectedTarget.confirmationPhrase}
                  onClick={() => purge.mutate()}
                >
                  <Trash2 size={16} />{purge.isPending ? 'Borrando...' : 'Confirmar borrado irreversible'}
                </Button>
                <Button type="button" variant="secondary" disabled={purge.isPending} onClick={() => { setSelectedTargetId(null); setConfirmation(''); purge.reset(); }}>Cancelar</Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {purge.isSuccess && !purge.data.data.sessionInvalidated && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
          Borrado completado: {purge.data.data.purged.join(', ')}.
        </p>
      )}
    </div>
  );
}

function AcademicCycleAdmin() {
  const queryClient = useQueryClient();
  const [selectedCycleId, setSelectedCycleId] = useState<number | null>(null);
  const cycle = useQuery({
    queryKey: ['super-user', 'academic-cycle'],
    queryFn: superUserApi.activeAcademicCycle,
    refetchInterval: REFRESH_INTERVAL_MS,
  });
  const active = cycle.data?.data.active;
  const selected = selectedCycleId ?? active?.externalId ?? null;
  const changeCycle = useMutation({
    mutationFn: () => {
      if (selected === null) throw new Error('ACADEMIC_CYCLE_REQUIRED');
      return superUserApi.changeActiveAcademicCycle(selected);
    },
    onSuccess: async () => {
      setSelectedCycleId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['super-user', 'academic-cycle'] }),
        queryClient.invalidateQueries({ queryKey: ['coordination'] }),
      ]);
    },
  });

  if (cycle.isLoading) return <Card className="p-5"><Skeleton className="h-40" /></Card>;
  if (cycle.isError || !cycle.data) {
    return <Card className="p-5"><EmptyState icon={<CalendarRange />} title="Ciclo no disponible" description="No se pudo consultar Academic Service." /></Card>;
  }

  const production = cycle.data.meta.mode === 'PRODUCTION';
  const selectedOption = cycle.data.data.availableCycles.find(({ externalId }) => externalId === selected);
  return (
    <div className="grid gap-4 xl:grid-cols-[430px_1fr]">
      <Card className="p-5">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-xl bg-red-50 p-2.5 text-[#C8102E]"><CalendarRange size={22} /></div>
          <div><h2 className="font-bold">Ciclo escolar activo</h2><p className="text-sm text-slate-500">Fuente única para sincronización de profesores y UAT.</p></div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Activo actualmente</p>
          <p className="mt-1 text-2xl font-black text-emerald-950 dark:text-emerald-100">{active?.name}</p>
          <p className="mt-1 font-mono text-xs text-emerald-800/70 dark:text-emerald-300/70">ID UAT: {active?.externalId} · revisión {active?.revision}</p>
        </div>
        <label className="mt-5 block text-sm font-bold">
          Cambiar a
          <select className="field mt-1" value={selected ?? ''} disabled={!production || changeCycle.isPending} onChange={(event) => setSelectedCycleId(Number(event.target.value))}>
            {cycle.data.data.availableCycles.map((item) => <option key={item.externalId} value={item.externalId}>{item.name} · ID {item.externalId}</option>)}
          </select>
        </label>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          El cambio conserva el historial y desactiva las materias del ciclo anterior. Cada profesor descargará el nuevo ciclo al volver a iniciar sesión o pulsar sincronizar.
        </p>
        {!production && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-800">Esta selección está protegida mientras el despliegue se encuentre en modo demo.</p>}
        {changeCycle.isError && <p role="alert" className="mt-3 text-sm font-semibold text-red-600">{apiErrorMessage(changeCycle.error, 'No se pudo cambiar el ciclo escolar.')}</p>}
        {changeCycle.isSuccess && <p role="status" className="mt-3 text-sm font-semibold text-emerald-700">El ciclo activo se actualizó correctamente.</p>}
        <Button
          className="mt-4"
          disabled={!production || selectedOption?.externalId === active?.externalId || changeCycle.isPending}
          onClick={() => {
            if (selectedOption && window.confirm(`¿Activar ${selectedOption.name}? Las materias del ciclo anterior se desactivarán.`)) changeCycle.mutate();
          }}
        >
          <RefreshCw size={16} />{changeCycle.isPending ? 'Actualizando...' : `Activar ${selectedOption?.name ?? 'ciclo'}`}
        </Button>
      </Card>

      <Card className="p-5">
        <h2 className="font-bold">Disponibilidad automática por año</h2>
        <p className="mt-1 text-sm text-slate-500">Los ciclos futuros no pueden seleccionarse antes de que comience su año.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cycle.data.data.availableCycles.map((item) => (
            <div key={item.externalId} className={cn('rounded-xl border p-4', item.externalId === active?.externalId ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-[#2e3138]')}>
              <p className="font-black">{item.year}-{item.term}</p><p className="text-sm text-slate-500">ID UAT {item.externalId}</p>
            </div>
          ))}
          {cycle.data.data.lockedCycles.map((item) => (
            <div key={item.externalId} className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 opacity-65 dark:border-[#2e3138] dark:bg-[#15181d]">
              <p className="font-black">{item.year}-{item.term}</p><p className="text-sm text-slate-500">ID UAT {item.externalId} · Bloqueado</p>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-lg bg-blue-50 p-3 text-sm font-semibold text-blue-800 dark:bg-blue-950/20 dark:text-blue-200">
          Los ciclos {cycle.data.data.lockedCycles.map(({ externalId }) => externalId).join(', ')} se habilitarán el 1 de enero de {cycle.data.data.lockedCycles[0]?.year} ({cycle.data.data.timeZone}).
        </p>
      </Card>
    </div>
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
  const [matricula, setMatricula] = useState('');
  const [attendanceUuid, setAttendanceUuid] = useState('');
  const [savedMatricula, setSavedMatricula] = useState('');
  const debouncedStudentSearch = useDebounce(studentSearch);
  const bindings = useQuery({ queryKey: ['super-user', 'bindings', debouncedStudentSearch], queryFn: () => superUserApi.studentDeviceBindings({ q: debouncedStudentSearch || undefined }), refetchInterval: REFRESH_INTERVAL_MS });
  const save = useMutation({
    mutationFn: () => superUserApi.createStudentDeviceBinding({
      matricula: matricula.trim().toUpperCase(),
      attendanceUuid: attendanceUuid.trim().toLowerCase(),
    }),
    onSuccess: async (response) => {
      setSavedMatricula(response.data.matricula);
      setMatricula('');
      setAttendanceUuid('');
      await queryClient.invalidateQueries({ queryKey: ['super-user', 'bindings'] });
    },
  });
  const remove = useMutation({ mutationFn: superUserApi.deleteStudentDeviceBinding, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['super-user', 'bindings'] }) });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSavedMatricula('');
    save.mutate();
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-red-50 p-2.5 text-[#C8102E]"><Link2 size={21} /></div>
          <div>
            <h2 className="font-bold">Vincular alumno por UUID</h2>
            <p className="text-sm text-slate-500">Alta temporal para un beacon emulado en iOS.</p>
          </div>
        </div>
        <form className="space-y-3" onSubmit={submit}>
          <label className="block text-sm font-semibold">
            Matrícula
            <input
              className="field mt-1"
              value={matricula}
              onChange={(event) => setMatricula(event.target.value.toUpperCase())}
              placeholder="2251330008"
              maxLength={40}
              autoCapitalize="characters"
              required
            />
          </label>
          <label className="block text-sm font-semibold">
            UUID del beacon iOS
            <input
              className="field mt-1 font-mono"
              value={attendanceUuid}
              onChange={(event) => setAttendanceUuid(event.target.value)}
              placeholder="12345678-1234-4234-9234-123456789abc"
              maxLength={36}
              required
            />
          </label>
          <p className="text-xs leading-relaxed text-slate-500">
            La matrícula enlaza el UUID con el alumno del padrón y sus grupos. Si la matrícula ya tiene un vínculo, este registro lo actualizará.
          </p>
          <Button type="submit" disabled={save.isPending}>
            <PlusCircle size={16} />{save.isPending ? 'Vinculando...' : 'Vincular alumno'}
          </Button>
          {savedMatricula && <p role="status" className="text-sm font-semibold text-emerald-700">Alumno {savedMatricula} vinculado correctamente.</p>}
          {save.isError && <p role="alert" className="text-sm font-semibold text-red-600">{apiErrorMessage(save.error, 'No se pudo vincular el alumno. Revisa la matrícula y el formato del UUID.')}</p>}
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 dark:border-[#1f2229] sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="font-bold">Alumnos vinculados</h2><p className="text-sm text-slate-500">Matrícula y UUID usados para el pase automático.</p></div>
          <label className="relative block sm:w-80">
            <span className="sr-only">Buscar matrícula</span>
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input className="field pl-9" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Buscar matrícula" />
          </label>
        </div>
        {bindings.isLoading ? <div className="p-5"><Skeleton className="h-32" /></div> : !bindings.data?.data.length ? <div className="p-5"><EmptyState icon={<Link2 />} title="Sin alumnos vinculados" description="Registra aquí el UUID del beacon iOS o espera a que un alumno vincule su celular desde la app." /></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-[#15181d]"><tr><th className="px-5 py-3">Matrícula</th><th className="px-5 py-3">UUID</th><th className="px-5 py-3">Alumno / grupo</th><th className="px-5 py-3">Dispositivo</th><th className="px-5 py-3 text-right">Acciones</th></tr></thead><tbody>{bindings.data.data.map((binding) => <tr key={binding.id} className="border-t border-slate-100 dark:border-[#1f2229]"><td className="px-5 py-3 font-semibold">{binding.matricula}</td><td className="px-5 py-3 font-mono text-xs">{binding.attendanceUuid}</td><td className="px-5 py-3">{binding.students.length ? binding.students.map((student) => <div key={student.id} className="mb-1 last:mb-0"><b>{student.name}</b><p className="text-xs text-slate-500">{student.group.name} · {student.group.classroom || 'Sin salón'} · {student.group.professor.name}</p></div>) : <span className="text-slate-400">Pendiente de aparecer en un grupo sincronizado</span>}</td><td className="px-5 py-3">{binding.platform || '-'}<p className="text-xs text-slate-500">{binding.deviceInfo || ''}</p></td><td className="px-5 py-3 text-right"><Button variant="ghost" aria-label={`Desvincular ${binding.matricula}`} onClick={() => remove.mutate(binding.matricula)}><Trash2 size={16} /></Button></td></tr>)}</tbody></table></div>}
      </Card>
    </div>
  );
}

type DebugDay = Extract<ScheduleDay, 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'>;
type DebugScheduleSlot = { startTime: string; endTime: string };
type DebugClass = DebugClassResponse['data'][number];

const DEBUG_DAYS: Array<{ key: DebugDay; label: string }> = [
  { key: 'monday', label: 'Lunes' },
  { key: 'tuesday', label: 'Martes' },
  { key: 'wednesday', label: 'Miércoles' },
  { key: 'thursday', label: 'Jueves' },
  { key: 'friday', label: 'Viernes' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
];

const defaultDebugSchedule: Record<DebugDay, DebugScheduleSlot[]> = {
  monday: [{ startTime: '08:00', endTime: '12:00' }],
  tuesday: [],
  wednesday: [{ startTime: '10:00', endTime: '12:00' }],
  thursday: [],
  friday: [],
  saturday: [],
  sunday: [],
};

function DebugAdmin() {
  const queryClient = useQueryClient();
  const [editingDebugClass, setEditingDebugClass] = useState<DebugClass | null>(null);
  const [classForm, setClassForm] = useState({
    professorEmail: 'profesor.demo@uat.edu.mx',
    professorName: 'Profesor Demo',
    code: '990001',
    groupLetter: 'DBG',
    period: '',
    name: 'DEBUG ASISTENCIA',
    level: 'DEBUG',
    classroom: 'DEBUG-101',
    beaconUuid: '11111111-2222-4333-8444-555555555555',
  });
  const [schedule, setSchedule] = useState<Record<DebugDay, DebugScheduleSlot[]>>(defaultDebugSchedule);
  const [teacherForm, setTeacherForm] = useState({ email: 'nuevo.profesor.demo@uat.edu.mx', name: 'Nuevo Profesor Demo', password: '' });
  const [studentForm, setStudentForm] = useState({ matricula: 'DEMO0002', email: 'nuevo.alumno.demo@alumnos.uat.edu.mx', name: 'Nuevo Alumno Demo', password: '', careerName: 'Ingeniería Demo' });
  const [selectedStudents, setSelectedStudents] = useState<Record<string, string>>({});
  const [selectedRegisteredStudents, setSelectedRegisteredStudents] = useState<Record<string, string>>({});
  const [simulationDate, setSimulationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [simulationStatus, setSimulationStatus] = useState<'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'>('PRESENT');
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [synchronizationNotice, setSynchronizationNotice] = useState<string | null>(null);
  const status = useQuery({ queryKey: ['super-user', 'debug', 'status'], queryFn: superUserApi.debugStatus, refetchInterval: REFRESH_INTERVAL_MS });
  const debugEnabled = status.data?.data.enabled === true;
  const catalog = useQuery({ queryKey: ['super-user', 'debug', 'catalog'], queryFn: superUserApi.debugCatalog, refetchInterval: REFRESH_INTERVAL_MS, enabled: debugEnabled });
  const registeredStudents = useQuery({ queryKey: ['super-user', 'debug', 'registered-students'], queryFn: superUserApi.debugRegisteredStudents, refetchInterval: REFRESH_INTERVAL_MS, enabled: debugEnabled });
  const classes = useQuery({ queryKey: ['super-user', 'debug', 'classes'], queryFn: superUserApi.debugClasses, refetchInterval: REFRESH_INTERVAL_MS, enabled: debugEnabled });
  const attendance = useQuery({ queryKey: ['super-user', 'debug', 'attendance'], queryFn: superUserApi.debugStudentAttendance, refetchInterval: REFRESH_INTERVAL_MS, enabled: debugEnabled });
  const logs = useQuery({ queryKey: ['super-user', 'debug', 'logs'], queryFn: superUserApi.debugFlowLogs, refetchInterval: REFRESH_INTERVAL_MS, enabled: debugEnabled });

  const refreshDebug = () => queryClient.invalidateQueries({ queryKey: ['super-user', 'debug'] });
  const refreshAfterMutation = async (response?: Pick<DebugMutationResponse<unknown>, 'meta'>) => {
    if (response?.meta?.synchronization.status === 'PENDING') {
      setSynchronizationNotice(
        `El cambio sí se guardó, pero falta propagarlo a los demás servicios (${response.meta.synchronization.error ?? 'error temporal'}). No repitas el alta; usa “Sincronizar datos”.`,
      );
    } else {
      setSynchronizationNotice(null);
    }
    await refreshDebug();
  };
  const createTeacher = useMutation({
    mutationFn: () => superUserApi.createDebugTeacher(teacherForm),
    onSuccess: async (response) => { setTeacherForm((current) => ({ ...current, password: '' })); await refreshAfterMutation(response); },
  });
  const deleteTeacher = useMutation({ mutationFn: superUserApi.deleteDebugTeacher, onSuccess: refreshAfterMutation });
  const createStudent = useMutation({
    mutationFn: () => superUserApi.createDebugStudent(studentForm),
    onSuccess: async (response) => { setStudentForm((current) => ({ ...current, password: '' })); await refreshAfterMutation(response); },
  });
  const deleteStudent = useMutation({ mutationFn: superUserApi.deleteDebugStudent, onSuccess: refreshAfterMutation });
  const addStudent = useMutation({
    mutationFn: ({ classId, studentId }: { classId: string; studentId: string }) => superUserApi.addDebugStudentToClass(classId, studentId),
    onSuccess: refreshAfterMutation,
  });
  const addRegisteredStudent = useMutation({
    mutationFn: ({ classId, matricula }: { classId: string; matricula: string }) => superUserApi.addRegisteredStudentToDebugClass(classId, matricula),
    onSuccess: async (response, { classId }) => {
      setSelectedRegisteredStudents((current) => ({ ...current, [classId]: '' }));
      await refreshAfterMutation(response);
    },
  });
  const removeStudent = useMutation({
    mutationFn: ({ classId, studentId }: { classId: string; studentId: string }) => superUserApi.removeDebugStudentFromClass(classId, studentId),
    onSuccess: refreshAfterMutation,
  });
  const deleteClass = useMutation({ mutationFn: superUserApi.deleteDebugClass, onSuccess: refreshAfterMutation });
  const synchronize = useMutation({
    mutationFn: superUserApi.synchronizeDebugCatalog,
    onSuccess: async () => { setSynchronizationNotice(null); await refreshDebug(); },
  });
  const resetDemoData = useMutation({
    mutationFn: superUserApi.resetDebugData,
    onSuccess: async () => {
      setShowResetConfirmation(false);
      setResetConfirmation('');
      setSelectedStudents({});
      setSelectedRegisteredStudents({});
      resetClassEditor();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['super-user'] }),
        queryClient.invalidateQueries({ queryKey: ['coordination'] }),
        queryClient.invalidateQueries({ queryKey: ['shared-classes'] }),
      ]);
    },
  });
  const simulateAttendance = useMutation({
    mutationFn: (item: DebugClass) => superUserApi.simulateDebugAttendance(item.id, {
      date: simulationDate,
      entries: item.students.map((student) => ({ studentId: student.id, status: simulationStatus })),
    }),
    onSuccess: refreshDebug,
  });

  const saveClass = useMutation({
    mutationFn: () => {
      const payload = {
        code: classForm.code,
        groupLetter: classForm.groupLetter,
        period: classForm.period || undefined,
        name: classForm.name,
        level: classForm.level,
        classroom: classForm.classroom,
        schedule: compactDebugSchedule(schedule),
      };
      if (editingDebugClass) {
        return superUserApi.updateDebugClass(editingDebugClass.id, {
          ...payload,
          ...(classForm.beaconUuid.trim() ? { beaconUuid: classForm.beaconUuid.trim() } : {}),
        });
      }
      return superUserApi.createDebugClass({
        ...classForm,
        period: classForm.period || undefined,
        schedule: payload.schedule,
      });
    },
    onSuccess: async (response) => {
      if (editingDebugClass) resetClassEditor();
      if (response?.meta?.synchronization.status === 'PENDING') {
        setSynchronizationNotice(
          `La clase sí se guardó, pero falta propagarla a los demás servicios (${response.meta.synchronization.error ?? 'error temporal'}). No repitas el guardado; usa “Sincronizar datos”.`,
        );
      } else {
        setSynchronizationNotice(null);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['super-user', 'debug'] }),
        queryClient.invalidateQueries({ queryKey: ['super-user', 'beacons'] }),
        queryClient.invalidateQueries({ queryKey: ['super-user', 'bindings'] }),
      ]);
    },
  });

  const updateScheduleSlot = (day: DebugDay, index: number, patch: Partial<DebugScheduleSlot>) => {
    setSchedule((current) => ({
      ...current,
      [day]: current[day].map((slot, slotIndex) => slotIndex === index ? { ...slot, ...patch } : slot),
    }));
  };

  const addScheduleSlot = (day: DebugDay) => {
    setSchedule((current) => ({
      ...current,
      [day]: [...current[day], { startTime: '08:00', endTime: '09:00' }],
    }));
  };

  const removeScheduleSlot = (day: DebugDay, index: number) => {
    setSchedule((current) => ({
      ...current,
      [day]: current[day].filter((_, slotIndex) => slotIndex !== index),
    }));
  };

  const enabled = debugEnabled;
  const startClassEdit = (item: DebugClass) => {
    setEditingDebugClass(item);
    setClassForm({
      professorEmail: item.professor.institutionalEmail,
      professorName: item.professor.name,
      code: item.code,
      groupLetter: item.groupLetter,
      period: item.period,
      name: item.name,
      level: item.level,
      classroom: item.classroom,
      beaconUuid: item.beaconUuid,
    });
    setSchedule(debugScheduleFromApi(item.schedule));
  };
  const duplicateClass = (item: DebugClass) => {
    setEditingDebugClass(null);
    setClassForm({
      professorEmail: item.professor.institutionalEmail,
      professorName: item.professor.name,
      code: nextDebugCode(item.code, classes.data?.data.map((debugClass) => debugClass.code) ?? []),
      groupLetter: item.groupLetter,
      period: item.period,
      name: `${item.name} copia`,
      level: item.level,
      classroom: item.classroom,
      beaconUuid: item.beaconUuid,
    });
    setSchedule(debugScheduleFromApi(item.schedule));
  };
  const resetClassEditor = () => {
    setEditingDebugClass(null);
    setClassForm({
      professorEmail: 'profesor.demo@uat.edu.mx',
      professorName: 'Profesor Demo',
      code: '990001',
      groupLetter: 'DBG',
      period: '',
      name: 'DEBUG ASISTENCIA',
      level: 'DEBUG',
      classroom: 'DEBUG-101',
      beaconUuid: '11111111-2222-4333-8444-555555555555',
    });
    setSchedule(defaultDebugSchedule);
  };

  if (status.isError) {
    return (
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-red-50 p-2.5 text-[#C8102E]"><Bug size={21} /></div>
          <div>
            <h2 className="font-bold">No se pudo consultar el estado de Debug</h2>
            <p className="mt-1 text-sm text-slate-500">Reintenta en unos segundos. Las funciones de prueba permanecen inaccesibles mientras no se confirme su estado.</p>
          </div>
        </div>
      </Card>
    );
  }

  if (!status.isPending && !enabled) {
    return (
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><Bug size={21} /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold">Modo demo desactivado</h2>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black uppercase text-emerald-800">Producción real</span>
            </div>
            <p className="mt-2 text-sm text-slate-500">{status.data?.data.apiRestPolicy}</p>
            <p className="mt-2 text-sm text-slate-500">Activa PRESENCIA_DEBUG_MODE únicamente en un proyecto Dokploy aislado y marcado como entorno demo.</p>
          </div>
        </div>
      </Card>
    );
  }

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
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => synchronize.mutate()} disabled={synchronize.isPending}>
              <RefreshCw size={16} />{synchronize.isPending ? 'Sincronizando...' : 'Sincronizar datos'}
            </Button>
            {enabled && (
              <Button variant="danger" onClick={() => { setShowResetConfirmation(true); resetDemoData.reset(); }} disabled={resetDemoData.isPending}>
                <Trash2 size={16} />Borrar datos demo
              </Button>
            )}
            <span className={cn('rounded-full px-3 py-1 text-xs font-black uppercase', enabled ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')}>
              {enabled ? 'Demo activo' : 'Release real'}
            </span>
          </div>
        </div>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <InfoBox label="Periodo" value={status.data?.data.period ?? '-'} />
          <InfoBox label="Actualizado" value={status.data?.meta.generatedAt ? new Date(status.data.meta.generatedAt).toLocaleTimeString('es-MX') : '-'} />
        </div>
        {resetDemoData.isSuccess && (
          <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
            Los datos demo fueron eliminados correctamente. La cuenta de superusuario y las migraciones se conservaron.
          </p>
        )}
        {synchronizationNotice && (
          <p role="status" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            {synchronizationNotice}
          </p>
        )}
        {synchronize.isError && (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {apiErrorMessage(synchronize.error, 'No se pudo completar la sincronización. Revisa la salud de Academic y Attendance Service.')}
          </p>
        )}
      </Card>

      {showResetConfirmation && (
        <Card role="alertdialog" aria-labelledby="demo-reset-title" aria-describedby="demo-reset-description" className="border-red-300 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950/20">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-red-100 p-2.5 text-red-700 dark:bg-red-950 dark:text-red-300"><Trash2 size={21} /></div>
            <div className="min-w-0 flex-1">
              <h2 id="demo-reset-title" className="font-black text-red-900 dark:text-red-200">Borrar todos los datos de la demo</h2>
              <p id="demo-reset-description" className="mt-1 text-sm text-red-800/80 dark:text-red-300/80">
                Se eliminarán profesores, alumnos, materias, asistencias, vínculos de teléfonos, beacons y sesiones demo. Esta acción no se puede deshacer.
              </p>
              <label className="mt-4 block max-w-md text-sm font-bold text-red-900 dark:text-red-200">
                Escribe <span className="font-mono">BORRAR DEMO</span> para confirmar
                <input
                  className="field mt-1 border-red-300 bg-white font-mono dark:border-red-900 dark:bg-[#15181d]"
                  value={resetConfirmation}
                  onChange={(event) => setResetConfirmation(event.target.value)}
                  autoComplete="off"
                  autoFocus
                />
              </label>
              {resetDemoData.isError && (
                <p role="alert" className="mt-3 text-sm font-semibold text-red-700 dark:text-red-300">
                  {apiErrorMessage(resetDemoData.error, 'No se pudo completar el borrado. Vuelve a intentarlo.')}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="danger" disabled={resetConfirmation !== 'BORRAR DEMO' || resetDemoData.isPending} onClick={() => resetDemoData.mutate()}>
                  <Trash2 size={16} />{resetDemoData.isPending ? 'Borrando...' : 'Borrar definitivamente'}
                </Button>
                <Button variant="secondary" disabled={resetDemoData.isPending} onClick={() => { setShowResetConfirmation(false); setResetConfirmation(''); resetDemoData.reset(); }}>Cancelar</Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-violet-50 p-2.5 text-violet-700"><UserCog size={21} /></div>
            <div><h2 className="font-bold">Profesores demo</h2><p className="text-sm text-slate-500">Cuentas ficticias para iniciar sesión en la app del profesor.</p></div>
          </div>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); createTeacher.mutate(); }}>
            <label className="text-sm font-semibold">Nombre<input className="field mt-1" value={teacherForm.name} onChange={(event) => setTeacherForm((current) => ({ ...current, name: event.target.value }))} required /></label>
            <label className="text-sm font-semibold">Correo<input type="email" className="field mt-1" value={teacherForm.email} onChange={(event) => setTeacherForm((current) => ({ ...current, email: event.target.value }))} required /></label>
            <label className="text-sm font-semibold sm:col-span-2">Contraseña demo<input type="password" minLength={8} className="field mt-1" value={teacherForm.password} onChange={(event) => setTeacherForm((current) => ({ ...current, password: event.target.value }))} autoComplete="new-password" required /></label>
            <Button type="submit" disabled={createTeacher.isPending}><PlusCircle size={16} />Agregar profesor</Button>
          </form>
          {createTeacher.isError && <p className="mt-3 text-sm font-semibold text-red-600">{apiErrorMessage(createTeacher.error, 'No se pudo crear el profesor; revisa que el correo no exista.')}</p>}
          <div className="mt-4 space-y-2">
            {catalog.data?.data.teachers.map((teacher) => (
              <div key={teacher.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-[#2e3138]">
                <div className="min-w-0"><b>{teacher.name}</b><p className="truncate text-xs text-slate-500">{teacher.email} · ID {teacher.externalId}</p></div>
                <Button type="button" variant="ghost" aria-label={`Eliminar ${teacher.name}`} onClick={() => deleteTeacher.mutate(teacher.id)}><Trash2 size={15} /></Button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-cyan-50 p-2.5 text-cyan-700"><Users size={21} /></div>
            <div><h2 className="font-bold">Alumnos demo</h2><p className="text-sm text-slate-500">Cuentas, matrícula y UUID ficticios para horarios y asistencia.</p></div>
          </div>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); createStudent.mutate(); }}>
            <label className="text-sm font-semibold">Nombre<input className="field mt-1" value={studentForm.name} onChange={(event) => setStudentForm((current) => ({ ...current, name: event.target.value }))} required /></label>
            <label className="text-sm font-semibold">Matrícula<input className="field mt-1" value={studentForm.matricula} onChange={(event) => setStudentForm((current) => ({ ...current, matricula: event.target.value }))} required /></label>
            <label className="text-sm font-semibold">Correo<input type="email" className="field mt-1" value={studentForm.email} onChange={(event) => setStudentForm((current) => ({ ...current, email: event.target.value }))} required /></label>
            <label className="text-sm font-semibold">Carrera<input className="field mt-1" value={studentForm.careerName} onChange={(event) => setStudentForm((current) => ({ ...current, careerName: event.target.value }))} required /></label>
            <label className="text-sm font-semibold sm:col-span-2">Contraseña demo<input type="password" minLength={8} className="field mt-1" value={studentForm.password} onChange={(event) => setStudentForm((current) => ({ ...current, password: event.target.value }))} autoComplete="new-password" required /></label>
            <Button type="submit" disabled={createStudent.isPending}><PlusCircle size={16} />Agregar alumno</Button>
          </form>
          {createStudent.isError && <p className="mt-3 text-sm font-semibold text-red-600">{apiErrorMessage(createStudent.error, 'No se pudo crear el alumno; revisa correo y matrícula.')}</p>}
          <div className="mt-4 space-y-2">
            {catalog.data?.data.students.map((student) => (
              <div key={student.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-[#2e3138]">
                <div className="min-w-0"><b>{student.name}</b><p className="truncate text-xs text-slate-500">{student.matricula} · {student.email}</p></div>
                <Button type="button" variant="ghost" aria-label={`Eliminar ${student.name}`} onClick={() => deleteStudent.mutate(student.id)}><Trash2 size={15} /></Button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><Database size={21} /></div>
            <div className="min-w-0 flex-1"><h2 className="font-bold">{editingDebugClass ? 'Editar materia debug' : 'Crear materia debug'}</h2><p className="text-sm text-slate-500">Materia, salón, beacon y horarios para pruebas.</p></div>
            <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={resetClassEditor}><PlusCircle size={14} />Nueva</Button>
          </div>
          {editingDebugClass && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-800">Editando la clase de {editingDebugClass.professor.name}. El profesor no se cambia desde aquí; solo la configuración de la materia.</p>}
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); saveClass.mutate(); }}>
            <label className="block text-sm font-semibold">Profesor<select className="field mt-1" value={classForm.professorEmail} disabled={Boolean(editingDebugClass)} onChange={(event) => {
              const teacher = catalog.data?.data.teachers.find((item) => item.email === event.target.value);
              setClassForm((current) => ({ ...current, professorEmail: event.target.value, professorName: teacher?.name ?? current.professorName }));
            }} required><option value="">Selecciona un profesor</option>{catalog.data?.data.teachers.map((teacher) => <option key={teacher.id} value={teacher.email}>{teacher.name} · {teacher.email}</option>)}</select></label>
            <label className="block text-sm font-semibold">Nombre profesor<input className="field mt-1" value={classForm.professorName} disabled={Boolean(editingDebugClass)} onChange={(event) => setClassForm((current) => ({ ...current, professorName: event.target.value }))} /></label>
            <label className="block text-sm font-semibold">Materia<input className="field mt-1" value={classForm.name} onChange={(event) => setClassForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-semibold">Código<input className="field mt-1" value={classForm.code} onChange={(event) => setClassForm((current) => ({ ...current, code: event.target.value }))} /></label>
              <label className="block text-sm font-semibold">Grupo<input className="field mt-1" value={classForm.groupLetter} onChange={(event) => setClassForm((current) => ({ ...current, groupLetter: event.target.value }))} /></label>
            </div>
            {!editingDebugClass && <p className="text-xs font-semibold text-slate-500">Si el código ya existe para este maestro, se creará otra materia con el siguiente código disponible.</p>}
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-semibold">Salón<input className="field mt-1" value={classForm.classroom} onChange={(event) => setClassForm((current) => ({ ...current, classroom: event.target.value }))} /></label>
              <label className="block text-sm font-semibold">Periodo<input className="field mt-1" value={classForm.period} onChange={(event) => setClassForm((current) => ({ ...current, period: event.target.value }))} placeholder={status.data?.data.period ?? '2026-2'} /></label>
            </div>
            <label className="block text-sm font-semibold">Beacon UUID<input className="field mt-1 font-mono text-xs" value={classForm.beaconUuid} onChange={(event) => setClassForm((current) => ({ ...current, beaconUuid: event.target.value }))} required /></label>
            <div className="space-y-2">
              <p className="text-sm font-bold">Horarios</p>
              {DEBUG_DAYS.map((day) => (
                <div key={day.key} className="rounded-lg border border-slate-200 p-3 dark:border-[#2e3138]">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-black">{day.label}</span>
                    <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => addScheduleSlot(day.key)}>Agregar</Button>
                  </div>
                  {!schedule[day.key].length ? <p className="text-xs text-slate-400">Sin clase</p> : schedule[day.key].map((slot, index) => (
                    <div key={`${day.key}-${index}`} className="mb-2 grid grid-cols-[1fr_1fr_auto] gap-2 last:mb-0">
                      <input type="time" className="field" value={slot.startTime} onChange={(event) => updateScheduleSlot(day.key, index, { startTime: event.target.value })} />
                      <input type="time" className="field" value={slot.endTime} onChange={(event) => updateScheduleSlot(day.key, index, { endTime: event.target.value })} />
                      <Button type="button" variant="ghost" className="px-2" onClick={() => removeScheduleSlot(day.key, index)}><Trash2 size={15} /></Button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saveClass.isPending || !hasAnyDebugSchedule(schedule)}>
                {saveClass.isPending ? 'Guardando...' : editingDebugClass ? 'Guardar cambios' : 'Guardar clase debug'}
              </Button>
              {editingDebugClass && <Button type="button" variant="secondary" onClick={resetClassEditor}>Cancelar edición</Button>}
            </div>
          </form>
          {saveClass.isError && <p className="mt-3 text-sm font-semibold text-red-600">{apiErrorMessage(saveClass.error, 'No se pudo guardar la clase debug.')}</p>}
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 p-5 dark:border-[#1f2229]"><h2 className="font-bold">Clases debug en base</h2></div>
          {classes.isLoading ? <div className="p-5"><Skeleton className="h-24" /></div> : !classes.data?.data.length ? <div className="p-5"><EmptyState icon={<Database />} title="Sin clases debug" description="Crea una clase para probar el flujo completo." /></div> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-[#15181d]"><tr><th className="px-5 py-3">Materia</th><th className="px-5 py-3">Profesor</th><th className="px-5 py-3">Salón</th><th className="px-5 py-3">Horario desplegado</th><th className="px-5 py-3">Alumnos</th><th className="px-5 py-3">Registros</th><th className="px-5 py-3 text-right">Acciones</th></tr></thead>
                <tbody>{classes.data.data.map((item) => <tr key={item.id} className={cn('border-t border-slate-100 align-top dark:border-[#1f2229]', editingDebugClass?.id === item.id && 'bg-amber-50/60 dark:bg-amber-950/10')}><td className="px-5 py-4"><b>{item.name}</b><p className="text-xs text-slate-500">{item.code} {item.groupLetter} · {item.period}</p></td><td className="px-5 py-4">{item.professor.name}<p className="text-xs text-slate-500">{item.professor.institutionalEmail}</p></td><td className="px-5 py-4">{item.classroom}</td><td className="px-5 py-4">{renderDebugSchedule(item.schedule)}</td><td className="px-5 py-4">{item.students.length}</td><td className="px-5 py-4">{item.attendanceRecords.length}</td><td className="px-5 py-4"><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => startClassEdit(item)}><Pencil size={14} />Editar</Button><Button variant="ghost" onClick={() => duplicateClass(item)}><Copy size={14} />Duplicar</Button><Button variant="ghost" aria-label={`Eliminar ${item.name}`} onClick={() => deleteClass.mutate(item.id)}><Trash2 size={14} /></Button></div></td></tr>)}</tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h2 className="font-bold">Padrón y simulación de asistencia</h2><p className="text-sm text-slate-500">Asigna alumnos demo o alumnos que ya iniciaron sesión en el sistema y genera una captura interna sin escribir en UAT.</p></div>
          <div className="flex flex-wrap gap-3">
            <label className="text-xs font-bold uppercase text-slate-500">Fecha<input type="date" className="field mt-1" value={simulationDate} onChange={(event) => setSimulationDate(event.target.value)} /></label>
            <label className="text-xs font-bold uppercase text-slate-500">Estado<select className="field mt-1" value={simulationStatus} onChange={(event) => setSimulationStatus(event.target.value as typeof simulationStatus)}><option value="PRESENT">Presente</option><option value="ABSENT">Ausente</option><option value="LATE">Retardo</option><option value="EXCUSED">Justificado</option></select></label>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {classes.data?.data.map((item) => {
            const available = (catalog.data?.data.students ?? []).filter((student) => !item.students.some((assigned) => assigned.id === student.id));
            const availableRegistered = (registeredStudents.data?.data ?? []).filter((student) => (
              !item.students.some((assigned) => assigned.matricula === student.matricula)
            ));
            return (
              <div key={item.id} className="rounded-xl border border-slate-200 p-4 dark:border-[#2e3138]">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><b>{item.name}</b><p className="text-xs text-slate-500">{item.code} · {item.professor.name}</p></div><Button type="button" onClick={() => simulateAttendance.mutate(item)} disabled={!item.students.length || simulateAttendance.isPending}><Play size={15} />Simular {item.students.length}</Button></div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.students.map((student) => <span key={student.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs dark:bg-[#15181d]">{student.name}<button type="button" className="text-slate-500 hover:text-red-600" aria-label={`Quitar ${student.name}`} onClick={() => removeStudent.mutate({ classId: item.id, studentId: student.id })}>×</button></span>)}
                  {!item.students.length && <span className="text-xs text-slate-400">Sin alumnos asignados.</span>}
                </div>
                <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3 dark:border-blue-950 dark:bg-blue-950/10">
                  <label className="block text-xs font-bold uppercase text-blue-800 dark:text-blue-300">
                    Alumno ya registrado
                    <select className="field mt-1" aria-label={`Alumno registrado para ${item.name}`} value={selectedRegisteredStudents[item.id] ?? ''} onChange={(event) => setSelectedRegisteredStudents((current) => ({ ...current, [item.id]: event.target.value }))}>
                      <option value="">Selecciona por matrícula</option>
                      {availableRegistered.map((student) => <option key={student.id} value={student.matricula}>{student.name} · {student.matricula}</option>)}
                    </select>
                  </label>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">Aparecen quienes ya iniciaron sesión al menos una vez.</p>
                    <Button type="button" variant="secondary" disabled={!selectedRegisteredStudents[item.id] || addRegisteredStudent.isPending} onClick={() => {
                      const matricula = selectedRegisteredStudents[item.id];
                      if (matricula) addRegisteredStudent.mutate({ classId: item.id, matricula });
                    }}><PlusCircle size={15} />Asignar registrado</Button>
                  </div>
                </div>
                <div className="mt-3 flex gap-2"><select className="field" aria-label={`Alumno demo para ${item.name}`} value={selectedStudents[item.id] ?? ''} onChange={(event) => setSelectedStudents((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Selecciona alumno demo</option>{available.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.matricula}</option>)}</select><Button type="button" variant="secondary" disabled={!selectedStudents[item.id] || addStudent.isPending} onClick={() => {
                  const studentId = selectedStudents[item.id];
                  if (studentId) addStudent.mutate({ classId: item.id, studentId });
                }}><PlusCircle size={15} />Asignar demo</Button></div>
              </div>
            );
          })}
          {!classes.data?.data.length && <EmptyState icon={<Users />} title="Sin materias" description="Crea una materia antes de configurar su padrón." />}
        </div>
        {simulateAttendance.isError && <p className="mt-3 text-sm font-semibold text-red-600">No se pudo simular la asistencia. Revisa el padrón y vuelve a sincronizar.</p>}
        {addStudent.isError && <p className="mt-3 text-sm font-semibold text-red-600">{apiErrorMessage(addStudent.error, 'No se pudo asignar el alumno a la materia.')}</p>}
        {registeredStudents.isError && <p className="mt-3 text-sm font-semibold text-red-600">No se pudieron consultar los alumnos registrados.</p>}
        {addRegisteredStudent.isError && <p className="mt-3 text-sm font-semibold text-red-600">{apiErrorMessage(addRegisteredStudent.error, 'No se pudo asignar el alumno registrado a la materia debug.')}</p>}
      </Card>

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

function compactDebugSchedule(schedule: Record<DebugDay, DebugScheduleSlot[]>): DebugScheduleInput {
  return Object.fromEntries(
    DEBUG_DAYS
      .map((day) => [
        day.key,
        schedule[day.key].filter((slot) => slot.startTime && slot.endTime && slot.endTime > slot.startTime),
      ] as const)
      .filter(([, slots]) => slots.length > 0),
  ) as DebugScheduleInput;
}

function debugScheduleFromApi(value: Record<string, unknown>): Record<DebugDay, DebugScheduleSlot[]> {
  return Object.fromEntries(
    DEBUG_DAYS.map((day) => [day.key, readDebugSlots(value[day.key])]),
  ) as Record<DebugDay, DebugScheduleSlot[]>;
}

function readDebugSlots(value: unknown): DebugScheduleSlot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((slot) => {
    if (typeof slot === 'string') {
      const match = slot.match(/\b([0-2]?\d:[0-5]\d)\s*(?:-|a)\s*([0-2]?\d:[0-5]\d)\b/i);
      return match?.[1] && match[2] ? [{ startTime: padDebugTime(match[1]), endTime: padDebugTime(match[2]) }] : [];
    }
    if (!slot || typeof slot !== 'object') return [];
    const record = slot as { startTime?: unknown; endTime?: unknown };
    return typeof record.startTime === 'string' && typeof record.endTime === 'string'
      ? [{ startTime: record.startTime, endTime: record.endTime }]
      : [];
  });
}

function renderDebugSchedule(value: Record<string, unknown>) {
  const parts = DEBUG_DAYS.flatMap((day) => {
    const slots = readDebugSlots(value[day.key]);
    if (!slots.length) return [];
    return [{ day: day.label, slots }];
  });
  if (!parts.length) return <span className="text-xs text-slate-400">Sin horario</span>;
  return (
    <div className="grid gap-1.5">
      {parts.map((item) => (
        <div key={item.day} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-[#2e3138] dark:bg-[#15181d]">
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{item.day}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {item.slots.map((slot, index) => (
              <span key={`${item.day}-${slot.startTime}-${slot.endTime}-${index}`} className="rounded-md bg-white px-2 py-1 font-mono text-[11px] font-bold text-slate-700 ring-1 ring-slate-200 dark:bg-[#1a1d23] dark:text-slate-200 dark:ring-[#2e3138]">
                {slot.startTime}-{slot.endTime}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function nextDebugCode(code: string, existingCodes: string[]): string {
  const existing = new Set(existingCodes);
  const match = code.match(/^(.*?)(\d+)$/);
  if (!match) {
    for (let index = 2; index < 10_000; index += 1) {
      const candidate = `${code}-${index}`;
      if (!existing.has(candidate)) return candidate;
    }
    return `${code}-${Date.now()}`;
  }
  const [, prefix, numeric] = match;
  for (let next = Number(numeric) + 1; next < 1_000_000; next += 1) {
    const candidate = `${prefix}${String(next).padStart(numeric.length, '0')}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${prefix}${Date.now()}`;
}

function padDebugTime(value: string): string {
  const [hours, minutes] = value.split(':');
  return `${hours.padStart(2, '0')}:${minutes}`;
}

function hasAnyDebugSchedule(schedule: Record<DebugDay, DebugScheduleSlot[]>): boolean {
  return Object.values(compactDebugSchedule(schedule)).some((slots) => Array.isArray(slots) && slots.length > 0);
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-[#2e3138] dark:bg-[#15181d]"><p className="text-xs font-bold uppercase text-slate-400">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString('es-MX') : '-';
}

function apiErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  const response = Reflect.get(error, 'response');
  if (!response || typeof response !== 'object') return fallback;
  const data = Reflect.get(response, 'data');
  if (!data || typeof data !== 'object') return fallback;
  const message = Reflect.get(data, 'message');
  return typeof message === 'string' && message.trim() ? message : fallback;
}
