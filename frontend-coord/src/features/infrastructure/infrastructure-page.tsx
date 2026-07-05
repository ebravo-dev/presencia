import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bluetooth, Link2, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { coordinationApi } from '@/core/api/coordination.api';
import type { Beacon } from '@/core/api/types';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { Button, Card, EmptyState, Skeleton } from '@/shared/components/ui';

const REFRESH_INTERVAL_MS = 10_000;

export function InfrastructurePage() {
  const queryClient = useQueryClient();
  const [beaconEdit, setBeaconEdit] = useState<Beacon | null>(null);
  const [classroom, setClassroom] = useState('');
  const [uuid, setUuid] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const debouncedStudentSearch = useDebounce(studentSearch);

  const beacons = useQuery({ queryKey: ['infra', 'beacons'], queryFn: coordinationApi.beacons, refetchInterval: REFRESH_INTERVAL_MS });
  const bindings = useQuery({ queryKey: ['infra', 'bindings', debouncedStudentSearch], queryFn: () => coordinationApi.studentDeviceBindings({ q: debouncedStudentSearch || undefined }), refetchInterval: REFRESH_INTERVAL_MS });

  const resetBeaconForm = () => { setBeaconEdit(null); setClassroom(''); setUuid(''); };

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

  const onSubmitBeacon = (event: FormEvent) => {
    event.preventDefault();
    if (!classroom || !uuid) return;
    saveBeacon.mutate();
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

    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-bold">Alumnos vinculados</h2><p className="text-sm text-slate-500">Matrícula y UUID estable generado por la app de alumnos.</p></div><label className="relative block sm:w-80"><Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17}/><input className="field pl-9" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Buscar matrícula" /></label></div>
      {bindings.isLoading ? <div className="p-5"><Skeleton className="h-32"/></div> : !bindings.data?.data.length ? <div className="p-5"><EmptyState icon={<Link2/>} title="Sin alumnos vinculados" description="Los alumnos aparecerán cuando vinculen su celular desde la app."/></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Matrícula</th><th className="px-5 py-3">UUID</th><th className="px-5 py-3">Alumno / grupo</th><th className="px-5 py-3">Dispositivo</th><th className="px-5 py-3 text-right">Acciones</th></tr></thead><tbody>{bindings.data.data.map((binding) => <tr key={binding.id} className="border-t border-slate-100"><td className="px-5 py-3 font-semibold">{binding.matricula}</td><td className="px-5 py-3 font-mono text-xs">{binding.attendanceUuid}</td><td className="px-5 py-3">{binding.students.length ? binding.students.map((student) => <div key={student.id} className="mb-1 last:mb-0"><b>{student.name}</b><p className="text-xs text-slate-500">{student.group.name} · {student.group.classroom || 'Sin salón'} · {student.group.professor.name}</p></div>) : <span className="text-slate-400">No aparece en grupos sincronizados</span>}</td><td className="px-5 py-3">{binding.platform || '-'}<p className="text-xs text-slate-500">{binding.deviceInfo || ''}</p></td><td className="px-5 py-3 text-right"><Button variant="ghost" onClick={() => deleteBinding.mutate(binding.matricula)}><Trash2 size={16}/></Button></td></tr>)}</tbody></table></div>}
    </Card>
  </div>;
}
