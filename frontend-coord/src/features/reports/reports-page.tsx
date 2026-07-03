import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarRange, Check, Clock3, Download, FileSpreadsheet, Info, Minus, Users } from 'lucide-react';
import { useState } from 'react';
import { coordinationApi } from '@/core/api/coordination.api';
import type { ReportCell, ReportCellStatus, WeeklyReportResponse } from '@/core/api/types';
import { Badge, Button, Card, EmptyState, Skeleton, cn } from '@/shared/components/ui';

const days = [{ key: 'monday', label: 'Lunes' }, { key: 'tuesday', label: 'Martes' }, { key: 'wednesday', label: 'Miércoles' }, { key: 'thursday', label: 'Jueves' }] as const;

export function ReportsPage() {
  const [teacherId, setTeacherId] = useState(''); const [weekStart, setWeekStart] = useState(currentMonday());
  const teachers = useQuery({ queryKey: ['coordination', 'teachers', 'report'], queryFn: () => coordinationApi.teachers({ page: 1, pageSize: 100 }) });
  const report = useQuery({ queryKey: ['coordination', 'weekly-report', teacherId, weekStart], queryFn: () => coordinationApi.weeklyReport({ teacherId, weekStart }), enabled: Boolean(teacherId) });
  const data = report.data;
  const exportExcel = async () => { if (data) await (await import('./exporters')).exportReportExcel(data); };
  const exportPdf = async () => { if (data) (await import('./exporters')).exportReportPdf(data); };
  return <div className="space-y-6"><Card className="p-5"><div className="grid gap-4 md:grid-cols-[1fr_240px_auto] md:items-end"><div><label className="label" htmlFor="report-teacher">Profesor</label><select id="report-teacher" className="field" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}><option value="">Selecciona un profesor</option>{teachers.data?.data.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}{teacher.institutionalCode ? ` · ${teacher.institutionalCode}` : ''}</option>)}</select></div><div><label className="label" htmlFor="week-start">Semana (lunes)</label><input id="week-start" type="date" className="field" value={weekStart} onChange={(e) => setWeekStart(mondayForDate(e.target.value))}/></div><div className="flex gap-2"><Button variant="secondary" disabled={!data?.data.rows.length} onClick={() => void exportExcel()}><FileSpreadsheet size={17}/>Excel</Button><Button disabled={!data?.data.rows.length} onClick={() => void exportPdf()}><Download size={17}/>PDF</Button></div></div></Card>
    {!teacherId ? <EmptyState icon={<Users size={38}/>} title="Selecciona un profesor" description="El reporte cruzará su horario semanal con las asistencias capturadas."/> : report.isLoading ? <div className="space-y-4"><Skeleton className="h-28"/><Skeleton className="h-80"/></div> : report.isError || !data ? <EmptyState icon={<AlertTriangle size={38}/>} title="Fuente de asistencia no disponible" description="No pudimos consultar el servicio de asistencia. Intenta nuevamente en unos minutos."/> : data.data.availability !== 'READY' ? <EmptyState icon={<Info size={38}/>} title="Profesor sin historial sincronizado" description="La identidad existe en coordinación, pero todavía no tiene grupos sincronizados en el backend de asistencia."/> : <ReportContent report={data}/>} 
  </div>;
}

