import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  DoorOpen,
  Filter,
  GraduationCap,
  Search,
  UserRound,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { coordinationApi } from '@/core/api/coordination.api';
import type { Assignment, ScheduleDay, ScheduleSlot } from '@/core/api/types';
import { SharedClassManagement } from '@/features/shared-classes/shared-class-management';
import { Badge, Button, Card, EmptyState, Skeleton, cn } from '@/shared/components/ui';
import { useDebounce } from '@/shared/hooks/use-debounce';

const dayLabels: Record<ScheduleDay, string> = {
  monday: 'Lun',
  tuesday: 'Mar',
  wednesday: 'Mie',
  thursday: 'Jue',
  friday: 'Vie',
  saturday: 'Sab',
  sunday: 'Dom',
};

const visibleScheduleDays: ScheduleDay[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function AllocationPage() {
  const [search, setSearch] = useState('');
  const [coordinationId, setCoordinationId] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cycle, setCycle] = useState('');
  const [level, setLevel] = useState('');
  const debouncedSearch = useDebounce(search);

  const overview = useQuery({
    queryKey: ['coordination', 'overview'],
    queryFn: coordinationApi.overview,
  });
  const teachers = useQuery({
    queryKey: ['coordination', 'teachers', debouncedSearch, coordinationId, page],
    queryFn: () =>
      coordinationApi.teachers({
        search: debouncedSearch || undefined,
        coordinationId: coordinationId || undefined,
        page,
        pageSize: 20,
      }),
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, coordinationId]);

  useEffect(() => {
    if (!selectedId && teachers.data?.data[0]) setSelectedId(teachers.data.data[0].id);
  }, [selectedId, teachers.data]);

  const detail = useQuery({
    queryKey: ['coordination', 'teacher', selectedId],
    queryFn: () => coordinationApi.assignments(selectedId!),
    enabled: Boolean(selectedId),
  });

  const options = useMemo(() => {
    const items = detail.data?.data.assignments ?? [];
    const cycles = [...new Set(items.map((item) => item.schoolCycleName || item.schoolCycleExternalId).filter(isNonEmptyString))]
      .sort(compareAcademicCycles);
    return {
      cycles,
      levels: [...new Set(items.map((item) => item.educationLevel).filter(Boolean))] as string[],
    };
  }, [detail.data]);

  useEffect(() => {
    if (!detail.data) return;
    setCycle((current) => (current && options.cycles.includes(current) ? current : options.cycles[0] ?? ''));
  }, [detail.data, options.cycles]);

  const assignments = useMemo(() => {
    return (detail.data?.data.assignments ?? [])
      .filter(
        (item) =>
          Boolean(cycle) &&
          (item.schoolCycleName || item.schoolCycleExternalId) === cycle &&
          (!level || item.educationLevel === level),
      )
      .sort((a, b) => {
        const subject = cleanSubjectName(a.subject).name.localeCompare(cleanSubjectName(b.subject).name, 'es');
        if (subject !== 0) return subject;
        return (a.groupCode || a.externalGroupId).localeCompare(b.groupCode || b.externalGroupId, 'es');
      });
  }, [detail.data, cycle, level]);

  return (
    <div className="space-y-6">
      <SharedClassManagement />

      <div className="grid min-h-[calc(100vh-9rem)] gap-5 xl:grid-cols-[360px_1fr]">
      <Card className="flex min-h-[640px] flex-col overflow-hidden">
        <div className="border-b border-slate-200 p-4 dark:border-[#2e3138]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              className="field field-leading-icon"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre"
              aria-label="Buscar profesor por nombre"
            />
          </label>
          <select
            className="field mt-3"
            value={coordinationId}
            onChange={(event) => setCoordinationId(event.target.value)}
            aria-label="Filtrar por coordinacion"
          >
            <option value="">Todas las coordinaciones</option>
            {overview.data?.data.coordinations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.shortName || item.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-2" aria-live="polite">
          {teachers.isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 7 }, (_, index) => (
                <Skeleton key={index} className="h-20" />
              ))}
            </div>
          ) : teachers.data?.data.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Users />}
                title="Sin resultados"
                description="Prueba con otro nombre o coordinacion."
              />
            </div>
          ) : (
            teachers.data?.data.map((teacher) => (
              <button
                key={teacher.id}
                onClick={() => {
                  setSelectedId(teacher.id);
                  setCycle('');
                  setLevel('');
                }}
                className={cn(
                  'mb-1 w-full rounded-lg border px-3 py-3 text-left transition',
                  selectedId === teacher.id
                    ? 'border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/20'
                    : 'border-transparent hover:bg-slate-50 dark:hover:bg-white/5',
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold',
                      selectedId === teacher.id
                        ? 'bg-[#C8102E] text-white'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                    )}
                  >
                    {teacher.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{teacher.name}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                      {teacher.institutionalCode || teacher.email || 'Sin identificador'}
                    </p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      {teacher.assignmentCount} grupos · {teacher.subjectCount} materias
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 p-3 text-xs text-slate-500 dark:border-[#2e3138] dark:text-slate-400">
          <span>{teachers.data?.meta.total ?? 0} profesores</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              className="h-8 w-8 p-0"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
              aria-label="Pagina anterior"
            >
              <ChevronLeft size={17} />
            </Button>
            <span className="px-2">
              {page}/{Math.max(1, teachers.data?.meta.totalPages ?? 1)}
            </span>
            <Button
              variant="ghost"
              className="h-8 w-8 p-0"
              disabled={page >= (teachers.data?.meta.totalPages ?? 1)}
              onClick={() => setPage((value) => value + 1)}
              aria-label="Pagina siguiente"
            >
              <ChevronRight size={17} />
            </Button>
          </div>
        </div>
      </Card>

      <section className="min-w-0">
        {!selectedId ? (
          <EmptyState
            icon={<UserRound size={38} />}
            title="Selecciona un profesor"
            description="Elige un profesor para inspeccionar su carga academica recolectada."
          />
        ) : detail.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-52" />
            <Skeleton className="h-52" />
          </div>
        ) : detail.isError || !detail.data ? (
          <EmptyState
            icon={<BookOpen size={36} />}
            title="No pudimos cargar la asignacion"
            description="Intenta seleccionar nuevamente al profesor."
          />
        ) : (
          <div className="space-y-5">
            <Card className="p-5">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#C8102E]">
                    Profesor seleccionado
                  </p>
                  <h2 className="mt-1 text-2xl font-bold">{detail.data.data.teacher.name}</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {detail.data.data.teacher.email || detail.data.data.teacher.institutionalCode}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{detail.data.data.teacher.assignmentCount} grupos</Badge>
                  <Badge>{detail.data.data.teacher.subjectCount} materias</Badge>
                  {detail.data.data.teacher.lastHarvestedAt && (
                    <Badge tone="success">
                      Actualizado {new Date(detail.data.data.teacher.lastHarvestedAt).toLocaleDateString('es-MX')}
                    </Badge>
                  )}
                </div>
              </div>
            </Card>

            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2e3138] dark:bg-[#1a1d23]">
              <Filter size={17} className="text-slate-400" />
              <select
                className="field w-auto min-w-48"
                value={cycle}
                onChange={(event) => setCycle(event.target.value)}
                disabled={options.cycles.length === 0}
              >
                {options.cycles.length === 0 ? <option value="">Sin ciclos</option> : null}
                {options.cycles.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
              <select className="field w-auto min-w-48" value={level} onChange={(event) => setLevel(event.target.value)}>
                <option value="">Todos los niveles</option>
                {options.levels.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{assignments.length} resultados</span>
            </div>

            {assignments.length === 0 ? (
              <EmptyState
                icon={<CalendarDays size={36} />}
                title="Sin asignaciones para estos filtros"
                description="Cambia el ciclo o nivel educativo para ampliar la busqueda."
              />
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {assignments.map((item) => (
                  <AssignmentCard key={item.id} assignment={item} />
                ))}
              </div>
            )}

          </div>
        )}
      </section>
      </div>
    </div>
  );
}

function AssignmentCard({ assignment }: { assignment: Assignment }) {
  const subject = cleanSubjectName(assignment.subject);
  const scheduleRows = visibleScheduleDays.map((day) => {
    const text = formatSlots(assignment.schedule[day]);
    return { day, text, hasClass: text !== 'Sin clase' };
  });
  const scheduledCount = scheduleRows.filter((row) => row.hasClass).length;

  return (
    <Card className="overflow-hidden border-slate-300 transition-shadow hover:shadow-md dark:border-[#343944]">
      <div className="flex h-full flex-col border-l-4 border-[#C8102E] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="danger">Grupo {assignment.groupCode || assignment.externalGroupId}</Badge>
              <Badge>{assignment.schoolCycleName || assignment.schoolCycleExternalId}</Badge>
              {subject.code && <Badge tone="info">Clave {subject.code}</Badge>}
            </div>
            <h3 className="mt-3 break-words text-lg font-bold leading-snug text-slate-950 dark:text-slate-50">
              {subject.name}
            </h3>
          </div>
          <div className="hidden h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-400 sm:grid dark:bg-white/5 dark:text-slate-500">
            <BookOpen size={20} />
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <InfoPill icon={<DoorOpen size={16} />} label="Salon" value={assignment.classroom || 'Sin dato'} />
          <InfoPill icon={<GraduationCap size={16} />} label="Nivel" value={assignment.educationLevel || 'No identificado'} />
          <InfoPill icon={<CalendarDays size={16} />} label="Periodo" value={assignment.period || 'Sin dato'} />
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Horario semanal
            </p>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {scheduledCount > 0 ? `${scheduledCount} dias con clase` : 'Sin horario'}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {scheduleRows.map((row) => (
              <div
                key={row.day}
                className={cn(
                  'min-h-16 rounded-lg border px-3 py-2',
                  row.hasClass
                    ? 'border-slate-200 bg-white shadow-sm dark:border-[#343944] dark:bg-[#20242b]'
                    : 'border-transparent bg-slate-50 text-slate-400 dark:bg-white/5 dark:text-slate-500',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('text-xs font-bold', row.hasClass ? 'text-slate-700 dark:text-slate-200' : '')}>
                    {dayLabels[row.day]}
                  </span>
                  <Clock size={14} className={row.hasClass ? 'text-[#C8102E]' : 'text-slate-300 dark:text-slate-600'} />
                </div>
                <p
                  className={cn(
                    'mt-1 text-sm font-semibold leading-tight',
                    row.hasClass ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500',
                  )}
                >
                  {row.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function InfoPill({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/5">
      <div className="flex items-center gap-2 text-[#C8102E]">{icon}</div>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200" title={value}>
        {value}
      </p>
    </div>
  );
}

function cleanSubjectName(subject: Assignment['subject']) {
  const rawName = subject.name.trim();
  const match = rawName.match(/^\(([^)]+)\)\s*(.+)$/);

  return {
    code: subject.code || match?.[1] || null,
    name: match?.[2] || rawName,
  };
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function compareAcademicCycles(a: string, b: string) {
  return academicCycleValue(b) - academicCycleValue(a);
}

function academicCycleValue(value: string) {
  const match = value.match(/(\d{4})\s*[- ]\s*(\d)/);
  if (!match) return 0;
  return Number(match[1]) * 10 + Number(match[2]);
}

function formatSlots(slots: ScheduleSlot[]): string {
  const values = slots
    .map((slot) => (slot.startTime && slot.endTime ? `${slot.startTime}-${slot.endTime}` : slot.raw))
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => !isEmptyScheduleValue(value));

  return values.length > 0 ? values.join(', ') : 'Sin clase';
}

function isEmptyScheduleValue(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized === '-' || normalized === '—' || normalized === 'sin horario' || normalized === 'n/a';
}
