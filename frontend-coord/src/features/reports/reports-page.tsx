import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, Check, Clock3, Download, FileSpreadsheet, Info, Search, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import fiuatLogo from '@/assets/fiuat-logo.png';
import { coordinationApi } from '@/core/api/coordination.api';
import type { ReportCell, ReportDay, TeacherSummary, WeeklyReportResponse } from '@/core/api/types';
import { Button, EmptyState, Skeleton, cn } from '@/shared/components/ui';
import { useDebounce } from '@/shared/hooks/use-debounce';

const days: Array<{ key: ReportDay; label: string; shortLabel: string }> = [
  { key: 'monday', label: 'Lunes', shortLabel: 'Lun' },
  { key: 'tuesday', label: 'Martes', shortLabel: 'Mar' },
  { key: 'wednesday', label: 'Miércoles', shortLabel: 'Mié' },
  { key: 'thursday', label: 'Jueves', shortLabel: 'Jue' },
  { key: 'friday', label: 'Viernes', shortLabel: 'Vie' },
  { key: 'saturday', label: 'Sábado', shortLabel: 'Sáb' },
];

export function ReportsPage() {
  const [teacherId, setTeacherId] = useState('');
  const [weekStart, setWeekStart] = useState(currentMonday());
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const teachers = useQuery({
    queryKey: ['coordination', 'teachers', 'report', debouncedSearch],
    queryFn: () => coordinationApi.teachers({ search: debouncedSearch || undefined, page: 1, pageSize: 100 }),
  });
  const report = useQuery({
    queryKey: ['coordination', 'weekly-report', teacherId, weekStart],
    queryFn: () => coordinationApi.weeklyReport({ teacherId, weekStart }),
    enabled: Boolean(teacherId),
  });
  const selectedTeacher = useMemo(
    () => teachers.data?.data.find((teacher) => teacher.id === teacherId) ?? null,
    [teacherId, teachers.data],
  );

  const exportExcel = async () => { if (report.data) await (await import('./excel-exporter')).exportReportExcel(report.data); };
  const exportPdf = async () => { if (report.data) await (await import('./pdf-exporter')).exportReportPdf(report.data); };

  return <div className="grid min-h-[calc(100vh-8rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#111317] xl:grid-cols-[310px_minmax(0,1fr)]">
    <aside className="flex min-h-[680px] flex-col border-b border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-[#0d0f12] xl:border-b-0 xl:border-r">
      <div className="border-b border-slate-200 p-5 dark:border-slate-800">
        <h2 className="text-sm font-bold">Filtros del reporte</h2>
        <div className="mt-4">
          <label className="label" htmlFor="week-start">Semana correspondiente</label>
          <div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17}/><input id="week-start" type="date" className="field field-leading-icon" value={weekStart} onChange={(event) => setWeekStart(mondayForDate(event.target.value))}/></div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{formatRange(weekStart, addDays(weekStart, 5))} · lunes a sábado</p>
        </div>
        <div className="mt-4">
          <label className="label" htmlFor="teacher-search">Profesor</label>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17}/><input id="teacher-search" className="field field-leading-icon" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar profesor..."/></div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto" aria-label="Profesores disponibles">
        {teachers.isLoading ? <div className="space-y-2 p-4"><Skeleton className="h-16"/><Skeleton className="h-16"/><Skeleton className="h-16"/></div> : teachers.data?.data.length ? teachers.data.data.map((teacher) => <TeacherButton key={teacher.id} teacher={teacher} selected={teacher.id === teacherId} onSelect={() => setTeacherId(teacher.id)}/>) : <div className="p-6 text-center text-sm text-slate-500">No se encontraron profesores.</div>}
      </div>
      <div className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">{teachers.data?.meta.total ?? 0} profesores disponibles</div>
    </aside>

    <section className="min-w-0 bg-slate-100/80 dark:bg-[#171a1f]">
      <div className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-[#111317] sm:px-7">
        <div className="min-w-0 flex-1"><h2 className="text-lg font-bold">Vista previa del reporte</h2><p className="text-sm text-slate-500 dark:text-slate-400">El documento conserva fondo blanco para impresión oficial.</p></div>
        <div className="flex gap-2"><Button variant="secondary" disabled={!report.data?.data.rows.length} onClick={() => void exportExcel()}><FileSpreadsheet size={17}/><span className="hidden sm:inline">Excel</span></Button><Button disabled={!report.data?.data.rows.length} onClick={() => void exportPdf()}><Download size={17}/>Descargar PDF</Button></div>
      </div>
      <div className="min-h-[660px] overflow-auto p-4 sm:p-7">
        {!teacherId ? <EmptyPreview icon={<Users size={40}/>} title="Selecciona un profesor" description="El reporte oficial se cargará aquí al elegir un profesor de la lista."/> : report.isLoading ? <div className="mx-auto max-w-[820px] space-y-4"><Skeleton className="h-24"/><Skeleton className="h-[680px]"/></div> : report.isError || !report.data ? <EmptyPreview icon={<AlertTriangle size={40}/>} title="Fuente de asistencia no disponible" description="No fue posible consultar el backend de asistencia. Intenta nuevamente."/> : report.data.data.availability !== 'READY' ? <EmptyPreview icon={<Info size={40}/>} title="Profesor sin historial sincronizado" description="La identidad todavía no tiene grupos sincronizados desde la aplicación de profesores."/> : <DocumentPreview report={report.data} fallbackTeacher={selectedTeacher}/>}
      </div>
    </section>
  </div>;
}