function ReportContent({ report }: { report: WeeklyReportResponse }) {
  const summary = report.data.summary;
  return <><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[
    ['Cumplimiento', `${summary.completionRate}%`, 'text-[#C8102E]'], ['Clases programadas', summary.scheduled, 'text-slate-900'], ['Tomadas', summary.taken, 'text-emerald-700'], ['Pendientes', summary.missing, 'text-[#C8102E]'], ['Próximas', summary.future, 'text-blue-700'],
  ].map(([label, value, color]) => <Card key={label} className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className={cn('mt-2 text-2xl font-bold', color)}>{value}</p></Card>)}</section>
  <Card className="overflow-hidden"><div className="flex flex-col justify-between gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-wider text-[#C8102E]">Semana {report.data.week.isoWeek}</p><h2 className="mt-1 text-xl font-bold">{report.data.teacher.name}</h2><p className="mt-1 text-sm text-slate-500">{formatDate(report.data.week.start)} – {formatDate(report.data.week.end)}</p></div><div className="flex flex-wrap gap-2 text-xs"><Badge tone="success"><Check size={12}/>Tomada</Badge><Badge tone="danger"><AlertTriangle size={12}/>Pendiente</Badge><Badge tone="info"><Clock3 size={12}/>Próxima</Badge><Badge><Minus size={12}/>Sin clase</Badge></div></div>
    {report.data.rows.length === 0 ? <div className="p-5"><EmptyState icon={<CalendarRange size={36}/>} title="Sin clases para esta semana" description="No se encontraron horarios operativos de lunes a jueves."/></div> : <div className="overflow-x-auto"><table className="w-full min-w-[920px] border-collapse text-sm"><thead><tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><th className="w-24 border-b border-slate-200 px-4 py-3">Hora</th><th className="min-w-64 border-b border-slate-200 px-4 py-3">Clase</th>{days.map((day) => <th key={day.key} className="w-40 border-b border-l border-slate-200 px-3 py-3 text-center">{day.label}</th>)}</tr></thead><tbody>{report.data.rows.map((row) => <tr key={row.id} className="align-top hover:bg-slate-50/60"><td className="border-b border-slate-100 px-4 py-4 font-semibold tabular-nums">{row.startTime || '—'}<span className="block text-xs font-normal text-slate-400">{row.endTime}</span></td><td className="border-b border-slate-100 px-4 py-4"><p className="font-semibold">{row.subject}</p><p className="mt-1 text-xs text-slate-500">Grupo {row.groupCode} · {row.classroom || 'Sin salón'}</p></td>{days.map((day) => <td key={day.key} className="border-b border-l border-slate-100 p-2"><StatusCell cell={row.cells[day.key]}/></td>)}</tr>)}</tbody></table></div>}
  </Card></>;
}

const statusConfig: Record<ReportCellStatus, { label: string; icon: typeof Check; className: string }> = {
  TAKEN: { label: 'Tomada', icon: Check, className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  MISSING: { label: 'Pendiente', icon: AlertTriangle, className: 'border-red-200 bg-red-50 text-[#C8102E]' },
  FUTURE: { label: 'Próxima', icon: Clock3, className: 'border-blue-200 bg-blue-50 text-blue-700' },
  NOT_SCHEDULED: { label: 'Sin clase', icon: Minus, className: 'border-transparent bg-slate-50 text-slate-400' },
  UNKNOWN_SCHEDULE: { label: 'Horario inválido', icon: Info, className: 'border-amber-200 bg-amber-50 text-amber-800' },
};
function StatusCell({ cell }: { cell: ReportCell }) { const config = statusConfig[cell.status]; const Icon = config.icon; return <div className={cn('flex min-h-16 flex-col items-center justify-center rounded-lg border px-2 py-2 text-center', config.className)} title={cell.portalSyncError || undefined}><div className="flex items-center gap-1.5 font-semibold"><Icon size={14}/>{config.label}</div>{cell.status === 'TAKEN' && cell.portalSyncStatus && <span className="mt-1 text-[10px] opacity-70">Portal: {portalLabel(cell.portalSyncStatus)}</span>}</div>; }
function portalLabel(status: string) { return ({ COMPLETED: 'enviado', FAILED: 'falló', PENDING: 'pendiente', IN_PROGRESS: 'subiendo', NOT_REQUESTED: 'local' } as Record<string,string>)[status] || status.toLowerCase(); }
function currentMonday() { return mondayForDate(new Date().toISOString().slice(0, 10)); }
function mondayForDate(value: string) { const date = new Date(`${value}T12:00:00Z`); const day = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate() - day + 1); return date.toISOString().slice(0, 10); }
function formatDate(value: string) { return new Date(`${value}T12:00:00Z`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' }); }
