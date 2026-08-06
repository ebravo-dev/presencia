import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { Button, Card } from '@/shared/components/ui';

export function RouteErrorPage() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`.trim()
    : 'La pantalla recibió datos que no pudo mostrar.';

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-5 dark:bg-[#101216]">
      <Card className="w-full max-w-lg p-7 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-[#C8102E] dark:bg-red-950/30">
          <AlertTriangle size={30} />
        </div>
        <h1 className="mt-5 text-2xl font-black">No pudimos mostrar esta sección</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{detail}</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Recarga la información. Si el problema continúa, vuelve al inicio e inténtalo nuevamente.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={() => window.location.reload()}><RefreshCw size={16} />Recargar</Button>
          <Button asChild variant="secondary"><a href="/coordinacion/"><Home size={16} />Volver al inicio</a></Button>
        </div>
      </Card>
    </main>
  );
}
