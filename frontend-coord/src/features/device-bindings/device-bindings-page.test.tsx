import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/core/auth/auth.store';
import { server } from '@/test/server';
import { DeviceBindingsPage } from './device-bindings-page';

const binding = {
  id: 'binding-1',
  matricula: '2251330007',
  attendanceUuid: '88f639df-7d52-46ac-baf4-35cb96d1f269',
  deviceBindingId: 'device-1',
  platform: 'android',
  deviceInfo: 'Pixel de prueba',
  createdAt: '2026-08-03T12:00:00.000Z',
  updatedAt: '2026-08-03T12:00:00.000Z',
  students: [{
    id: 'student-1', matricula: '2251330007', name: 'Alumno de prueba',
    group: {
      code: 'TEST-101', groupLetter: 'A', name: 'Grupo de prueba',
      classroom: 'AULA 1', period: '2026-2',
      professor: { name: 'Profesor de prueba', institutionalEmail: 'profesor@example.test' },
    },
  }],
};

afterEach(() => {
  useAuthStore.getState().setUser(null);
  vi.restoreAllMocks();
});

describe('DeviceBindingsPage', () => {
  it('permite a coordinación autorizar el cambio y revoca el vínculo actual', async () => {
    useAuthStore.getState().setUser({
      id: 'coord-1', email: 'coord@example.test', name: 'Coordinación', role: 'COORDINATOR',
    });
    let deletedMatricula: string | null = null;
    server.use(
      http.get('/api/coordinacion/infraestructura/alumnos-vinculados', () => HttpResponse.json({ data: [binding] })),
      http.delete('/api/coordinacion/infraestructura/alumnos-vinculados/:matricula', ({ params }) => {
        deletedMatricula = String(params.matricula);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Autorizar cambio' }));

    await waitFor(() => expect(deletedMatricula).toBe('2251330007'));
    expect(await screen.findByRole('status')).toHaveTextContent('El alumno podrá vincular su nuevo celular');
  });

  it('mantiene el cambio bloqueado para cuentas de sólo lectura', async () => {
    useAuthStore.getState().setUser({
      id: 'reader-1', email: 'consulta@example.test', name: 'Consulta', role: 'READ_ONLY',
    });
    server.use(
      http.get('/api/coordinacion/infraestructura/alumnos-vinculados', () => HttpResponse.json({ data: [binding] })),
    );

    renderPage();

    expect(await screen.findByText('Cuenta de sólo lectura')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Autorizar cambio' })).toBeDisabled();
  });
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DeviceBindingsPage />
    </QueryClientProvider>,
  );
}
