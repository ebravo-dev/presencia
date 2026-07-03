import { useQuery } from '@tanstack/react-query';
import { BookOpen, Building2, Clock3, GraduationCap, RefreshCw, Users } from 'lucide-react';
import { coordinationApi } from '@/core/api/coordination.api';
import { Card, EmptyState, Skeleton } from '@/shared/components/ui';

const cards = [
  { key: 'teachers', label: 'Profesores indexados', icon: Users, accent: 'bg-red-50 text-[#C8102E]' },
  { key: 'subjects', label: 'Materias descubiertas', icon: BookOpen, accent: 'bg-blue-50 text-blue-700' },
  { key: 'assignments', label: 'Grupos mapeados', icon: GraduationCap, accent: 'bg-emerald-50 text-emerald-700' },
  { key: 'coordinations', label: 'Coordinaciones', icon: Building2, accent: 'bg-amber-50 text-amber-700' },
] as const;

export function DashboardPage() {
  const overview = useQuery({ queryKey: ['coordination', 'overview'], queryFn: coordinationApi.overview });
  if (overview.isLoading) return <div className="space-y-8"><Skeleton className="h-24"/><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map((item) => <Skeleton key={item.key} className="h-36"/>)}</div><Skeleton className="h-72"/></div>;
  if (overview.isError || !overview.data) return <EmptyState icon={<RefreshCw size={34}/>} title="No pudimos cargar el resumen" description="Verifica la conexión con el backend e intenta recargar la página."/>;
  const { counts, coordinations } = overview.data.data;
  return <div className="space-y-8"><section className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-[#C8102E]">Panorama de ingesta</p><h2 className="mt-1 text-2xl font-bold">Datos académicos recolectados</h2><p className="mt-2 max-w-2xl text-sm text-slate-500">La cobertura crece automáticamente cada vez que un profesor inicia sesión.</p></div><div className="flex items-center gap-2 text-xs text-slate-500"><Clock3 size={15}/>Actualizado {new Date(overview.data.meta.generatedAt).toLocaleString('es-MX')}</div></section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ key, label, icon: Icon, accent }) => <Card key={key} className="p-5"><div className={`inline-flex rounded-xl p-2.5 ${accent}`}><Icon size={21}/></div><p className="mt-6 text-3xl font-bold tracking-tight">{counts[key].toLocaleString('es-MX')}</p><p className="mt-1 text-sm text-slate-500">{label}</p></Card>)}</section>
    <section><div className="mb-4"><h2 className="text-lg font-bold">Cobertura por coordinación</h2><p className="text-sm text-slate-500">Relaciones activas encontradas en la cosecha acumulativa.</p></div>{coordinations.length === 0 ? <EmptyState icon={<Building2 size={34}/>} title="Aún no hay coordinaciones" description="Los datos aparecerán cuando los profesores comiencen a autenticarse."/> : <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Coordinación</th><th className="px-5 py-3 text-right">Profesores</th><th className="px-5 py-3 text-right">Materias</th><th className="px-5 py-3 text-right">Grupos</th><th className="px-5 py-3">Cobertura</th></tr></thead><tbody>{coordinations.map((item) => { const width = counts.assignments ? Math.max(4, Math.round(item.assignmentCount / counts.assignments * 100)) : 0; return <tr key={item.id} className="border-b border-slate-100 last:border-0"><td className="px-5 py-4 font-semibold">{item.shortName || item.name}<span className="ml-2 text-xs font-normal text-slate-400">#{item.externalId}</span></td><td className="px-5 py-4 text-right tabular-nums">{item.teacherCount}</td><td className="px-5 py-4 text-right tabular-nums">{item.subjectCount}</td><td className="px-5 py-4 text-right tabular-nums">{item.assignmentCount}</td><td className="w-48 px-5 py-4"><div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-[#C8102E]" style={{ width: `${width}%` }}/></div></td></tr>; })}</tbody></table></div></Card>}</section>
  </div>;
}
