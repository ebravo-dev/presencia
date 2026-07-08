import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Bluetooth,
  BookOpenCheck,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  GraduationCap,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { coordinationApi } from '@/core/api/coordination.api';
import type { InfrastructureSummaryResponse, OverviewResponse } from '@/core/api/types';
import { Badge, Button, Card, EmptyState, Skeleton, cn } from '@/shared/components/ui';

const REFRESH_INTERVAL_MS = 10_000;

export function DashboardPage() {
  const overview = useQuery({
    queryKey: ['coordination', 'overview'],
    queryFn: coordinationApi.overview,
    refetchInterval: REFRESH_INTERVAL_MS,
  });
  const infrastructure = useQuery({
    queryKey: ['coordination', 'infrastructure-summary'],
    queryFn: coordinationApi.infrastructureSummary,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  if (overview.isLoading || infrastructure.isLoading) return <DashboardSkeleton />;

  if (overview.isError || infrastructure.isError || !overview.data || !infrastructure.data) {
    return (
      <EmptyState
        icon={<RefreshCw size={34} />}
        title="No pudimos cargar el resumen"
        description="Verifica la conexión con los servicios de coordinación y asistencia."
      />
    );
  }

  return <DashboardContent overview={overview.data} infrastructure={infrastructure.data} />;
}

function DashboardContent({ overview, infrastructure }: { overview: OverviewResponse; infrastructure: InfrastructureSummaryResponse }) {
  const { counts, coordinations } = overview.data;
  const operational = infrastructure.data;
  const lastUpdate = latestDate(overview.meta.generatedAt, infrastructure.meta.generatedAt);
  const configuredForAttendance = operational.counts.beacons > 0 && counts.assignments > 0;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-[#17191f] text-white shadow-lg shadow-slate-900/10">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#C8102E]/30 blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-36 w-36 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative grid lg:grid-cols-[1fr_330px]">
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-red-300">
              <CalendarCheck2 size={15} /> Supervisión docente
            </div>
            <h2 className="mt-3 max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
              Todo listo para revisar la asistencia de tus profesores
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Consulta reportes, valida la carga académica y atiende sustituciones desde un solo lugar.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
                <Link to="/reportes/asistencia">Generar reporte <ArrowRight size={17} /></Link>
              </Button>
              <Button asChild variant="secondary" className="border-white/15 bg-white/10 text-white hover:border-white/25 hover:bg-white/15">
                <Link to="/carga-academica">Ver carga académica</Link>
              </Button>
            </div>
          </div>
          <div className="border-t border-white/10 bg-white/[.04] p-6 lg:border-l lg:border-t-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Estado del monitoreo</p>
            <div className="mt-4 flex items-center gap-3">
              <div className={cn('grid h-11 w-11 place-items-center rounded-full', configuredForAttendance ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300')}>
                {configuredForAttendance ? <CheckCircle2 size={23} /> : <BellRing size={22} />}
              </div>
              <div>
                <p className="font-bold">{configuredForAttendance ? 'Operación activa' : 'Configuración pendiente'}</p>
                <p className="text-xs text-slate-400">Datos actualizados automáticamente</p>
              </div>
            </div>
            <div className="mt-6 border-t border-white/10 pt-4">
              <div className="flex items-center gap-2 text-xs text-slate-400"><Clock3 size={14} /> Última actualización</div>
              <p className="mt-1 text-sm font-semibold">{formatDateTime(lastUpdate)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Profesores indexados"
          value={counts.teachers}
          note="Disponibles para consulta"
          icon={<Users size={21} />}
          accent="bg-red-50 text-[#C8102E] dark:bg-red-950/30 dark:text-red-400"
        />
        <MetricCard
          label="Grupos mapeados"
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
          label="Sustituciones activas"
          value={operational.counts.activeSubstitutions}
          note={operational.counts.activeSubstitutions ? 'Requieren seguimiento' : 'Sin incidencias vigentes'}
          icon={<ShieldCheck size={21} />}
          accent="bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
          alert={operational.counts.activeSubstitutions > 0}
        />
      </section>

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
            title="Sustituciones vigentes"
            description="Cambios que pueden afectar quién registra asistencia."
            action={<Link to="/superUsuario" className="text-xs font-semibold text-[#C8102E] hover:underline">Gestionar</Link>}
          />
          {operational.recentSubstitutions.length === 0 ? (
            <div className="grid min-h-64 place-items-center p-6 text-center">
              <div>
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
                  <CheckCircle2 size={24} />
                </div>
                <p className="mt-3 font-semibold">Sin sustituciones activas</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">No hay cambios docentes que atender.</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-[#1f2229]">
              {operational.recentSubstitutions.slice(0, 4).map((assignment) => (
                <div key={assignment.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{assignment.group.name}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {assignment.group.groupLetter || 'Grupo'} · {assignment.group.classroom || 'Sin salón'}
                      </p>
                    </div>
                    <Badge tone="warning">Activa</Badge>
                  </div>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                    <b>{assignment.substituteProfessor.name}</b> cubre a {assignment.primaryProfessor.name}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section>
        <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#C8102E]">Cobertura académica</p>
            <h2 className="mt-1 text-lg font-bold">Carga por coordinación</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Compara profesores, materias y grupos registrados.</p>
          </div>
          <Button asChild variant="ghost" className="self-start sm:self-auto">
            <Link to="/carga-academica">Explorar carga <ArrowRight size={16} /></Link>
          </Button>
        </div>
        {coordinations.length === 0 ? (
          <EmptyState icon={<Building2 size={34} />} title="Aún no hay coordinaciones" description="La cobertura aparecerá cuando se sincronicen profesores." />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-200/80 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-[#1f2229] dark:bg-[#15181d] dark:text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Coordinación</th>
                    <th className="px-5 py-3 text-right">Profesores</th>
                    <th className="px-5 py-3 text-right">Materias</th>
                    <th className="px-5 py-3 text-right">Grupos</th>
                    <th className="px-5 py-3">Volumen relativo</th>
                  </tr>
                </thead>
                <tbody>
                  {coordinations.map((item) => {
                    const maxAssignments = Math.max(...coordinations.map((coordination) => coordination.assignmentCount), 1);
                    const width = Math.max(5, Math.round((item.assignmentCount / maxAssignments) * 100));
                    return (
                      <tr key={item.id} className="border-b border-slate-100 last:border-0 dark:border-[#1f2229]">
                        <td className="px-5 py-4">
                          <p className="font-semibold">{item.shortName || item.name}</p>
                          <p className="mt-0.5 text-xs text-slate-400">{item.name}</p>
                        </td>
                        <td className="px-5 py-4 text-right tabular-nums">{formatNumber(item.teacherCount)}</td>
                        <td className="px-5 py-4 text-right tabular-nums">{formatNumber(item.subjectCount)}</td>
                        <td className="px-5 py-4 text-right font-semibold tabular-nums">{formatNumber(item.assignmentCount)}</td>
                        <td className="w-52 px-5 py-4">
                          <div className="h-2 rounded-full bg-slate-100 dark:bg-[#2e3138]">
                            <div className="h-2 rounded-full bg-gradient-to-r from-[#C8102E] to-red-400" style={{ width: `${width}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>
    </div>
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

function latestDate(...values: string[]) {
  return values.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? new Date().toISOString();
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatNumber(value: number) {
  return value.toLocaleString('es-MX');
}
