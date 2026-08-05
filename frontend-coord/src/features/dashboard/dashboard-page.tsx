import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  Bluetooth,
  BookOpenCheck,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  GraduationCap,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  Users,
} from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { coordinationApi } from '@/core/api/coordination.api';
import { useAuthStore } from '@/core/auth/auth.store';
import type { InfrastructureSummaryResponse, OverviewResponse, SharedClassAssignment } from '@/core/api/types';
import { Badge, Button, Card, EmptyState, Skeleton, cn } from '@/shared/components/ui';

export function DashboardPage() {
  const overview = useQuery({
    queryKey: ['coordination', 'overview'],
    queryFn: coordinationApi.overview,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const infrastructure = useQuery({
    queryKey: ['coordination', 'infrastructure-summary'],
    queryFn: coordinationApi.infrastructureSummary,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const sharedClasses = useQuery({
    queryKey: ['coordination', 'shared-classes'],
    queryFn: coordinationApi.sharedClasses,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  if (overview.isLoading || sharedClasses.isLoading) return <DashboardSkeleton />;

  if (overview.isError || !overview.data) {
    return (
      <EmptyState
        icon={<RefreshCw size={34} />}
        title="No pudimos cargar el resumen"
        description="Verifica la conexión con el servicio de coordinación."
      />
    );
  }

  return (
    <DashboardContent
      overview={overview.data}
      infrastructure={infrastructure.data ?? emptyInfrastructureSummary()}
      sharedClasses={sharedClasses.data?.data ?? []}
    />
  );
}

function DashboardContent({
  overview,
  infrastructure,
  sharedClasses,
}: {
  overview: OverviewResponse;
  infrastructure: InfrastructureSummaryResponse;
  sharedClasses: SharedClassAssignment[];
}) {
  const { counts } = overview.data;
  const operational = infrastructure.data;
  const activeCoverages = sharedClasses.filter((assignment) => assignment.active);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-[#17191f] text-white shadow-lg shadow-slate-900/10">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#C8102E]/30 blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-36 w-36 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative p-6 sm:p-8">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-red-300">
            <CalendarCheck2 size={15} /> Supervisión docente
          </div>
          <h2 className="mt-3 max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
            Todo listo para revisar la asistencia de tus profesores
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Consulta reportes, valida la carga académica y atiende coberturas desde un solo lugar.
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Profesores"
          value={counts.teachers}
          note="Disponibles para consulta"
          icon={<Users size={21} />}
          accent="bg-red-50 text-[#C8102E] dark:bg-red-950/30 dark:text-red-400"
        />
        <MetricCard
          label="Grupos"
          value={counts.assignments}
          note={`${formatNumber(counts.subjects)} materias descubiertas`}
          icon={<GraduationCap size={21} />}
          accent="bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
        />
        <MetricCard
          label="Beacons de salón"
          value={operational.counts.beacons}
          note="Espacios listos para presencia"
          icon={<Bluetooth size={21} />}
          accent="bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-400"
        />
        <MetricCard
          label="Estatus de asignaciones docentes"
          value={activeCoverages.length}
          note={activeCoverages.length ? 'Coberturas de cátedra vigentes' : 'Sin coberturas de cátedra vigentes'}
          icon={<ShieldCheck size={21} />}
          accent="bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
          alert={activeCoverages.length > 0}
        />
      </section>

      <AttendanceSettingsCard />

      <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <Card className="overflow-hidden">
          <SectionHeading
            eyebrow="Flujo de trabajo"
            title="Accesos rápidos"
            description="Las tareas más frecuentes de coordinación, a un clic."
          />
          <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
            <QuickAction
              to="/reportes/asistencia"
              icon={<BarChart3 size={20} />}
              title="Revisar asistencias"
              description="Semanal o por rango de fechas"
              tone="brand"
            />
            <QuickAction
              to="/carga-academica"
              icon={<BookOpenCheck size={20} />}
              title="Gestionar clases"
              description="Carga y clases compartidas"
              tone="blue"
            />
            <QuickAction
              to="/superUsuario"
              icon={<Bluetooth size={20} />}
              title="Validar salones"
              description="Beacons y permisos"
              tone="cyan"
            />
          </div>

          <div className="border-t border-slate-100 p-5 dark:border-[#1f2229]">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Señales operativas</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <OperationalSignal
                icon={<Building2 size={17} />}
                value={counts.coordinations}
                label="Coordinaciones"
              />
              <OperationalSignal
                icon={<Smartphone size={17} />}
                value={operational.counts.studentDeviceBindings}
                label="Dispositivos vinculados"
              />
              <OperationalSignal
                icon={<CalendarCheck2 size={17} />}
                value={operational.counts.studentBleAttendances}
                label="Detecciones recibidas"
              />
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <SectionHeading
            eyebrow="Atención"
            title="Coberturas de cátedra vigentes"
            description="Asignaciones vigentes que pueden afectar quién registra asistencia."
            action={<Link to="/carga-academica" className="text-xs font-semibold text-[#C8102E] hover:underline">Gestionar</Link>}
          />
          {activeCoverages.length === 0 ? (
            <div className="grid min-h-64 place-items-center p-6 text-center">
              <div>
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
                  <CheckCircle2 size={24} />
                </div>
                <p className="mt-3 font-semibold">Sin coberturas de cátedra vigentes</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">No hay asignaciones docentes vigentes que atender.</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-[#1f2229]">
              {activeCoverages.slice(0, 4).map((assignment) => (
                <div key={assignment.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{assignment.sourceAssignment.subject.name}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {assignment.sourceAssignment.groupCode || assignment.sourceAssignment.externalGroupId} - {assignment.sourceAssignment.classroom || 'Sin salón'}
                      </p>
                    </div>
                    <Badge tone="warning">Vigente</Badge>
                  </div>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                    <b>{assignment.assignedTeacher.name}</b> cubre a {assignment.sourceAssignment.teacher.name}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

function AttendanceSettingsCard() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const canEdit = user?.role === 'COORDINATOR';
  const [minutes, setMinutes] = useState('');
  const settings = useQuery({
    queryKey: ['coordination', 'attendance-settings'],
    queryFn: coordinationApi.attendanceSettings,
    refetchOnWindowFocus: false,
  });
  const updateSettings = useMutation({
    mutationFn: coordinationApi.updateAttendanceSettings,
    onSuccess: async (response) => {
      queryClient.setQueryData(['coordination', 'attendance-settings'], response);
      setMinutes(String(response.data.teacherAttendanceToleranceMinutes));
      await queryClient.invalidateQueries({ queryKey: ['coordination', 'attendance-settings'] });
    },
  });

  useEffect(() => {
    const current = settings.data?.data.teacherAttendanceToleranceMinutes;
    if (current !== undefined) setMinutes(String(current));
  }, [settings.data?.data.teacherAttendanceToleranceMinutes]);

  const parsedMinutes = Number(minutes);
  const valid = Number.isInteger(parsedMinutes) && parsedMinutes >= 0 && parsedMinutes <= 120;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canEdit && valid) {
      updateSettings.mutate({ teacherAttendanceToleranceMinutes: parsedMinutes });
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-end sm:p-6">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#C8102E]">
            <Clock3 size={15} /> Configuración de asistencia
          </p>
          <h2 className="mt-2 font-bold">Tolerancia para cerrar una clase</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Se aplica a la asistencia del profesor y al bloqueo de las tarjetas del alumno. Por ejemplo, una clase que termina a las 13:00 con 10 minutos de tolerancia permanece disponible hasta las 13:10.
          </p>
          {!canEdit && (
            <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
              Tu cuenta es de sólo lectura; puedes consultar el valor, pero no modificarlo.
            </p>
          )}
        </div>
        <form className="flex items-end gap-3" onSubmit={submit}>
          <label className="block min-w-40 text-sm font-semibold">
            Minutos
            <input
              aria-label="Minutos de tolerancia"
              type="number"
              min={0}
              max={120}
              step={1}
              className="field mt-1"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              disabled={settings.isLoading || settings.isError || !canEdit}
            />
          </label>
          <Button type="submit" disabled={!canEdit || !valid || settings.isLoading || settings.isError || updateSettings.isPending}>
            <Save size={16} /> {updateSettings.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </form>
      </div>
      {settings.isError && (
        <p role="alert" className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700 dark:border-red-950 dark:bg-red-950/20 dark:text-red-400">
          No se pudo consultar la configuración persistida de asistencia.
        </p>
      )}
      {updateSettings.isSuccess && (
        <p role="status" className="border-t border-emerald-100 bg-emerald-50 px-5 py-3 text-sm text-emerald-700 dark:border-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-400">
          Tolerancia actualizada. Las apps recibirán el nuevo valor en su siguiente sincronización.
        </p>
      )}
      {updateSettings.isError && (
        <p role="alert" className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700 dark:border-red-950 dark:bg-red-950/20 dark:text-red-400">
          No se pudo guardar la tolerancia. Inténtalo de nuevo.
        </p>
      )}
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-72" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-36" />)}
      </div>
      <div className="grid gap-5 xl:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
    </div>
  );
}

function emptyInfrastructureSummary(): InfrastructureSummaryResponse {
  return {
    data: {
      counts: {
        beacons: 0,
        studentDeviceBindings: 0,
        studentBleAttendances: 0,
        activeSubstitutions: 0,
      },
      recentBindings: [],
      recentBeacons: [],
      recentSubstitutions: [],
    },
    meta: { generatedAt: new Date(0).toISOString() },
  };
}

function MetricCard({ label, value, note, icon, accent, alert = false }: { label: string; value: number; note: string; icon: ReactNode; accent: string; alert?: boolean }) {
  return (
    <Card className={cn('p-5 transition hover:-translate-y-0.5 hover:shadow-md', alert && 'border-amber-200 dark:border-amber-900/60')}>
      <div className="flex items-start justify-between gap-4">
        <div className={`grid h-11 w-11 place-items-center rounded-xl ${accent}`}>{icon}</div>
        {alert && <span className="h-2.5 w-2.5 rounded-full bg-amber-400 ring-4 ring-amber-100 dark:ring-amber-950" />}
      </div>
      <p className="mt-5 text-3xl font-bold tracking-tight">{formatNumber(value)}</p>
      <p className="mt-1 text-sm font-semibold">{label}</p>
      <p className="mt-1 text-xs text-slate-400">{note}</p>
    </Card>
  );
}

function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 dark:border-[#1f2229]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C8102E]">{eyebrow}</p>
        <h2 className="mt-1 font-bold">{title}</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      {action}
    </div>
  );
}

function QuickAction({ to, icon, title, description, tone }: { to: string; icon: ReactNode; title: string; description: string; tone: 'brand' | 'blue' | 'cyan' }) {
  const tones = {
    brand: 'bg-red-50 text-[#C8102E] dark:bg-red-950/30 dark:text-red-400',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
    cyan: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-400',
  };
  return (
    <Link to={to} className="group rounded-xl border border-slate-200/80 p-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm dark:border-[#2e3138] dark:hover:border-[#3a3e47]">
      <div className={cn('grid h-10 w-10 place-items-center rounded-lg', tones[tone])}>{icon}</div>
      <p className="mt-4 text-sm font-bold">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
      <ArrowRight size={15} className="mt-3 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-[#C8102E]" />
    </Link>
  );
}

function OperationalSignal({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 dark:bg-white/[.04]">
      <div className="text-slate-400">{icon}</div>
      <div>
        <p className="text-lg font-bold tabular-nums">{formatNumber(value)}</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}

function formatNumber(value: number) {
  return value.toLocaleString('es-MX');
}
