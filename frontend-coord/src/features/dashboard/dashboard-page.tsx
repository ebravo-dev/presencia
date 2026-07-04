import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowRight, Bluetooth, BookOpen, Building2, Clock3, GraduationCap, Link2, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { coordinationApi } from '@/core/api/coordination.api';
import type { InfrastructureSummaryResponse, OverviewResponse } from '@/core/api/types';
import { Badge, Button, Card, EmptyState, Skeleton } from '@/shared/components/ui';

const academicCards = [
  { key: 'teachers', label: 'Profesores indexados', icon: Users, accent: 'bg-red-50 text-[#C8102E]' },
  { key: 'subjects', label: 'Materias descubiertas', icon: BookOpen, accent: 'bg-blue-50 text-blue-700' },
  { key: 'assignments', label: 'Grupos mapeados', icon: GraduationCap, accent: 'bg-emerald-50 text-emerald-700' },
  { key: 'coordinations', label: 'Coordinaciones', icon: Building2, accent: 'bg-amber-50 text-amber-700' },
] as const;

const infrastructureCards = [
  { key: 'beacons', label: 'Beacons de salón', icon: Bluetooth, accent: 'bg-cyan-50 text-cyan-700' },
  { key: 'studentDeviceBindings', label: 'Celulares vinculados', icon: Link2, accent: 'bg-violet-50 text-violet-700' },
  { key: 'studentBleAttendances', label: 'Detecciones BLE recibidas', icon: Activity, accent: 'bg-emerald-50 text-emerald-700' },
  { key: 'activeSubstitutions', label: 'Sustituciones activas', icon: ShieldCheck, accent: 'bg-orange-50 text-orange-700' },
] as const;

const REFRESH_INTERVAL_MS = 10_000;

export function DashboardPage() {
  const overview = useQuery({ queryKey: ['coordination', 'overview'], queryFn: coordinationApi.overview, refetchInterval: REFRESH_INTERVAL_MS });
  const infrastructure = useQuery({ queryKey: ['coordination', 'infrastructure-summary'], queryFn: coordinationApi.infrastructureSummary, refetchInterval: REFRESH_INTERVAL_MS });

  if (overview.isLoading || infrastructure.isLoading) {
    return <div className="space-y-8">
      <Skeleton className="h-32"/>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{academicCards.map((item) => <Skeleton key={item.key} className="h-36"/>)}</div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{infrastructureCards.map((item) => <Skeleton key={item.key} className="h-36"/>)}</div>
      <Skeleton className="h-72"/>
    </div>;
  }

  if (overview.isError || infrastructure.isError || !overview.data || !infrastructure.data) {
    return <EmptyState icon={<RefreshCw size={34}/>} title="No pudimos cargar el resumen" description="Verifica la conexión entre coordinación, backend-apirest y el backend de asistencia." />;
  }

  return <DashboardContent overview={overview.data} infrastructure={infrastructure.data}/>;
}

