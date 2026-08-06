import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, Search, ShieldCheck, Trash2, UserRoundPlus, X } from 'lucide-react';
import { type FormEvent, type KeyboardEvent, useMemo, useState } from 'react';
import { coordinationApi } from '@/core/api/coordination.api';
import type { Assignment, SharedClassAssignment } from '@/core/api/types';
import { Badge, Button, Card, EmptyState, Skeleton } from '@/shared/components/ui';

const REFRESH_INTERVAL_MS = 10_000;

type SharedClassSortKey = 'subject' | 'period' | 'group' | 'owner' | 'receiver' | 'cycle' | 'status';
type SortDirection = 'asc' | 'desc';

function currentAcademicCycle(date = new Date()): { year: number; term: 1 | 2 | 3 } {
  const month = date.getMonth() + 1;
  const term = month <= 5 ? 1 : month <= 7 ? 2 : 3;
  return { year: date.getFullYear(), term };
}

function cycleLabel(year: number, term: number) {
  const season = term === 1 ? 'Primavera' : term === 2 ? 'Verano' : 'Otono';
  return `${year}-${term} ${season}`;
}

export function SharedClassManagement() {
  const queryClient = useQueryClient();
  const initialCycle = useMemo(() => currentAcademicCycle(), []);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedReceiver, setSelectedReceiver] = useState('');
  const [schoolCycleYear, setSchoolCycleYear] = useState(initialCycle.year);
  const [schoolCycleTerm, setSchoolCycleTerm] = useState<1 | 2 | 3>(initialCycle.term);
  const [sort, setSort] = useState<{ key: SharedClassSortKey; direction: SortDirection }>({
    key: 'cycle',
    direction: 'desc',
  });

  const sharedClassOptions = useQuery({
    queryKey: ['shared-classes', 'options'],
    queryFn: coordinationApi.sharedClassOptions,
  });
  const sharedClasses = useQuery({
    queryKey: ['shared-classes'],
    queryFn: coordinationApi.sharedClasses,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const sourceAssignments = useMemo(() => {
    return sharedClassOptions.data?.data.assignments ?? [];
  }, [sharedClassOptions.data]);

  const sortedSharedClasses = useMemo(() => {
    const items = [...(sharedClasses.data?.data ?? [])];
    return items.sort((a, b) => {
      const result = compareSharedClasses(a, b, sort.key);
      return sort.direction === 'asc' ? result : -result;
    });
  }, [sharedClasses.data, sort]);

  const updateSort = (key: SharedClassSortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const selectedGroupOwner = useMemo(() => {
    const assignment = sourceAssignments.find((item) => item.id === selectedGroup);
    return assignment?.teacher.id;
  }, [selectedGroup, sourceAssignments]);

  const receivers = (sharedClassOptions.data?.data.teachers ?? []).filter(
    (professor) => professor.id !== selectedGroupOwner,
  );

  const resetForm = () => {
    const cycle = currentAcademicCycle();
    setSelectedGroup('');
    setSelectedReceiver('');
    setSchoolCycleYear(cycle.year);
    setSchoolCycleTerm(cycle.term);
  };

  const saveSharedClass = useMutation({
    mutationFn: () =>
      coordinationApi.createSharedClass({
        sourceAssignmentId: selectedGroup,
        assignedTeacherId: selectedReceiver,
        schoolCycleYear,
        schoolCycleTerm,
        active: true,
      }),
    onSuccess: async () => {
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ['shared-classes'] });
    },
  });

  const toggleSharedClass = useMutation({
    mutationFn: (assignment: SharedClassAssignment) =>
      coordinationApi.updateSharedClass(assignment.id, { active: !assignment.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shared-classes'] }),
  });

  const deleteSharedClass = useMutation({
    mutationFn: coordinationApi.deleteSharedClass,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shared-classes'] }),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedGroup || !selectedReceiver || schoolCycleYear < 2000 || schoolCycleYear > 2100) return;
    saveSharedClass.mutate();
  };

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_1fr]">
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
            <UserRoundPlus size={21} />
          </div>
          <div>
            <h2 className="font-bold">Compartir clase</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              El receptor vera esta clase junto con su carga oficial.
            </p>
          </div>
        </div>

        <form className="space-y-3" onSubmit={onSubmit}>
          <ClassAssignmentCombobox
            assignments={sourceAssignments}
            loading={sharedClassOptions.isLoading}
            selectedId={selectedGroup}
            onSelect={(assignmentId) => {
              setSelectedGroup(assignmentId);
              setSelectedReceiver('');
            }}
          />
          <label className="block text-sm font-semibold">
            Profesor receptor
            <select
              className="field mt-1"
              value={selectedReceiver}
              onChange={(event) => setSelectedReceiver(event.target.value)}
              required
              disabled={!selectedGroup}
            >
              <option value="">Selecciona profesor</option>
              {receivers.map((professor) => (
                <option key={professor.id} value={professor.id}>
                  {professor.name} - {professor.email || professor.institutionalEmail || professor.institutionalCode}
                </option>
              ))}
            </select>
          </label>

          <div>
            <p className="text-sm font-semibold">Ciclo de asignacion</p>
            <div className="mt-1 grid grid-cols-[110px_1fr] gap-2">
              <label className="sr-only" htmlFor="shared-cycle-year">
                Ano
              </label>
              <input
                id="shared-cycle-year"
                className="field"
                type="number"
                min="2000"
                max="2100"
                value={schoolCycleYear}
                onChange={(event) => setSchoolCycleYear(Number(event.target.value))}
              />
              <div
                className="grid grid-cols-3 rounded-lg border border-slate-300 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900"
                aria-label="Parte del ano"
              >
                {([1, 2, 3] as const).map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => setSchoolCycleTerm(term)}
                    className={`h-9 rounded-md text-sm font-semibold transition ${
                      schoolCycleTerm === term
                        ? 'bg-white text-[#C8102E] shadow-sm dark:bg-slate-700 dark:text-red-300'
                        : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                    }`}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {cycleLabel(schoolCycleYear, schoolCycleTerm)}
            </p>
          </div>

          <Button disabled={saveSharedClass.isPending || !selectedGroup || !selectedReceiver}>Compartir clase</Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-5 dark:border-[#2e3138]">
          <h2 className="font-bold">Clases compartidas</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Asignaciones no oficiales activas o pausadas.</p>
        </div>
        {sharedClasses.isLoading ? (
          <div className="p-5">
            <Skeleton className="h-32" />
          </div>
        ) : !sharedClasses.data?.data.length ? (
          <div className="p-5">
            <EmptyState
              icon={<ShieldCheck />}
              title="Sin clases compartidas"
              description="Comparte una clase desde la carga academica."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-white/5 dark:text-slate-400">
                <tr>
                  <SortableHeader label="Materia" sortKey="subject" activeSort={sort} onSort={updateSort} />
                  <SortableHeader label="Periodo" sortKey="period" activeSort={sort} onSort={updateSort} />
                  <SortableHeader label="Grupo" sortKey="group" activeSort={sort} onSort={updateSort} />
                  <SortableHeader label="Titular" sortKey="owner" activeSort={sort} onSort={updateSort} />
                  <SortableHeader label="Profesor receptor" sortKey="receiver" activeSort={sort} onSort={updateSort} />
                  <SortableHeader label="Ciclo" sortKey="cycle" activeSort={sort} onSort={updateSort} />
                  <SortableHeader label="Estado" sortKey="status" activeSort={sort} onSort={updateSort} />
                  <th className="px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sortedSharedClasses.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 dark:border-[#2e3138]">
                    <td className="px-5 py-3">
                      <b>{cleanAssignmentName(item.sourceAssignment.subject.name)}</b>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {item.sourceAssignment.classroom || 'Sin salón'}
                      </p>
                    </td>
                    <td className="px-5 py-3 font-semibold tabular-nums">
                      {item.sourceAssignment.schoolCycleName || item.sourceAssignment.schoolCycleExternalId || '-'}
                    </td>
                    <td className="px-5 py-3 font-semibold">{item.sourceAssignment.groupCode || '-'}</td>
                    <td className="px-5 py-3">{item.sourceAssignment.teacher.name}</td>
                    <td className="px-5 py-3">{item.assignedTeacher.name}</td>
                    <td className="px-5 py-3 text-xs font-semibold">
                      {cycleLabel(item.schoolCycleYear, item.schoolCycleTerm)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={item.active ? 'success' : 'neutral'}>{item.active ? 'Activa' : 'Inactiva'}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => toggleSharedClass.mutate(item)}>
                          {item.active ? 'Pausar' : 'Activar'}
                        </Button>
                        <Button variant="ghost" onClick={() => deleteSharedClass.mutate(item.id)}>
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeSort,
  onSort,
}: {
  label: string;
  sortKey: SharedClassSortKey;
  activeSort: { key: SharedClassSortKey; direction: SortDirection };
  onSort: (key: SharedClassSortKey) => void;
}) {
  const active = activeSort.key === sortKey;
  const Icon = !active ? ArrowUpDown : activeSort.direction === 'asc' ? ArrowUp : ArrowDown;

  return (
    <th
      className="px-3 py-2"
      aria-sort={!active ? 'none' : activeSort.direction === 'asc' ? 'ascending' : 'descending'}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left font-semibold transition hover:bg-slate-200/70 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E]/30 dark:hover:bg-white/10 dark:hover:text-slate-100"
      >
        <span>{label}</span>
        <Icon size={13} className={active ? 'text-[#C8102E]' : 'text-slate-300 group-hover:text-slate-500'} />
      </button>
    </th>
  );
}

function compareSharedClasses(a: SharedClassAssignment, b: SharedClassAssignment, key: SharedClassSortKey) {
  const values: Record<SharedClassSortKey, [string | number, string | number]> = {
    subject: [cleanAssignmentName(a.sourceAssignment.subject.name), cleanAssignmentName(b.sourceAssignment.subject.name)],
    period: [
      a.sourceAssignment.schoolCycleName || a.sourceAssignment.schoolCycleExternalId || '',
      b.sourceAssignment.schoolCycleName || b.sourceAssignment.schoolCycleExternalId || '',
    ],
    group: [a.sourceAssignment.groupCode || '', b.sourceAssignment.groupCode || ''],
    owner: [a.sourceAssignment.teacher.name, b.sourceAssignment.teacher.name],
    receiver: [a.assignedTeacher.name, b.assignedTeacher.name],
    cycle: [a.schoolCycleYear * 10 + a.schoolCycleTerm, b.schoolCycleYear * 10 + b.schoolCycleTerm],
    status: [a.active ? 1 : 0, b.active ? 1 : 0],
  };
  const [left, right] = values[key];
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), 'es', { numeric: true, sensitivity: 'base' });
}

function ClassAssignmentCombobox({
  assignments,
  loading,
  selectedId,
  onSelect,
}: {
  assignments: Assignment[];
  loading: boolean;
  selectedId: string;
  onSelect: (assignmentId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = assignments.find((assignment) => assignment.id === selectedId);
  const normalizedQuery = normalizeSearch(query);
  const matches = useMemo(() => {
    const filtered = normalizedQuery
      ? assignments.filter((assignment) => assignmentSearchText(assignment).includes(normalizedQuery))
      : assignments;
    return filtered.slice(0, 10);
  }, [assignments, normalizedQuery]);

  const choose = (assignment: Assignment) => {
    onSelect(assignment.id);
    setQuery('');
    setOpen(false);
    setActiveIndex(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && open && matches[activeIndex]) {
      event.preventDefault();
      choose(matches[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  const selectedText = selected
    ? `${cleanAssignmentName(selected.subject.name)} - Grupo ${selected.groupCode || '-'} - ${selected.teacher.name}`
    : '';

  return (
    <label className="relative block text-sm font-semibold">
      Materia / grupo
      <div className="relative mt-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
        <input
          className="field field-both-icons"
          role="combobox"
          aria-expanded={open}
          aria-controls="shared-class-options"
          aria-autocomplete="list"
          value={open ? query : selectedText}
          placeholder={loading ? 'Cargando clases...' : 'Buscar materia, clave, grupo o profesor'}
          onFocus={() => {
            setQuery('');
            setOpen(true);
            setActiveIndex(0);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          required={!selectedId}
          disabled={loading || assignments.length === 0}
        />
        {selectedId ? (
          <button
            type="button"
            title="Limpiar seleccion"
            className="absolute right-9 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect('')}
          >
            <X size={15} />
          </button>
        ) : null}
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
      </div>
      {open ? (
        <div
          id="shared-class-options"
          role="listbox"
          className="absolute z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase text-slate-400">
            <span>{normalizedQuery ? 'Coincidencias' : 'Clases disponibles'}</span>
            <span>
              {matches.length}
              {assignments.length > matches.length ? '+' : ''}
            </span>
          </div>
          {matches.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm font-normal text-slate-500">
              No se encontraron clases para este profesor.
            </p>
          ) : (
            matches.map((assignment, index) => {
              const isSelected = assignment.id === selectedId;
              return (
                <button
                  key={assignment.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(assignment)}
                  className={`mb-1 w-full rounded-md border px-3 py-2.5 text-left transition last:mb-0 ${
                    index === activeIndex
                      ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
                      : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-bold text-slate-900 dark:text-white">
                        {cleanAssignmentName(assignment.subject.name)}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                        {assignment.subject.code ? (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                            {assignment.subject.code}
                          </span>
                        ) : null}
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          Grupo {assignment.groupCode || '-'}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {assignment.schoolCycleName || assignment.schoolCycleExternalId}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate text-xs font-normal text-slate-500">
                        {assignment.classroom || 'Sin salon'} - {assignment.teacher.name}
                      </p>
                    </div>
                    {isSelected ? <Check className="mt-1 shrink-0 text-[#C8102E]" size={17} /> : null}
                  </div>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </label>
  );
}

function assignmentSearchText(assignment: Assignment) {
  return normalizeSearch(
    [
      assignment.subject.name,
      assignment.subject.code,
      assignment.groupCode,
      assignment.classroom,
      assignment.teacher.name,
      assignment.teacher.externalId,
      assignment.schoolCycleName,
      assignment.schoolCycleExternalId,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function cleanAssignmentName(value: string) {
  return value.replace(/^\([^)]+\)\s*/, '').trim();
}
