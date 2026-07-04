import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bluetooth, Check, ChevronDown, Link2, Search, ShieldCheck, Trash2, UserRoundPlus, X } from 'lucide-react';
import { FormEvent, KeyboardEvent, useMemo, useState } from 'react';
import { coordinationApi } from '@/core/api/coordination.api';
import type { Assignment, Beacon, SharedClassAssignment } from '@/core/api/types';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { Badge, Button, Card, EmptyState, Skeleton } from '@/shared/components/ui';

function currentAcademicCycle(date = new Date()): { year: number; term: 1 | 2 | 3 } {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const term = month <= 5 ? 1 : month <= 7 || (month === 8 && day <= 7) ? 2 : 3;
  return { year: date.getFullYear(), term };
}

function cycleLabel(year: number, term: number) {
  const season = term === 1 ? 'Primavera' : term === 2 ? 'Verano' : 'Otono';
  return `${year}-${term} ${season}`;
}

const REFRESH_INTERVAL_MS = 10_000;

export function InfrastructurePage() {
  const queryClient = useQueryClient();
  const [beaconEdit, setBeaconEdit] = useState<Beacon | null>(null);
  const [classroom, setClassroom] = useState('');
  const [uuid, setUuid] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedSubstitute, setSelectedSubstitute] = useState('');
  const initialCycle = useMemo(() => currentAcademicCycle(), []);
  const [schoolCycleYear, setSchoolCycleYear] = useState(initialCycle.year);
  const [schoolCycleTerm, setSchoolCycleTerm] = useState<1 | 2 | 3>(initialCycle.term);
  const [notes, setNotes] = useState('');
  const debouncedStudentSearch = useDebounce(studentSearch);

  const beacons = useQuery({ queryKey: ['infra', 'beacons'], queryFn: coordinationApi.beacons, refetchInterval: REFRESH_INTERVAL_MS });
  const bindings = useQuery({ queryKey: ['infra', 'bindings', debouncedStudentSearch], queryFn: () => coordinationApi.studentDeviceBindings({ q: debouncedStudentSearch || undefined }), refetchInterval: REFRESH_INTERVAL_MS });
  const sharedClassOptions = useQuery({ queryKey: ['shared-classes', 'options'], queryFn: coordinationApi.sharedClassOptions });
  const sharedClasses = useQuery({ queryKey: ['shared-classes'], queryFn: coordinationApi.sharedClasses, refetchInterval: REFRESH_INTERVAL_MS });

  const resetBeaconForm = () => { setBeaconEdit(null); setClassroom(''); setUuid(''); };
  const resetSubstitutionForm = () => {
    const cycle = currentAcademicCycle();
    setSelectedGroup('');
    setSelectedSubstitute('');
    setSchoolCycleYear(cycle.year);
    setSchoolCycleTerm(cycle.term);
    setNotes('');
  };

  const saveBeacon = useMutation({
    mutationFn: () => beaconEdit ? coordinationApi.updateBeacon(beaconEdit.id, { classroom, uuid }) : coordinationApi.createBeacon({ classroom, uuid }),
    onSuccess: async () => { resetBeaconForm(); await queryClient.invalidateQueries({ queryKey: ['infra', 'beacons'] }); },
  });

  const deleteBeacon = useMutation({
    mutationFn: coordinationApi.deleteBeacon,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['infra', 'beacons'] }),
  });

  const deleteBinding = useMutation({
    mutationFn: coordinationApi.deleteStudentDeviceBinding,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['infra', 'bindings'] }),
  });

  const saveSubstitution = useMutation({
    mutationFn: () => coordinationApi.createSharedClass({
      sourceAssignmentId: selectedGroup,
      assignedTeacherId: selectedSubstitute,
      schoolCycleYear,
      schoolCycleTerm,
      active: true,
      notes: notes || null,
    }),
    onSuccess: async () => { resetSubstitutionForm(); await queryClient.invalidateQueries({ queryKey: ['shared-classes'] }); },
  });

  const toggleSubstitution = useMutation({
    mutationFn: (assignment: SharedClassAssignment) => coordinationApi.updateSharedClass(assignment.id, { active: !assignment.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shared-classes'] }),
  });

  const deleteSubstitution = useMutation({
    mutationFn: coordinationApi.deleteSharedClass,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shared-classes'] }),
  });

  const selectedGroupOwner = useMemo(() => {
    const assignment = sharedClassOptions.data?.data.assignments.find((item) => item.id === selectedGroup);
    return assignment?.teacher.id;
  }, [selectedGroup, sharedClassOptions.data]);

  const professors = (sharedClassOptions.data?.data.teachers ?? []).filter((professor) => professor.id !== selectedGroupOwner);

  const onSubmitBeacon = (event: FormEvent) => {
    event.preventDefault();
    if (!classroom || !uuid) return;
    saveBeacon.mutate();
  };

  const onSubmitSubstitution = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedGroup || !selectedSubstitute || schoolCycleYear < 2000 || schoolCycleYear > 2100) return;
    saveSubstitution.mutate();
  };

  return <div className="space-y-6">
    <section className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-red-50 p-2.5 text-[#C8102E]"><Bluetooth size={21}/></div>
          <div><h2 className="font-bold">{beaconEdit ? 'Editar beacon' : 'Registrar beacon de salón'}</h2><p className="text-sm text-slate-500">UUID BLE válido para confirmar entrada del profesor.</p></div>
        </div>
        <form className="space-y-3" onSubmit={onSubmitBeacon}>
          <label className="block text-sm font-semibold">Salón<input className="field mt-1" value={classroom} onChange={(event) => setClassroom(event.target.value.toUpperCase())} placeholder="AULA 304" required /></label>
          <label className="block text-sm font-semibold">UUID<input className="field mt-1 font-mono" value={uuid} onChange={(event) => setUuid(event.target.value)} placeholder="12345678-1234-1234-1234-123456789abc" required /></label>
          <div className="flex gap-2"><Button disabled={saveBeacon.isPending}>{beaconEdit ? 'Actualizar' : 'Guardar'}</Button>{beaconEdit && <Button type="button" variant="secondary" onClick={resetBeaconForm}>Cancelar</Button>}</div>
        </form>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-5"><h2 className="font-bold">Beacons registrados</h2><p className="text-sm text-slate-500">Configuración consumida por la app de profesores.</p></div>
        {beacons.isLoading ? <div className="p-5"><Skeleton className="h-32"/></div> : !beacons.data?.data.length ? <div className="p-5"><EmptyState icon={<Bluetooth/>} title="Sin beacons" description="Registra el primer salón para activar validación BLE."/></div> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Salón</th><th className="px-5 py-3">UUID</th><th className="px-5 py-3 text-right">Acciones</th></tr></thead><tbody>{beacons.data.data.map((beacon) => <tr key={beacon.id} className="border-t border-slate-100"><td className="px-5 py-3 font-semibold">{beacon.classroom}</td><td className="px-5 py-3 font-mono text-xs">{beacon.uuid}</td><td className="px-5 py-3"><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => { setBeaconEdit(beacon); setClassroom(beacon.classroom); setUuid(beacon.uuid); }}>Editar</Button><Button variant="ghost" onClick={() => deleteBeacon.mutate(beacon.id)}><Trash2 size={16}/></Button></div></td></tr>)}</tbody></table></div>}
      </Card>
    </section>

    <section className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><UserRoundPlus size={21}/></div>
          <div><h2 className="font-bold">Compartir clase</h2><p className="text-sm text-slate-500">El profesor receptor verá esta clase junto con su carga oficial.</p></div>
        </div>
        <form className="space-y-3" onSubmit={onSubmitSubstitution}>
          <ClassAssignmentCombobox
            assignments={sharedClassOptions.data?.data.assignments ?? []}
            selectedId={selectedGroup}
            onSelect={(assignmentId) => {
              setSelectedGroup(assignmentId);
              setSelectedSubstitute('');
            }}
          />
          <label className="block text-sm font-semibold">Profesor receptor<select className="field mt-1" value={selectedSubstitute} onChange={(event) => setSelectedSubstitute(event.target.value)} required><option value="">Selecciona profesor</option>{professors.map((professor) => <option key={professor.id} value={professor.id}>{professor.name} · {professor.email || professor.institutionalEmail || professor.institutionalCode}</option>)}</select></label>
          <div>
            <p className="text-sm font-semibold">Ciclo de asignación</p>
            <div className="mt-1 grid grid-cols-[110px_1fr] gap-2">
              <label className="sr-only" htmlFor="shared-cycle-year">Año</label>
              <input id="shared-cycle-year" className="field" type="number" min="2000" max="2100" value={schoolCycleYear} onChange={(event) => setSchoolCycleYear(Number(event.target.value))} />
              <div className="grid grid-cols-3 rounded-lg border border-slate-300 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900" aria-label="Parte del año">
                {([1, 2, 3] as const).map((term) => <button key={term} type="button" onClick={() => setSchoolCycleTerm(term)} className={`h-9 rounded-md text-sm font-semibold transition ${schoolCycleTerm === term ? 'bg-white text-[#C8102E] shadow-sm dark:bg-slate-700 dark:text-red-300' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}>{term}</button>)}
              </div>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">{cycleLabel(schoolCycleYear, schoolCycleTerm)}</p>
          </div>
          <label className="block text-sm font-semibold">Notas<input className="field mt-1" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Motivo o comentario" /></label>
          <Button disabled={saveSubstitution.isPending}>Compartir clase</Button>
        </form>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-5"><h2 className="font-bold">Clases compartidas</h2><p className="text-sm text-slate-500">Asignaciones no oficiales activas o programadas.</p></div>
        {sharedClasses.isLoading ? <div className="p-5"><Skeleton className="h-32"/></div> : !sharedClasses.data?.data.length ? <div className="p-5"><EmptyState icon={<ShieldCheck/>} title="Sin clases compartidas" description="Comparte una clase desde el formulario."/></div> : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Grupo</th><th className="px-5 py-3">Titular</th><th className="px-5 py-3">Profesor receptor</th><th className="px-5 py-3">Ciclo</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3 text-right">Acciones</th></tr></thead><tbody>{sharedClasses.data.data.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="px-5 py-3"><b>{item.sourceAssignment.subject.name}</b><p className="text-xs text-slate-500">{item.sourceAssignment.groupCode || '-'} · {item.sourceAssignment.classroom || 'Sin salón'}</p></td><td className="px-5 py-3">{item.sourceAssignment.teacher.name}</td><td className="px-5 py-3">{item.assignedTeacher.name}</td><td className="px-5 py-3 text-xs font-semibold">{cycleLabel(item.schoolCycleYear, item.schoolCycleTerm)}</td><td className="px-5 py-3"><Badge tone={item.active ? 'success' : 'neutral'}>{item.active ? 'Activa' : 'Inactiva'}</Badge></td><td className="px-5 py-3"><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => toggleSubstitution.mutate(item)}>{item.active ? 'Pausar' : 'Activar'}</Button><Button variant="ghost" onClick={() => deleteSubstitution.mutate(item.id)}><Trash2 size={16}/></Button></div></td></tr>)}</tbody></table></div>}
      </Card>
    </section>

    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-bold">Alumnos vinculados</h2><p className="text-sm text-slate-500">Matrícula y UUID estable generado por la app de alumnos.</p></div><label className="relative block sm:w-80"><Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17}/><input className="field pl-9" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Buscar matrícula" /></label></div>
      {bindings.isLoading ? <div className="p-5"><Skeleton className="h-32"/></div> : !bindings.data?.data.length ? <div className="p-5"><EmptyState icon={<Link2/>} title="Sin alumnos vinculados" description="Los alumnos aparecerán cuando vinculen su celular desde la app."/></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Matrícula</th><th className="px-5 py-3">UUID</th><th className="px-5 py-3">Alumno / grupo</th><th className="px-5 py-3">Dispositivo</th><th className="px-5 py-3 text-right">Acciones</th></tr></thead><tbody>{bindings.data.data.map((binding) => <tr key={binding.id} className="border-t border-slate-100"><td className="px-5 py-3 font-semibold">{binding.matricula}</td><td className="px-5 py-3 font-mono text-xs">{binding.attendanceUuid}</td><td className="px-5 py-3">{binding.students.length ? binding.students.map((student) => <div key={student.id} className="mb-1 last:mb-0"><b>{student.name}</b><p className="text-xs text-slate-500">{student.group.name} · {student.group.classroom || 'Sin salón'} · {student.group.professor.name}</p></div>) : <span className="text-slate-400">No aparece en grupos sincronizados</span>}</td><td className="px-5 py-3">{binding.platform || '-'}<p className="text-xs text-slate-500">{binding.deviceInfo || ''}</p></td><td className="px-5 py-3 text-right"><Button variant="ghost" onClick={() => deleteBinding.mutate(binding.matricula)}><Trash2 size={16}/></Button></td></tr>)}</tbody></table></div>}
    </Card>
  </div>;
}

function ClassAssignmentCombobox({
  assignments,
  selectedId,
  onSelect,
}: {
  assignments: Assignment[];
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
    ? `${selected.subject.name} · Grupo ${selected.groupCode || '-'} · ${selected.teacher.name}`
    : '';

  return <label className="relative block text-sm font-semibold">
    Materia / grupo
    <div className="relative mt-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17}/>
      <input
        className="field pr-16 pl-9"
        role="combobox"
        aria-expanded={open}
        aria-controls="shared-class-options"
        aria-autocomplete="list"
        value={open ? query : selectedText}
        placeholder="Buscar materia, clave, grupo, salón o profesor"
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
      />
      {selectedId ? <button type="button" title="Limpiar selección" className="absolute right-9 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center text-slate-400 hover:text-slate-700" onMouseDown={(event) => event.preventDefault()} onClick={() => onSelect('')}><X size={15}/></button> : null}
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={17}/>
    </div>
    {open ? <div id="shared-class-options" role="listbox" className="absolute z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase text-slate-400">
        <span>{normalizedQuery ? 'Coincidencias' : 'Clases disponibles'}</span>
        <span>{matches.length}{assignments.length > matches.length ? '+' : ''}</span>
      </div>
      {matches.length === 0 ? <p className="px-3 py-6 text-center text-sm font-normal text-slate-500">No se encontraron clases.</p> : matches.map((assignment, index) => {
        const isSelected = assignment.id === selectedId;
        return <button
          key={assignment.id}
          type="button"
          role="option"
          aria-selected={isSelected}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => choose(assignment)}
          className={`mb-1 w-full rounded-md border px-3 py-2.5 text-left transition last:mb-0 ${index === activeIndex ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'}`}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-bold text-slate-900 dark:text-white">{cleanAssignmentName(assignment.subject.name)}</p>
              <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                {assignment.subject.code ? <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{assignment.subject.code}</span> : null}
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Grupo {assignment.groupCode || '-'}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{assignment.schoolCycleName || assignment.schoolCycleExternalId}</span>
              </div>
              <p className="mt-1.5 truncate text-xs font-normal text-slate-500">{assignment.classroom || 'Sin salón'} · {assignment.teacher.name}</p>
            </div>
            {isSelected ? <Check className="mt-1 shrink-0 text-[#C8102E]" size={17}/> : null}
          </div>
        </button>;
      })}
    </div> : null}
  </label>;
}

function assignmentSearchText(assignment: Assignment) {
  return normalizeSearch([
    assignment.subject.name,
    assignment.subject.code,
    assignment.groupCode,
    assignment.classroom,
    assignment.teacher.name,
    assignment.teacher.externalId,
    assignment.schoolCycleName,
    assignment.schoolCycleExternalId,
  ].filter(Boolean).join(' '));
}

function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function cleanAssignmentName(value: string) {
  return value.replace(/^\([^)]+\)\s*/, '').trim();
}
