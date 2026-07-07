import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  Building2,
  Clock3,
  GraduationCap,
  RefreshCw,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { coordinationApi } from '@/core/api/coordination.api';
import type { OverviewResponse } from '@/core/api/types';
import { Button, Card, EmptyState, Skeleton } from '@/shared/components/ui';

const academicCards = [
  { key: 'teachers', label: 'Profesores indexados', icon: Users, accent: 'bg-red-50 text-[#C8102E] dark:bg-red-950/30 dark:text-red-400' },
  { key: 'subjects', label: 'Materias descubiertas', icon: BookOpen, accent: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400' },
  { key: 'assignments', label: 'Grupos mapeados', icon: GraduationCap, accent: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' },
  { key: 'coordinations', label: 'Coordinaciones', icon: Building2, accent: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' },
] as const;

const REFRESH_INTERVAL_MS = 10_000;

export function DashboardPage() {
  const overview = useQuery({ queryKey: ['coordination', 'overview'], queryFn: coordinationApi.overview, refetchInterval: REFRESH_INTERVAL_MS });

  if (overview.isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-32" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{academicCards.map((item) => <Skeleton key={item.key} className="h-36" />)}</div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (overview.isError || !overview.data) {
    return <EmptyState icon={<RefreshCw size={34} />} title="No pudimos cargar el resumen" description="Verifica la conexión del módulo de coordinación." />;
  }

  return <DashboardContent overview={overview.data} />;
}

function DashboardContent({ overview }: { overview: OverviewResponse }) {
  const { counts, coordinations } = overview.data;
  const lastUpdate = overview.meta.generatedAt;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-colors dark:border-[#1f2229] dark:bg-[#1a1d23]">
        <div className="grid gap-0 lg:grid-cols-[1.45fr_.55fr]">
          <div className="p-6 sm:p-7">
            <p className="text-sm font-semibold text-[#C8102E]">Centro operativo</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">Coordinación académica y presencia BLE</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Monitorea la cosecha académica del portal UAT, la asignación de profesores, materias y grupos, y genera reportes de asistencia para coordinación.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild variant="secondary"><Link to="/carga-academica">Revisar carga académica</Link></Button>
              <Button asChild><Link to="/reportes/asistencia">Ver reportes <ArrowRight size={17} /></Link></Button>
            </div>
          </div>
          <div className="border-t border-slate-200/80 bg-slate-50 p-6 transition-colors dark:border-[#1f2229] dark:bg-[#15181d] lg:border-l lg:border-t-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500"><Clock3 size={15} />Actualizado</div>
            <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">{formatDateTime(lastUpdate)}</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">La infraestructura BLE se administra desde el acceso de super usuario.</p>
          </div>
        </div>
      </section>

      <MetricSection title="Cosecha académica" description="Datos acumulados cada vez que un profesor inicia sesión.">
        {academicCards.map(({ key, label, icon: Icon, accent }) => <MetricCard key={key} label={label} value={counts[key]} icon={<Icon size={21} />} accent={accent} />)}
      </MetricSection>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Cobertura por coordinación</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Relaciones activas encontradas en la cosecha acumulativa.</p>
        </div>
        {coordinations.length === 0 ? (
          <EmptyState icon={<Building2 size={34} />} title="Aún no hay coordinaciones" description="Los datos aparecerán cuando los profesores comiencen a autenticarse." />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-slate-200/80 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-[#1f2229] dark:bg-[#15181d] dark:text-slate-500">
                  <tr><th className="px-5 py-3">Coordinación</th><th className="px-5 py-3 text-right">Profesores</th><th className="px-5 py-3 text-right">Materias</th><th className="px-5 py-3 text-right">Grupos</th><th className="px-5 py-3">Cobertura</th></tr>
                </thead>
                <tbody>
                  {coordinations.map((item) => {
                    const width = counts.assignments ? Math.max(4, Math.round(item.assignmentCount / counts.assignments * 100)) : 0;
                    return (
                      <tr key={item.id} className="border-b border-slate-100 last:border-0 dark:border-[#1f2229]">
                        <td className="px-5 py-4 font-semibold text-slate-900 dark:text-slate-100">{item.shortName || item.name}<span className="ml-2 text-xs font-normal text-slate-400">#{item.externalId}</span></td>
                        <td className="px-5 py-4 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatNumber(item.teacherCount)}</td>
                        <td className="px-5 py-4 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatNumber(item.subjectCount)}</td>
                        <td className="px-5 py-4 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatNumber(item.assignmentCount)}</td>
                        <td className="w-48 px-5 py-4"><div className="h-2 rounded-full bg-slate-100 dark:bg-[#2e3138]"><div className="h-2 rounded-full bg-[#C8102E]" style={{ width: `${width}%` }} /></div></td>
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

function MetricSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </section>
  );
}

function MetricCard({ label, value, icon, accent }: { label: string; value: number; icon: ReactNode; accent: string }) {
  return (
    <Card className="p-5">
      <div className={`inline-flex rounded-xl p-2.5 ${accent}`}>{icon}</div>
      <p className="mt-6 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{formatNumber(value)}</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{label}</p>
    </Card>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatNumber(value: number) {
  return value.toLocaleString('es-MX');
}