function TeacherButton({ teacher, selected, onSelect }: { teacher: TeacherSummary; selected: boolean; onSelect: () => void }) {
  const coordination = teacher.coordinations[0]?.name ?? 'Sin coordinación';
  return <button type="button" onClick={onSelect} aria-pressed={selected} className={cn('relative w-full border-b border-slate-200 px-5 py-4 text-left transition dark:border-slate-800', selected ? 'bg-white dark:bg-slate-900' : 'hover:bg-white/80 dark:hover:bg-slate-900/60')}>
    {selected && <span className="absolute inset-y-0 left-0 w-1 bg-[#C8102E]"/>}
    <span className="block truncate text-sm font-bold">{teacher.name}</span>
    <span className="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">{coordination}{teacher.institutionalCode ? ` · ${teacher.institutionalCode}` : ''}</span>
  </button>;
}

function DocumentPreview({ report, fallbackTeacher }: { report: WeeklyReportResponse; fallbackTeacher: TeacherSummary | null }) {
  const { teacher, week, summary, rows } = report.data;
  const coordination = teacher.coordinations[0]?.name ?? fallbackTeacher?.coordinations[0]?.name ?? 'Coordinación Académica';
  return <article className="report-sheet mx-auto aspect-[210/297] w-full min-w-[560px] max-w-[820px] bg-white px-10 py-9 text-[#253044] shadow-xl" aria-label={`Vista previa del reporte de ${teacher.name}`}>
    <header className="flex items-start justify-between gap-6 border-b-2 border-slate-400 pb-5">
      <div className="flex items-center gap-4"><img src={fiuatLogo} alt="Facultad de Ingeniería Tampico" className="h-14 w-44 object-contain object-left"/><div className="border-l border-slate-300 pl-4"><h3 className="text-[17px] font-black leading-tight">FACULTAD DE INGENIERÍA<br/>TAMPICO</h3><p className="mt-1 text-[10px] text-slate-500">Reporte de Asistencia Docente Semanal</p></div></div>
      <div className="text-right text-[10px] leading-4 text-slate-600"><p><strong>Semana:</strong> {formatRange(week.start, week.end)}</p><p><strong>Semana ISO:</strong> {week.isoWeek}</p><p><strong>Generado:</strong> {formatDateTime(report.meta.generatedAt)}</p></div>
    </header>

    <section className="mt-5 border border-slate-200 bg-slate-50 p-4">
      <h4 className="border-b border-slate-200 pb-2 text-xs font-extrabold">Datos del profesor</h4>
      <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-[10px]"><p><strong>Nombre:</strong> {teacher.name}</p><p><strong>Coordinación:</strong> {coordination}</p><p><strong>No. empleado:</strong> {teacher.institutionalCode || '—'}</p><p><strong>Correo:</strong> {teacher.email || '—'}</p></div>
    </section>

    <section className="mt-5 overflow-hidden border border-slate-300">
      {rows.length === 0 ? <div className="grid h-48 place-items-center text-sm text-slate-500">Sin clases programadas para esta semana.</div> : <table className="w-full table-fixed border-collapse text-[9px]">
        <thead className="bg-slate-100"><tr><th className="w-[184px] border-b border-r border-slate-300 px-3 py-2 text-left">Horario / Materia</th>{days.map((day, index) => <th key={day.key} className="border-b border-r border-slate-300 px-1 py-2 text-center last:border-r-0"><span className="block font-bold">{day.label}</span><span className="mt-0.5 block text-[8px] font-normal text-slate-500">{dayDate(rows[0]?.cells[day.key], week.start, index)}</span></th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}><th scope="row" className="border-b border-r border-slate-300 px-3 py-3 text-left align-middle last:border-b-0"><span className="block font-extrabold tabular-nums">{row.startTime && row.endTime ? `${row.startTime} – ${row.endTime}` : row.rawSchedule}</span><span className="mt-1 block font-semibold">{row.subject}</span><span className="mt-0.5 block text-[8px] font-normal text-slate-500">Grupo {row.groupCode}{row.classroom ? ` · ${row.classroom}` : ''}</span></th>{days.map((day) => <td key={day.key} className="h-[66px] border-b border-r border-slate-300 text-center last:border-r-0"><ReportMark cell={row.cells[day.key]}/></td>)}</tr>)}</tbody>
      </table>}
    </section>

    <section className="mt-5 border border-slate-200 bg-slate-50 p-4"><h4 className="text-xs font-extrabold">Resumen de asistencia</h4><div className="mt-3 grid grid-cols-4 gap-3 text-center"><SummaryValue label="Programadas" value={summary.scheduled}/><SummaryValue label="Asistencias" value={summary.taken} tone="green"/><SummaryValue label="Inasistencias" value={summary.missing} tone="red"/><SummaryValue label="Cumplimiento" value={`${summary.completionRate}%`} tone="brand"/></div></section>
    <footer className="mt-5 flex items-center justify-between border-t border-slate-200 pt-3 text-[8px] text-slate-500"><div className="flex gap-4"><span>✓ Asistencia</span><span className="text-red-600">✕ Inasistencia</span><span>— Sin clase</span><span>◷ Clase futura</span></div><span>Zona horaria: {report.meta.timezone}</span></footer>
  </article>;
}