function DashboardContent({ overview, infrastructure }: { overview: OverviewResponse; infrastructure: InfrastructureSummaryResponse }) {
  const { counts, coordinations } = overview.data;
  const operational = infrastructure.data;
  const lastUpdate = latestDate(overview.meta.generatedAt, infrastructure.meta.generatedAt);

  return <div className="space-y-8">
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-0 lg:grid-cols-[1.45fr_.55fr]">
        <div className="p-6 sm:p-7">
          <p className="text-sm font-semibold text-[#C8102E]">Centro operativo</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Coordinación académica y presencia BLE</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Monitorea la cosecha académica del portal UAT, la infraestructura BLE del salón, los celulares vinculados y las sustituciones que afectan la toma de asistencia.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild><Link to="/infraestructura">Gestionar infraestructura <ArrowRight size={17}/></Link></Button>
            <Button asChild variant="secondary"><Link to="/carga-academica">Revisar carga académica</Link></Button>
          </div>
        </div>
        <div className="border-t border-slate-200 bg-slate-50 p-6 lg:border-l lg:border-t-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Clock3 size={15}/>Actualizado</div>
          <p className="mt-2 text-lg font-bold text-slate-900">{formatDateTime(lastUpdate)}</p>
          <p className="mt-2 text-sm text-slate-500">El resumen operativo viene del backend de asistencia mediante el canal interno autenticado.</p>
        </div>
      </div>
    </section>

    <MetricSection title="Cosecha académica" description="Datos acumulados cada vez que un profesor inicia sesión.">
      {academicCards.map(({ key, label, icon: Icon, accent }) => <MetricCard key={key} label={label} value={counts[key]} icon={<Icon size={21}/>} accent={accent}/>)}
    </MetricSection>

    <MetricSection title="Operación de asistencia" description="Estado actual de beacons, celulares vinculados y sustituciones.">
      {infrastructureCards.map(({ key, label, icon: Icon, accent }) => <MetricCard key={key} label={label} value={operational.counts[key]} icon={<Icon size={21}/>} accent={accent}/>)}
    </MetricSection>

    <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <h2 className="font-bold">Actividad BLE reciente</h2>
          <p className="text-sm text-slate-500">Últimos celulares vinculados desde la app de alumnos.</p>
        </div>
        {operational.recentBindings.length === 0 ? <div className="p-5"><EmptyState icon={<Link2 size={34}/>} title="Sin vinculaciones" description="Los alumnos aparecerán aquí cuando vinculen su celular."/></div> : <div className="divide-y divide-slate-100">
          {operational.recentBindings.map((binding) => <div key={binding.id} className="flex items-start justify-between gap-4 p-5">
            <div className="min-w-0">
              <p className="font-semibold">{binding.matricula}</p>
              <p className="mt-1 truncate font-mono text-xs text-slate-500">{binding.attendanceUuid}</p>
              <p className="mt-2 text-sm text-slate-600">{binding.students[0]?.name ?? 'Alumno no sincronizado'}</p>
            </div>
            <Badge tone={binding.students.length ? 'success' : 'warning'}>{binding.students.length ? 'En lista' : 'Sin lista'}</Badge>
          </div>)}
        </div>}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <h2 className="font-bold">Sustituciones activas</h2>
          <p className="text-sm text-slate-500">Clases que hoy pueden tomar asistencia con profesor sustituto.</p>
        </div>
        {operational.recentSubstitutions.length === 0 ? <div className="p-5"><EmptyState icon={<ShieldCheck size={34}/>} title="Sin sustituciones activas" description="Las asignaciones aparecerán cuando se activen desde infraestructura."/></div> : <div className="divide-y divide-slate-100">
          {operational.recentSubstitutions.map((assignment) => <div key={assignment.id} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">{assignment.group.name}</p>
                <p className="mt-1 text-sm text-slate-500">{assignment.group.groupLetter || 'Grupo'} · {assignment.group.classroom || 'Sin salón'}</p>
              </div>
              <Badge tone="info">Activa</Badge>
            </div>
            <p className="mt-3 text-sm text-slate-600"><b>{assignment.substituteProfessor.name}</b> cubre a {assignment.primaryProfessor.name}</p>
          </div>)}
        </div>}
      </Card>
    </section>

    <section>
      <div className="mb-4">
        <h2 className="text-lg font-bold">Cobertura por coordinación</h2>
        <p className="text-sm text-slate-500">Relaciones activas encontradas en la cosecha acumulativa.</p>
      </div>
      {coordinations.length === 0 ? <EmptyState icon={<Building2 size={34}/>} title="Aún no hay coordinaciones" description="Los datos aparecerán cuando los profesores comiencen a autenticarse."/> : <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-5 py-3">Coordinación</th><th className="px-5 py-3 text-right">Profesores</th><th className="px-5 py-3 text-right">Materias</th><th className="px-5 py-3 text-right">Grupos</th><th className="px-5 py-3">Cobertura</th></tr>
            </thead>
            <tbody>{coordinations.map((item) => {
              const width = counts.assignments ? Math.max(4, Math.round(item.assignmentCount / counts.assignments * 100)) : 0;
              return <tr key={item.id} className="border-b border-slate-100 last:border-0"><td className="px-5 py-4 font-semibold">{item.shortName || item.name}<span className="ml-2 text-xs font-normal text-slate-400">#{item.externalId}</span></td><td className="px-5 py-4 text-right tabular-nums">{formatNumber(item.teacherCount)}</td><td className="px-5 py-4 text-right tabular-nums">{formatNumber(item.subjectCount)}</td><td className="px-5 py-4 text-right tabular-nums">{formatNumber(item.assignmentCount)}</td><td className="w-48 px-5 py-4"><div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-[#C8102E]" style={{ width: `${width}%` }}/></div></td></tr>;
            })}</tbody>
          </table>
        </div>
      </Card>}
    </section>
  </div>;
}

function MetricSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section>
    <div className="mb-4">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="text-sm text-slate-500">{description}</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
  </section>;
}

function MetricCard({ label, value, icon, accent }: { label: string; value: number; icon: ReactNode; accent: string }) {
  return <Card className="p-5">
    <div className={`inline-flex rounded-xl p-2.5 ${accent}`}>{icon}</div>
    <p className="mt-6 text-3xl font-bold tracking-tight">{formatNumber(value)}</p>
    <p className="mt-1 text-sm text-slate-500">{label}</p>
  </Card>;
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
