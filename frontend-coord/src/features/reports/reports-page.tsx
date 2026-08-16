import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, CalendarRange, Check, ChevronLeft, ChevronRight, Clock3, Download, FileSpreadsheet, Info, Search, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import fiuatLogo from '@/assets/fiuat-logo.png';
import { coordinationApi } from '@/core/api/coordination.api';
import type { AttendanceReportResponse, RangeReportResponse, ReportCell, ReportDay, ReportHourSlot, ReportRow, TeacherSummary, WeeklyReportResponse } from '@/core/api/types';
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

type ReportMode = 'weekly' | 'range';

export function ReportsPage() {
  const [teacherId, setTeacherId] = useState('');
  const [weekStart, setWeekStart] = useState(currentMonday());
  const [reportMode, setReportMode] = useState<ReportMode>('weekly');
  const [rangeStart, setRangeStart] = useState(currentMonday());
  const [rangeEnd, setRangeEnd] = useState(addDays(currentMonday(), 5));
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);

  const teachers = useQuery({
    queryKey: ['coordination', 'teachers', 'report', debouncedSearch],
    queryFn: () => coordinationApi.teachers({ search: debouncedSearch || undefined, page: 1, pageSize: 100 }),
  });

  const isRangeValid = rangeStart <= rangeEnd;
  const report = useQuery<AttendanceReportResponse>({
    queryKey: ['coordination', 'attendance-report', reportMode, teacherId, weekStart, rangeStart, rangeEnd],
    queryFn: () => reportMode === 'weekly'
      ? coordinationApi.weeklyReport({ teacherId, weekStart })
      : coordinationApi.rangeReport({ teacherId, startDate: rangeStart, endDate: rangeEnd }),
    enabled: Boolean(teacherId) && (reportMode === 'weekly' || isRangeValid),
  });

  const selectedTeacher = useMemo(
    () => teachers.data?.data.find((teacher) => teacher.id === teacherId) ?? null,
    [teacherId, teachers.data],
  );

  const isCurrentWeek = weekStart === currentMonday();
  const prevWeek = () => setWeekStart(addDays(weekStart, -7));
  const nextWeek = () => setWeekStart(addDays(weekStart, 7));
  const goToday = () => setWeekStart(currentMonday());

  const exportExcel = async () => { if (report.data) await (await import('./excel-exporter')).exportReportExcel(report.data); };
  const exportPdf = async () => { if (report.data) await (await import('./pdf-exporter')).exportReportPdf(report.data); };
  const canShowReport = report.data?.data.availability === 'READY' || (
    report.data?.data.availability === 'ATTENDANCE_SOURCE_UNAVAILABLE' && report.data.data.rows.length > 0
  );

  return (
    <div className="grid min-h-[calc(100vh-7rem)] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-colors dark:border-[#1f2229] dark:bg-[#1a1d23] xl:grid-cols-[320px_minmax(0,1fr)]">

      {/* ── Left panel: filters ─────────────────────────────── */}
      <aside className="flex min-h-[680px] flex-col border-b border-slate-200/80 bg-slate-50/50 dark:border-[#1f2229] dark:bg-[#15181d] xl:border-b-0 xl:border-r">

        {/* Week selector */}
        <div className="border-b border-slate-200/80 p-5 dark:border-[#1f2229]">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Filtros del reporte</h2>

          <div className="mt-4">
            <label className="label">Tipo de reporte</label>
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200/80 bg-white p-1 dark:border-[#2e3138] dark:bg-[#1a1d23]">
              <ModeButton selected={reportMode === 'weekly'} onClick={() => setReportMode('weekly')} icon={<CalendarDays size={14} />} label="Semanal" />
              <ModeButton selected={reportMode === 'range'} onClick={() => setReportMode('range')} icon={<CalendarRange size={14} />} label="Rango" />
            </div>
          </div>

          <div className={cn('mt-4', reportMode !== 'weekly' && 'hidden')}>
            <label className="label">Semana correspondiente</label>

            {/* Week navigator pill */}
            <div className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white p-1 dark:border-[#2e3138] dark:bg-[#1a1d23]">
              <button
                type="button"
                onClick={prevWeek}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700 active:scale-90 dark:hover:bg-white/5 dark:hover:text-slate-200"
                aria-label="Semana anterior"
              >
                <ChevronLeft size={18} />
              </button>

              <div className="min-w-0 flex-1 text-center">
                <div className="flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <CalendarDays size={14} className="shrink-0 text-[#C8102E]" />
                  <span className="truncate">{formatRangeShort(weekStart, addDays(weekStart, 5))}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={nextWeek}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700 active:scale-90 dark:hover:bg-white/5 dark:hover:text-slate-200"
                aria-label="Semana siguiente"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Today button */}
            <div className="mt-2 flex items-center justify-between">
              <p className="text-[11px] text-slate-400 dark:text-slate-500">Lun a sáb · {isoWeekLabel(weekStart)}</p>
              {!isCurrentWeek && (
                <button
                  type="button"
                  onClick={goToday}
                  className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-[#C8102E] transition-colors hover:bg-[#C8102E]/8 active:scale-95 dark:hover:bg-[#C8102E]/12"
                >
                  Hoy
                </button>
              )}
            </div>
          </div>

          {reportMode === 'range' && (
            <div className="mt-4">
              <label className="label">Periodo personalizado</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="mb-1 block text-[11px] font-semibold text-slate-400">Inicio</span>
                  <input className="field" type="date" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} />
                </div>
                <div>
                  <span className="mb-1 block text-[11px] font-semibold text-slate-400">Fin</span>
                  <input className="field" type="date" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} />
                </div>
              </div>
              <p className={cn('mt-2 text-[11px]', isRangeValid ? 'text-slate-400 dark:text-slate-500' : 'font-semibold text-red-500')}>
                {isRangeValid ? formatRangeShort(rangeStart, rangeEnd) : 'La fecha final debe ser posterior al inicio.'}
              </p>
            </div>
          )}

          {/* Teacher search */}
          <div className="mt-5">
            <label className="label" htmlFor="teacher-search">Profesor</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                id="teacher-search"
                className="field field-leading-icon"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar profesor..."
              />
            </div>
          </div>
        </div>

        {/* Teacher list */}
        <div className="flex-1 overflow-y-auto" aria-label="Profesores disponibles">
          {teachers.isLoading ? (
            <div className="space-y-2 p-4"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
          ) : teachers.data?.data.length ? (
            teachers.data.data.map((teacher) => (
              <TeacherButton key={teacher.id} teacher={teacher} selected={teacher.id === teacherId} onSelect={() => setTeacherId(teacher.id)} />
            ))
          ) : (
            <div className="p-6 text-center text-sm text-slate-400">No se encontraron profesores.</div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200/80 px-5 py-3 text-xs text-slate-400 dark:border-[#1f2229] dark:text-slate-500">
          {teachers.data?.meta.total ?? 0} profesores disponibles
        </div>
      </aside>

      {/* ── Right panel: preview ────────────────────────────── */}
      <section className="min-w-0 bg-[#f2f3f5]/60 dark:bg-[#111317]">
        {/* Preview header */}
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white px-5 py-4 dark:border-[#1f2229] dark:bg-[#1a1d23] sm:px-7">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-slate-800 dark:text-white">Vista previa del reporte</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">El documento conserva fondo blanco para impresión oficial.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={!report.data?.data.rows.length} onClick={() => void exportExcel()}>
              <FileSpreadsheet size={16} /><span className="hidden sm:inline">Excel</span>
            </Button>
            <Button disabled={!report.data?.data.rows.length} onClick={() => void exportPdf()}>
              <Download size={16} />Descargar PDF
            </Button>
          </div>
        </div>

        {/* Preview content */}
        <div className="min-h-[660px] overflow-auto p-4 sm:p-7">
          {!teacherId ? (
            <EmptyPreview icon={<Users size={36} />} title="Selecciona un profesor" description="El reporte oficial se cargará aquí al elegir un profesor de la lista." />
          ) : reportMode === 'range' && !isRangeValid ? (
            <EmptyPreview icon={<CalendarRange size={36} />} title="Rango invalido" description="Selecciona una fecha final igual o posterior a la fecha de inicio." />
          ) : report.isLoading ? (
            <div className="mx-auto max-w-[820px] space-y-4"><Skeleton className="h-24" /><Skeleton className="h-[680px]" /></div>
          ) : report.isError || !report.data ? (
            <EmptyPreview icon={<AlertTriangle size={36} />} title="No se pudo cargar el reporte" description="Intenta nuevamente en unos momentos." />
          ) : !canShowReport ? (
            <EmptyPreview icon={<Info size={36} />} title="Profesor sin historial sincronizado" description="La identidad todavía no tiene grupos sincronizados desde la aplicación de profesores." />
          ) : (
            <DocumentPreview report={report.data} fallbackTeacher={selectedTeacher} />
          )}
        </div>
      </section>
    </div>
  );
}

/* ── Teacher list item ────────────────────────────────────────── */
function ModeButton({ selected, onClick, icon, label }: { selected: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition',
        selected
          ? 'bg-[#C8102E] text-white shadow-sm'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function TeacherButton({ teacher, selected, onSelect }: { teacher: TeacherSummary; selected: boolean; onSelect: () => void }) {
  const coordination = teacher.coordinations[0]?.name ?? 'Sin coordinación';
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'relative w-full border-b border-slate-200/60 px-5 py-4 text-left transition-all duration-200 dark:border-[#1f2229]',
        selected
          ? 'bg-white dark:bg-[#1a1d23]'
          : 'hover:bg-white/70 dark:hover:bg-[#1a1d23]/60',
      )}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-[3px] rounded-r bg-[#C8102E]" />}
      <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{teacher.name}</span>
      <span className="mt-1 block truncate text-xs text-slate-400 dark:text-slate-500">
        {coordination}{teacher.institutionalCode ? ` · ${teacher.institutionalCode}` : ''}
      </span>
    </button>
  );
}

/* ── Document preview (print-ready sheet) ─────────────────────── */
function DocumentPreview({ report, fallbackTeacher }: { report: AttendanceReportResponse; fallbackTeacher: TeacherSummary | null }) {
  const isRange = isRangeReport(report);
  const { teacher, rows } = report.data;
  const period = isRange ? report.data.range : report.data.week;
  const coordination = teacher.coordinations?.[0]?.name ?? fallbackTeacher?.coordinations[0]?.name ?? 'Coordinación Académica';

  return (
    <article className="report-sheet mx-auto aspect-[210/297] w-full min-w-[560px] max-w-[820px] bg-white px-10 py-9 text-[#253044] shadow-xl" aria-label={`Vista previa del reporte de ${teacher.name}`}>
      <header className="flex items-start justify-between gap-6 border-b-2 border-slate-400 pb-5">
        <div className="flex items-center gap-4">
          <img src={fiuatLogo} alt="Facultad de Ingeniería Tampico" className="h-14 w-44 object-contain object-left" />
          <div className="border-l border-slate-300 pl-4">
            <h3 className="text-[17px] font-black leading-tight">FACULTAD DE INGENIERÍA<br />TAMPICO</h3>
            <p className="mt-1 text-[10px] text-slate-500">{isRange ? 'Reporte de Asistencia Docente por Rango' : 'Reporte de Asistencia Docente Semanal'}</p>
          </div>
        </div>
        <div className="text-right text-[10px] leading-4 text-slate-600">
          <p><strong>{isRange ? 'Periodo' : 'Semana'}:</strong> {formatRange(period.start, period.end)}</p>
          {!isRange && <p><strong>Semana ISO:</strong> {report.data.week.isoWeek}</p>}
          <p><strong>Generado:</strong> {formatDateTime(report.meta.generatedAt)}</p>
        </div>
      </header>

      <section className="mt-5 border border-slate-200 bg-slate-50 p-4">
        <h4 className="border-b border-slate-200 pb-2 text-xs font-extrabold">Datos del profesor</h4>
        <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-[10px]">
          <p><strong>Nombre:</strong> {teacher.name}</p>
          <p><strong>Coordinación:</strong> {coordination}</p>
          <p><strong>Correo:</strong> {teacher.email || '—'}</p>
        </div>
      </section>

      <section className="mt-5 overflow-hidden border border-slate-300">
        {rows.length === 0 ? (
          <div className="grid h-48 place-items-center text-sm text-slate-500">Sin clases programadas para esta semana.</div>
        ) : isRange ? (
          <RangeReportTable report={report} />
        ) : (
          <WeeklyReportTable report={report} />
        )}
      </section>

      <section className="mt-5 border border-slate-200 bg-slate-50 p-4">
        <h4 className="text-xs font-extrabold">Resumen de asistencia</h4>
        <div className="mt-3 grid grid-cols-4 gap-3 text-center">
          {isRange ? (
            <>
              <SummaryValue label="Horas prog." value={report.data.summary.scheduledClassDays} />
              <SummaryValue label="Horas cubiertas" value={report.data.summary.reportedClassDays} tone="green" />
              <SummaryValue label="Horas faltantes" value={report.data.summary.missingClassDays} tone="red" />
              <SummaryValue label="Asistencia" value={formatRangeRate(report.data.summary.attendanceRate)} tone="brand" />
            </>
          ) : (
            <>
              <SummaryValue label="Horas prog." value={report.data.summary.scheduled} />
              <SummaryValue label="Horas cubiertas" value={report.data.summary.taken} tone="green" />
              <SummaryValue label="Horas faltantes" value={report.data.summary.missing} tone="red" />
              <SummaryValue label="Cumplimiento" value={`${report.data.summary.completionRate}%`} tone="brand" />
            </>
          )}
        </div>
      </section>

      <footer className="mt-5 flex items-center justify-between border-t border-slate-200 pt-3 text-[8px] text-slate-500">
        {isRange ? (
          <span>Porcentaje calculado como horas cubiertas entre horas programadas.</span>
        ) : (
          <div className="flex gap-4">
          <span>✓ Asistencia</span>
          <span className="text-amber-600">◷ Asistencia tardía</span>
          <span className="text-red-600">✕ Inasistencia</span>
          <span>— Sin clase</span>
          <span>◷ Clase futura</span>
          </div>
        )}
        <span>
          Tolerancia: {report.meta.teacherAttendanceToleranceMinutes ?? 10} min
          {' · '}Zona horaria: {report.meta.timezone}
        </span>
      </footer>
    </article>
  );
}

/* ── Sub-components ───────────────────────────────────────────── */
function WeeklyReportTable({ report }: { report: WeeklyReportResponse }) {
  const displayRows = buildWeeklyHourRows(report.data.rows);

  return (
    <table className="w-full table-fixed border-collapse text-[9px]">
      <thead className="bg-slate-100">
        <tr>
          <th className="w-[184px] border-b border-r border-slate-300 px-3 py-2 text-left">Horario / Materia</th>
          {days.map((day, index) => (
            <th key={day.key} className="border-b border-r border-slate-300 px-1 py-2 text-center last:border-r-0">
              <span className="block font-bold">{day.label}</span>
              <span className="mt-0.5 block text-[8px] font-normal text-slate-500">{dayDate(report.data.rows[0]?.cells[day.key], report.data.week.start, index)}</span>
            </th>
          ))}
          <th className="border-b border-slate-300 px-1 py-2 text-center">
            <span className="block font-bold">Cumpl.</span>
            <span className="mt-0.5 block text-[8px] font-normal text-slate-500">Semana</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {displayRows.map(({ row, hourIndex, rowSpan }) => (
          <tr key={`${row.id}-${hourIndex}`}>
            {hourIndex === 0 && (
              <th scope="row" rowSpan={rowSpan} className="border-b border-r border-slate-300 px-3 py-3 text-left align-middle last:border-b-0">
                <span className="block font-extrabold tabular-nums">{row.startTime && row.endTime ? `${row.startTime} – ${row.endTime}` : row.rawSchedule}</span>
                <span className="mt-1 block font-semibold">{row.subject}</span>
                <span className="mt-0.5 block text-[8px] font-normal text-slate-500">Grupo {row.groupCode}{row.classroom ? ` · ${row.classroom}` : ''} · Ciclo {row.period}</span>
              </th>
            )}
            {days.map((day) => {
              const cell = row.cells[day.key];
              const hourSlot = cell?.hourSlots?.[hourIndex];
              return (
                <td key={day.key} className="h-[48px] border-b border-r border-slate-300 text-center last:border-r-0">
                  <ReportMark cell={cell} hourSlot={hourSlot} />
                  <HourSlotLabel hourSlot={hourSlot} />
                </td>
              );
            })}
            {hourIndex === 0 && (
              <td rowSpan={rowSpan} className="h-[48px] border-b border-slate-300 text-center align-middle">
                <span className={cn('text-xs font-black', row.completionRate == null ? 'text-slate-400' : 'text-[#C8102E]')}>
                  {formatRate(row.completionRate)}
                </span>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function buildWeeklyHourRows(rows: ReportRow[]) {
  return rows.flatMap((row) => {
    const rowSpan = Math.max(1, ...days.map((day) => row.cells[day.key]?.hourSlots?.length ?? 0));
    return Array.from({ length: rowSpan }, (_, hourIndex) => ({ row, hourIndex, rowSpan }));
  });
}

function RangeReportTable({ report }: { report: RangeReportResponse }) {
  return (
    <table className="w-full table-fixed border-collapse text-[9px]">
      <thead className="bg-slate-100">
        <tr>
          <th className="w-[230px] border-b border-r border-slate-300 px-3 py-2 text-left">Materia</th>
          <th className="w-[46px] border-b border-r border-slate-300 px-1 py-2 text-center">Grado</th>
          <th className="w-[46px] border-b border-r border-slate-300 px-1 py-2 text-center">Grupo</th>
          <th className="border-b border-r border-slate-300 px-2 py-2 text-center">Horas<br />programadas</th>
          <th className="border-b border-r border-slate-300 px-2 py-2 text-center">Horas<br />cubiertas</th>
          <th className="border-b border-slate-300 px-2 py-2 text-center">Porcentaje<br />de asistencia</th>
        </tr>
      </thead>
      <tbody>
        {report.data.rows.map((row) => (
          <tr key={row.id}>
            <th scope="row" className="border-b border-r border-slate-300 px-3 py-3 text-left align-middle last:border-b-0">
              <span className="block font-semibold leading-snug">{row.subject}</span>
              <span className="mt-0.5 block text-[8px] font-normal text-slate-500">
                {row.rawSchedule || 'Sin horario'}{row.classroom ? ` · ${row.classroom}` : ''} · Ciclo {row.period}
              </span>
            </th>
            <td className="border-b border-r border-slate-300 text-center text-[12px]">{row.grade || '-'}</td>
            <td className="border-b border-r border-slate-300 text-center text-[12px]">{row.groupCode || '-'}</td>
            <td className="border-b border-r border-slate-300 text-center text-[12px]">{row.scheduledClassDays}</td>
            <td className="border-b border-r border-slate-300 text-center text-[12px]">{row.reportedClassDays}</td>
            <td className={cn('border-b border-slate-300 text-center text-[12px] font-black', row.attendanceRate === 0 && 'bg-yellow-200 text-black')}>
              {formatRangeRate(row.attendanceRate)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportMark({ cell, hourSlot }: { cell?: ReportCell; hourSlot?: ReportHourSlot }) {
  const status = hourSlot?.status ?? cell?.status;
  if (!status) return <span className="text-lg font-medium text-slate-300" aria-label="Sin clase">—</span>;
  if (status === 'NOT_SCHEDULED') return <span className="text-lg font-medium text-slate-300" aria-label="Sin clase">—</span>;
  if (status === 'TAKEN') return <span className="mx-auto grid h-6 w-6 place-items-center rounded-full border-2 border-emerald-500 text-emerald-600" title={attendanceTitle(cell, hourSlot)} aria-label="Asistencia registrada"><Check size={14} strokeWidth={3} /></span>;
  if (status === 'LATE') return <span className="mx-auto grid h-6 w-6 place-items-center rounded-full border-2 border-amber-400 text-amber-600" title={attendanceTitle(cell, hourSlot, 'Retardo')} aria-label="Retardo"><Clock3 size={13} strokeWidth={3} /></span>;
  if (status === 'MISSING') return <span className="mx-auto grid h-6 w-6 place-items-center rounded-full border-2 border-red-400 text-red-500" aria-label="Inasistencia"><X size={14} strokeWidth={3} /></span>;
  if (status === 'FUTURE') return <span className="mx-auto grid h-6 w-6 place-items-center rounded-full border border-slate-300 text-slate-400" aria-label="Clase futura" title="Clase futura"><Clock3 size={13} /></span>;
  if (status === 'SOURCE_UNAVAILABLE') return <span className="mx-auto grid h-6 w-6 place-items-center rounded-full border border-amber-400 text-amber-600" aria-label="Asistencia no disponible" title="Asistencia no disponible"><AlertTriangle size={13} /></span>;
  return <span className="mx-auto grid h-6 w-6 place-items-center rounded-full border border-amber-400 font-bold text-amber-600" aria-label="Horario no interpretable" title="Horario no interpretable">?</span>;
}

function HourSlotLabel({ hourSlot }: { hourSlot?: ReportHourSlot }) {
  if (!hourSlot) return <span className="mt-1 block text-[7px] leading-3 text-slate-300">—</span>;
  return <span className="mt-1 block text-[7px] font-semibold leading-3 text-slate-500">{hourSlot.startTime}-{hourSlot.endTime}</span>;
}

function attendanceTitle(cell?: ReportCell, hourSlot?: ReportHourSlot, label = 'Asistencia registrada') {
  const pieces = [label];
  if (hourSlot) pieces.push(`Hora: ${hourSlot.startTime}-${hourSlot.endTime}`);
  if (cell?.professorEntryAt) pieces.push(`Entrada: ${formatTimeOnly(cell.professorEntryAt)}`);
  if (cell?.professorExitAt) pieces.push(`Salida: ${formatTimeOnly(cell.professorExitAt)}`);
  if (cell && cell.scheduledHours > 0) pieces.push(`Cobertura: ${cell.attendedHours}/${cell.scheduledHours} h`);
  if (cell?.workedMinutes != null) pieces.push(`Permanencia real: ${formatWorkedTime(cell.workedMinutes)}`);
  if (cell?.portalSyncError) pieces.push(cell.portalSyncError);
  return pieces.join(' | ');
}

function formatWorkedTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder} min`;
  return remainder === 0 ? `${hours} h` : `${hours} h ${remainder} min`;
}

function SummaryValue({ label, value, tone }: { label: string; value: string | number; tone?: 'green' | 'red' | 'brand' }) {
  return (
    <div>
      <p className={cn('text-base font-black', tone === 'green' && 'text-emerald-600', tone === 'red' && 'text-red-500', tone === 'brand' && 'text-[#C8102E]')}>{value}</p>
      <p className="mt-0.5 text-[8px] uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

function EmptyPreview({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div className="grid min-h-[620px] place-items-center"><EmptyState icon={icon} title={title} description={description} /></div>;
}

/* ── Date utilities ───────────────────────────────────────────── */
const REPORT_TIME_ZONE = 'America/Mexico_City';

function isRangeReport(report: AttendanceReportResponse): report is RangeReportResponse { return 'range' in report.data; }
function currentMonday() { return mondayForDate(new Date().toISOString().slice(0, 10)); }
function mondayForDate(value: string) { const date = new Date(`${value}T12:00:00Z`); const day = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate() - day + 1); return date.toISOString().slice(0, 10); }
function addDays(value: string, amount: number) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); }
function formatRange(start: string, end: string) { const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }; return `${new Date(`${start}T12:00:00Z`).toLocaleDateString('es-MX', options)} – ${new Date(`${end}T12:00:00Z`).toLocaleDateString('es-MX', options)}`; }
function formatRangeShort(start: string, end: string) {
  const s = new Date(`${start}T12:00:00Z`);
  const e = new Date(`${end}T12:00:00Z`);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const startStr = s.toLocaleDateString('es-MX', opts);
  const endStr = e.toLocaleDateString('es-MX', { ...opts, year: 'numeric' });
  return `${startStr} – ${endStr}`;
}
function isoWeekLabel(monday: string) {
  const d = new Date(`${monday}T12:00:00Z`);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + yearStart.getUTCDay() + 1) / 7);
  return `Semana ${weekNo}`;
}
function formatDateTime(value: string) { return new Date(value).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: REPORT_TIME_ZONE }); }
function formatTimeOnly(value: string | null | undefined) { return value ? new Date(value).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: REPORT_TIME_ZONE }) : '--:--'; }
function dayDate(cell: ReportCell | undefined, weekStart: string, offset: number) { const value = cell?.date ?? addDays(weekStart, offset); return new Date(`${value}T12:00:00Z`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }); }
function formatRate(value: number | null | undefined) { return value == null ? 'N/D' : `${value}%`; }
function formatRangeRate(value: number | null | undefined) { return value == null ? 'N/D' : `${value.toFixed(2)}%`; }