function ReportMark({ cell }: { cell: ReportCell }) {
  if (cell.status === 'NOT_SCHEDULED') return <span className="text-lg font-medium text-slate-300" aria-label="Sin clase">—</span>;
  if (cell.status === 'TAKEN') return <span className="mx-auto grid h-6 w-6 place-items-center rounded-full border-2 border-emerald-500 text-emerald-600" title={cell.portalSyncError || 'Asistencia registrada'} aria-label="Asistencia registrada"><Check size={14} strokeWidth={3}/></span>;
  if (cell.status === 'MISSING') return <span className="mx-auto grid h-6 w-6 place-items-center rounded-full border-2 border-red-400 text-red-500" aria-label="Inasistencia"><X size={14} strokeWidth={3}/></span>;
  if (cell.status === 'FUTURE') return <span className="mx-auto grid h-6 w-6 place-items-center rounded-full border border-slate-300 text-slate-400" aria-label="Clase futura" title="Clase futura"><Clock3 size={13}/></span>;
  return <span className="mx-auto grid h-6 w-6 place-items-center rounded-full border border-amber-400 font-bold text-amber-600" aria-label="Horario no interpretable" title="Horario no interpretable">?</span>;
}

function SummaryValue({ label, value, tone }: { label: string; value: string | number; tone?: 'green' | 'red' | 'brand' }) {
  return <div><p className={cn('text-base font-black', tone === 'green' && 'text-emerald-600', tone === 'red' && 'text-red-500', tone === 'brand' && 'text-[#C8102E]')}>{value}</p><p className="mt-0.5 text-[8px] uppercase tracking-wide text-slate-500">{label}</p></div>;
}

function EmptyPreview({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div className="grid min-h-[620px] place-items-center"><EmptyState icon={icon} title={title} description={description}/></div>;
}

function currentMonday() { return mondayForDate(new Date().toISOString().slice(0, 10)); }
function mondayForDate(value: string) { const date = new Date(`${value}T12:00:00Z`); const day = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate() - day + 1); return date.toISOString().slice(0, 10); }
function addDays(value: string, amount: number) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); }
function formatRange(start: string, end: string) { const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }; return `${new Date(`${start}T12:00:00Z`).toLocaleDateString('es-MX', options)} – ${new Date(`${end}T12:00:00Z`).toLocaleDateString('es-MX', options)}`; }
function formatDateTime(value: string) { return new Date(value).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); }
function dayDate(cell: ReportCell | undefined, weekStart: string, offset: number) { const value = cell?.date ?? addDays(weekStart, offset); return new Date(`${value}T12:00:00Z`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }); }
