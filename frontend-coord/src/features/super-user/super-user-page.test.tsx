import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '@/test/server';
import { SuperUserPage } from './super-user-page';

const databases = {
  data: {
    databases: [
      {
        id: 'integration', name: 'Integración UAT',
        description: 'Sesiones y datos locales.',
        confirmationPhrase: 'BORRAR INTEGRACION UAT',
        invalidatesSuperUserSession: false,
      },
      {
        id: 'academic', name: 'Académica',
        description: 'Profesores, materias y grupos.',
        confirmationPhrase: 'BORRAR ACADEMICA',
        invalidatesSuperUserSession: false,
      },
    ],
    all: {
      id: 'all', name: 'Todas las bases de datos',
      description: 'Borra todos los registros.',
      confirmationPhrase: 'BORRAR TODAS LAS BASES',
      invalidatesSuperUserSession: true,
    },
  },
  meta: { generatedAt: '2026-08-16T00:00:00.000Z' },
};

describe('SuperUser database administration', () => {
  it('requires the exact phrase before purging a specific database', async () => {
    let requestBody: unknown;
    server.use(
      http.get('/api/superUsuario/auth/me', () => HttpResponse.json({ data: { user: { role: 'SUPER_USER' } } })),
      http.get('/api/superUsuario/coordinadores', () => HttpResponse.json({ data: [], meta: { generatedAt: '2026-08-16T00:00:00.000Z' } })),
      http.get('/api/superUsuario/bases-datos', () => HttpResponse.json(databases)),
      http.post('/api/superUsuario/bases-datos/borrar', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({
          data: { purged: ['integration'], purgedAt: '2026-08-16T00:00:01.000Z', sessionInvalidated: false },
        });
      }),
    );
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Bases de datos' }));
    const integrationCard = (await screen.findByText('Integración UAT')).closest('div[class*="card"], article')
      ?? screen.getByText('Integración UAT').parentElement?.parentElement?.parentElement;
    expect(integrationCard).not.toBeNull();
    await user.click(within(integrationCard as HTMLElement).getByRole('button', { name: 'Borrar esta base' }));

    const confirmButton = screen.getByRole('button', { name: 'Confirmar borrado irreversible' });
    expect(confirmButton).toBeDisabled();
    await user.type(screen.getByPlaceholderText('BORRAR INTEGRACION UAT'), 'BORRAR INTEGRACION UAT');
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    await waitFor(() => expect(requestBody).toEqual({
      target: 'integration', confirmation: 'BORRAR INTEGRACION UAT',
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Borrado completado: integration');
  });
});

describe('SuperUser student beacon administration', () => {
  it('links the UUID generated on iOS to the normalized student matricula', async () => {
    let requestBody: unknown;
    server.use(
      http.get('/api/superUsuario/auth/me', () => HttpResponse.json({ data: { user: { role: 'SUPER_USER' } } })),
      http.get('/api/superUsuario/coordinadores', () => HttpResponse.json({ data: [], meta: { generatedAt: '2026-08-16T00:00:00.000Z' } })),
      http.get('/api/superUsuario/alumnos-vinculados', () => HttpResponse.json({ data: [] })),
      http.post('/api/superUsuario/alumnos-vinculados', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({
          data: {
            id: 'binding-1', matricula: '2251330008',
            attendanceUuid: '12345678-1234-4234-9234-123456789abc',
            deviceBindingId: null, platform: 'ios', deviceInfo: 'Beacon iOS manual',
            bindingVersion: 1, active: true, createdAt: '2026-08-25T12:00:00.000Z',
            updatedAt: '2026-08-25T12:00:00.000Z', students: [],
          },
        }, { status: 201 });
      }),
    );
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Alumnos vinculados' }));
    await user.type(screen.getByLabelText('Matrícula'), '2251330008');
    await user.type(screen.getByLabelText('UUID del beacon iOS'), '12345678-1234-4234-9234-123456789ABC');
    await user.click(screen.getByRole('button', { name: 'Vincular alumno' }));

    await waitFor(() => expect(requestBody).toEqual({
      matricula: '2251330008', attendanceUuid: '12345678-1234-4234-9234-123456789abc',
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Alumno 2251330008 vinculado correctamente.');
  });
});

describe('SuperUser application logs', () => {
  it('filters and expands structured mobile diagnostics', async () => {
    let requestedUrl = '';
    server.use(
      http.get('/api/superUsuario/auth/me', () => HttpResponse.json({ data: { user: { role: 'SUPER_USER' } } })),
      http.get('/api/superUsuario/coordinadores', () => HttpResponse.json({ data: [], meta: { generatedAt: '2026-09-04T10:00:00.000Z' } })),
      http.get('/api/superUsuario/logs/resumen', () => HttpResponse.json({
        data: { total: 42, last24Hours: 12, errorsLast24Hours: 3, fatalLast24Hours: 1, activeInstallationsLast24Hours: 4, byApplication: [], byLevel: [], generatedAt: '2026-09-04T10:00:00.000Z' },
      })),
      http.get('/api/superUsuario/logs', ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json({
          data: [{
            eventId: '74b29734-65a8-48b2-9e6e-8cd01f1a0016', sequence: 7, level: 'ERROR', application: 'STUDENT',
            eventName: 'ble.scan.start_failed', message: 'No se pudo iniciar el escaneo.', occurredAt: '2026-09-04T09:59:00.000Z',
            receivedAt: '2026-09-04T10:00:00.000Z', installationId: '74b29734-65a8-48b2-9e6e-8cd01f1a0017',
            appSessionId: '74b29734-65a8-48b2-9e6e-8cd01f1a0018', userIdentifier: '2251330008', appVersion: '1.2.0',
            buildNumber: '5', platform: 'android', osVersion: 'Android 15', context: { permission: 'bluetoothScan' },
          }],
          meta: { nextCursor: null, total: 1, generatedAt: '2026-09-04T10:00:00.000Z' },
        });
      }),
    );
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Logs de apps' }));
    expect(await screen.findByText('No se pudo iniciar el escaneo.')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Aplicación' }), 'STUDENT');
    await waitFor(() => expect(requestedUrl).toContain('application=STUDENT'));
    await user.click(screen.getByText('No se pudo iniciar el escaneo.'));
    expect(await screen.findByText('Android 15')).toBeInTheDocument();
    expect(screen.getByText(/bluetoothScan/)).toBeInTheDocument();
  });
});

describe('SuperUser debug roster administration', () => {
  it('assigns a previously registered student to a debug class by matricula', async () => {
    let requestBody: unknown;
    const debugClass = {
      id: 'debug-class-1', externalGroupId: '990001', code: 'DEBUG-101', groupLetter: 'DBG',
      period: '2026-3', name: 'Materia Debug', level: 'DEBUG', classroom: 'DEBUG-101',
      beaconUuid: '11111111-2222-4333-8444-555555555555', schedule: {},
      professor: { id: 'teacher-1', name: 'Profesor Demo', institutionalEmail: 'profesor@uat.edu.mx' },
      students: [], attendanceRecords: [],
    };
    server.use(
      http.get('/api/superUsuario/auth/me', () => HttpResponse.json({ data: { user: { role: 'SUPER_USER' } } })),
      http.get('/api/superUsuario/coordinadores', () => HttpResponse.json({ data: [], meta: { generatedAt: '2026-08-27T10:00:00.000Z' } })),
      http.get('/api/superUsuario/debug/status', () => HttpResponse.json({
        data: {
          enabled: true, period: '2026-3', settings: { teacherAttendanceToleranceMinutes: 10 },
          apiRestPolicy: 'Modo demo aislado.',
        },
        meta: { generatedAt: '2026-08-27T10:00:00.000Z' },
      })),
      http.get('/api/superUsuario/debug/catalog', () => HttpResponse.json({
        data: { enabled: true, settings: { teacherAttendanceToleranceMinutes: 10 }, teachers: [], students: [], classes: [], attendanceWrites: [], updatedAt: '2026-08-27T10:00:00.000Z' },
      })),
      http.get('/api/superUsuario/debug/registered-students', () => HttpResponse.json({
        data: [{
          id: 'identity-student-1', matricula: '2251330008', email: null,
          name: 'Alumno Registrado', lastAuthenticatedAt: '2026-08-27T09:00:00.000Z',
        }],
        meta: { generatedAt: '2026-08-27T10:00:00.000Z' },
      })),
      http.get('/api/superUsuario/debug/classes', () => HttpResponse.json({
        data: [debugClass], meta: { generatedAt: '2026-08-27T10:00:00.000Z' },
      })),
      http.get('/api/superUsuario/debug/student-attendance', () => HttpResponse.json({ data: [], meta: { generatedAt: '2026-08-27T10:00:00.000Z' } })),
      http.get('/api/superUsuario/debug/flow-logs', () => HttpResponse.json({ data: { syncJobs: [], attendanceRecords: [], recentBindings: [] } })),
      http.post('/api/superUsuario/debug/classes/debug-class-1/registered-students', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({
          data: debugClass,
          meta: { synchronization: { status: 'COMPLETED', attempts: 1, error: null } },
        }, { status: 201 });
      }),
    );
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Debug' }));
    const selector = await screen.findByRole('combobox', { name: 'Alumno registrado para Materia Debug' });
    await user.selectOptions(selector, '2251330008');
    await user.click(screen.getByRole('button', { name: 'Asignar registrado' }));

    await waitFor(() => expect(requestBody).toEqual({ matricula: '2251330008' }));
  });
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SuperUserPage />
    </QueryClientProvider>,
  );
}
