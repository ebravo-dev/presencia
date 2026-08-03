import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, RefreshCw, Search, ShieldCheck, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { coordinationApi } from '@/core/api/coordination.api';
import { useAuthStore } from '@/core/auth/auth.store';
import { Badge, Button, Card, EmptyState, Skeleton } from '@/shared/components/ui';
import { useDebounce } from '@/shared/hooks/use-debounce';

export function DeviceBindingsPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search);
  const canAuthorizeChanges = user?.role === 'COORDINATOR';
  const bindings = useQuery({
    queryKey: ['coordination', 'student-device-bindings', debouncedSearch],
    queryFn: () => coordinationApi.studentDeviceBindings({ q: debouncedSearch || undefined }),
  });
  const authorizeChange = useMutation({
    mutationFn: coordinationApi.authorizeStudentDeviceChange,
    onSuccess: async (_, matricula) => {
      setMessage(`Cambio autorizado para la matrícula ${matricula}. El alumno podrá vincular su nuevo celular al iniciar sesión.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['coordination', 'student-device-bindings'] }),
        queryClient.invalidateQueries({ queryKey: ['coordination', 'infrastructure-summary'] }),
      ]);
    },
  });

  const requestDeviceChange = (matricula: string) => {
    setMessage(null);
    const confirmed = window.confirm(
      `¿Autorizar el cambio de celular para ${matricula}? El vínculo actual quedará revocado y sólo un nuevo login estudiantil podrá registrar otro UUID.`,
    );
    if (confirmed) authorizeChange.mutate(matricula);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-[#17191f] p-6 text-white shadow-lg shadow-slate-900/10 sm:p-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-red-300">
              <ShieldCheck size={15} /> Control contra suplantación
            </p>
            <h2 className="mt-3 text-2xl font-bold">Celulares vinculados</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Cada matrícula conserva un único UUID. Autoriza un cambio sólo después de validar la identidad del alumno.
            </p>
          </div>
          <Badge tone={canAuthorizeChanges ? 'success' : 'warning'} className="self-start md:self-auto">
            {canAuthorizeChanges ? 'Cambios habilitados' : 'Cuenta de sólo lectura'}
          </Badge>
        </div>
      </section>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 dark:border-[#1f2229] sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="font-bold">Vínculos vigentes</h3>
            <p className="mt-1 text-sm text-slate-500">Busca por matrícula y revisa el dispositivo antes de autorizar el reemplazo.</p>
          </div>
          <label className="relative block sm:w-80">
            <span className="sr-only">Buscar matrícula</span>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              className="field pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar matrícula"
            />
          </label>
        </div>

        {message && <p role="status" className="m-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        {authorizeChange.isError && (
          <p role="alert" className="m-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[#C8102E]">
            No se pudo autorizar el cambio. Verifica tus permisos y vuelve a intentarlo.
          </p>
        )}

        {bindings.isLoading ? (
          <div className="space-y-3 p-5"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
        ) : bindings.isError ? (
          <div className="p-5">
            <EmptyState icon={<RefreshCw />} title="No pudimos consultar los vínculos" description="Revisa la conexión con Attendance Service e inténtalo de nuevo." />
          </div>
        ) : !bindings.data?.data.length ? (
          <div className="p-5">
            <EmptyState icon={<Link2 />} title="Sin celulares vinculados" description="Los alumnos aparecerán después de iniciar sesión en la app estudiantil." />
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-[#1f2229]">
            {bindings.data.data.map((binding) => (
              <article key={binding.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_1.2fr_auto] lg:items-center">
                <div className="min-w-0">
                  <p className="font-semibold">Matrícula {binding.matricula}</p>
                  <p className="mt-1 truncate font-mono text-xs text-slate-500" title={binding.attendanceUuid}>{binding.attendanceUuid}</p>
                </div>
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-[#22252b]"><Smartphone size={18} /></span>
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">{formatPlatform(binding.platform)}</p>
                    <p className="truncate text-xs text-slate-500" title={binding.deviceInfo ?? undefined}>{binding.deviceInfo || 'Información del dispositivo no disponible'}</p>
                    {binding.students[0]?.name && <p className="mt-1 text-xs text-slate-500">{binding.students[0].name}</p>}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  disabled={!canAuthorizeChanges || authorizeChange.isPending}
                  onClick={() => requestDeviceChange(binding.matricula)}
                  title={canAuthorizeChanges ? 'Revocar el UUID actual y permitir un nuevo vínculo' : 'Tu cuenta es de sólo lectura'}
                >
                  Autorizar cambio
                </Button>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function formatPlatform(platform: string | null) {
  if (!platform) return 'Plataforma no registrada';
  if (platform.toLowerCase() === 'ios') return 'iOS';
  if (platform.toLowerCase() === 'android') return 'Android';
  return platform;
}
