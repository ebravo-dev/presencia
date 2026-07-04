import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bluetooth, Link2, ShieldCheck, Trash2, UserRoundPlus } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { coordinationApi } from '@/core/api/coordination.api';
import type { Beacon, SharedClassAssignment } from '@/core/api/types';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { Badge, Button, Card, EmptyState, Skeleton } from '@/shared/components/ui';

function normalizeDateTime(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin límite';
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
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
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [notes, setNotes] = useState('');
  const debouncedStudentSearch = useDebounce(studentSearch);

  const beacons = useQuery({ queryKey: ['infra', 'beacons'], queryFn: coordinationApi.beacons, refetchInterval: REFRESH_INTERVAL_MS });
  const bindings = useQuery({ queryKey: ['infra', 'bindings', debouncedStudentSearch], queryFn: () => coordinationApi.studentDeviceBindings({ q: debouncedStudentSearch || undefined }), refetchInterval: REFRESH_INTERVAL_MS });
  const sharedClassOptions = useQuery({ queryKey: ['shared-classes', 'options'], queryFn: coordinationApi.sharedClassOptions });
  const sharedClasses = useQuery({ queryKey: ['shared-classes'], queryFn: coordinationApi.sharedClasses, refetchInterval: REFRESH_INTERVAL_MS });

  const resetBeaconForm = () => { setBeaconEdit(null); setClassroom(''); setUuid(''); };
  const resetSubstitutionForm = () => { setSelectedGroup(''); setSelectedSubstitute(''); setStartsAt(''); setEndsAt(''); setNotes(''); };

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
      startsAt: normalizeDateTime(startsAt),
      endsAt: normalizeDateTime(endsAt),
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
    if (!selectedGroup || !selectedSubstitute) return;
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
          <label className="block text-sm font-semibold">Materia / grupo<select className="field mt-1" value={selectedGroup} onChange={(event) => { setSelectedGroup(event.target.value); setSelectedSubstitute(''); }} required><option value="">Selecciona grupo</option>{sharedClassOptions.data?.data.assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.subject.name} · {assignment.groupCode || '-'} · {assignment.classroom || 'Sin salón'} · {assignment.teacher.name}</option>)}</select></label>
          <label className="block text-sm font-semibold">Profesor receptor<select className="field mt-1" value={selectedSubstitute} onChange={(event) => setSelectedSubstitute(event.target.value)} required><option value="">Selecciona profesor</option>{professors.map((professor) => <option key={professor.id} value={professor.id}>{professor.name} · {professor.email || professor.institutionalEmail || professor.institutionalCode}</option>)}</select></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold">Desde<input className="field mt-1" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label className="block text-sm font-semibold">Hasta<input className="field mt-1" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label></div>
          <label className="block text-sm font-semibold">Notas<input className="field mt-1" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Motivo o comentario" /></label>
          <Button disabled={saveSubstitution.isPending}>Compartir clase</Button>
        </form>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-5"><h2 className="font-bold">Clases compartidas</h2><p className="text-sm text-slate-500">Asignaciones no oficiales activas o programadas.</p></div>
        {sharedClasses.isLoading ? <div className="p-5"><Skeleton className="h-32"/></div> : !sharedClasses.data?.data.length ? <div className="p-5"><EmptyState icon={<ShieldCheck/>} title="Sin clases compartidas" description="Comparte una clase desde el formulario."/></div> : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Grupo</th><th className="px-5 py-3">Titular</th><th className="px-5 py-3">Profesor receptor</th><th className="px-5 py-3">Vigencia</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3 text-right">Acciones</th></tr></thead><tbody>{sharedClasses.data.data.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="px-5 py-3"><b>{item.sourceAssignment.subject.name}</b><p className="text-xs text-slate-500">{item.sourceAssignment.groupCode || '-'} · {item.sourceAssignment.classroom || 'Sin salón'}</p></td><td className="px-5 py-3">{item.sourceAssignment.teacher.name}</td><td className="px-5 py-3">{item.assignedTeacher.name}</td><td className="px-5 py-3 text-xs">{formatDate(item.startsAt)}<br/>{formatDate(item.endsAt)}</td><td className="px-5 py-3"><Badge tone={item.active ? 'success' : 'neutral'}>{item.active ? 'Activa' : 'Inactiva'}</Badge></td><td className="px-5 py-3"><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => toggleSubstitution.mutate(item)}>{item.active ? 'Pausar' : 'Activar'}</Button><Button variant="ghost" onClick={() => deleteSubstitution.mutate(item.id)}><Trash2 size={16}/></Button></div></td></tr>)}</tbody></table></div>}
      </Card>
    </section>

    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-bold">Alumnos vinculados</h2><p className="text-sm text-slate-500">Matrícula y UUID estable generado por la app de alumnos.</p></div><label className="relative block sm:w-80"><Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17}/><input className="field pl-9" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Buscar matrícula" /></label></div>
      {bindings.isLoading ? <div className="p-5"><Skeleton className="h-32"/></div> : !bindings.data?.data.length ? <div className="p-5"><EmptyState icon={<Link2/>} title="Sin alumnos vinculados" description="Los alumnos aparecerán cuando vinculen su celular desde la app."/></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Matrícula</th><th className="px-5 py-3">UUID</th><th className="px-5 py-3">Alumno / grupo</th><th className="px-5 py-3">Dispositivo</th><th className="px-5 py-3 text-right">Acciones</th></tr></thead><tbody>{bindings.data.data.map((binding) => <tr key={binding.id} className="border-t border-slate-100"><td className="px-5 py-3 font-semibold">{binding.matricula}</td><td className="px-5 py-3 font-mono text-xs">{binding.attendanceUuid}</td><td className="px-5 py-3">{binding.students.length ? binding.students.map((student) => <div key={student.id} className="mb-1 last:mb-0"><b>{student.name}</b><p className="text-xs text-slate-500">{student.group.name} · {student.group.classroom || 'Sin salón'} · {student.group.professor.name}</p></div>) : <span className="text-slate-400">No aparece en grupos sincronizados</span>}</td><td className="px-5 py-3">{binding.platform || '-'}<p className="text-xs text-slate-500">{binding.deviceInfo || ''}</p></td><td className="px-5 py-3 text-right"><Button variant="ghost" onClick={() => deleteBinding.mutate(binding.matricula)}><Trash2 size={16}/></Button></td></tr>)}</tbody></table></div>}
    </Card>
  </div>;
}
