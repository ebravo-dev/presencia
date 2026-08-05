import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/core/auth/auth.store';
import { server } from '@/test/server';
import { DashboardPage } from './dashboard-page';

function renderDashboard() {
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <DashboardPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('DashboardPage', () => {
  beforeEach(() => {
    useAuthStore.getState().setUser({
      id: 'coord-1',
      email: 'coord@example.test',
      name: 'Coordinación',
      role: 'COORDINATOR',
    });
  });

  afterEach(() => useAuthStore.getState().setUser(null));

  it('muestra los conteos recibidos del backend', async () => {
    server.use(
      http.get('/api/coordinacion/resumen', () => HttpResponse.json({
        data: {
          counts: { teachers: 12, subjects: 28, assignments: 35, coordinations: 2 },
          coordinations: [{ id: 'c1', externalId: '12', name: 'Ingenieria', shortName: 'FI', teacherCount: 12, subjectCount: 28, assignmentCount: 35 }],
        },
        meta: { generatedAt: '2026-07-02T12:00:00.000Z' },
      })),
      http.get('/api/coordinacion/infraestructura/resumen', () => HttpResponse.json({
        data: { counts: { beacons: 4, studentDeviceBindings: 8, studentBleAttendances: 16, activeSubstitutions: 0 }, recentBindings: [], recentBeacons: [], recentSubstitutions: [] },
        meta: { generatedAt: '2026-07-02T12:00:00.000Z' },
      })),
      http.get('/api/coordinacion/clases-compartidas', () => HttpResponse.json({ data: [sharedClassFixture()] })),
      attendanceSettingsHandler(),
    );

    renderDashboard();

    expect(await screen.findByText('Profesores')).toBeInTheDocument();
    expect(screen.getByText('Grupos').previousElementSibling).toHaveTextContent('35');
    expect(screen.getByText('Beacons de salón').previousElementSibling).toHaveTextContent('4');
    expect(screen.getByText('Estatus de asignaciones docentes').previousElementSibling).toHaveTextContent('1');
    expect(screen.getAllByText('Coberturas de cátedra vigentes').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Profesor cobertura/)).toBeInTheDocument();
    expect(screen.queryByText('Carga por coordinacion')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /generar reporte/i })).not.toBeInTheDocument();
  });

  it('mantiene el resumen academico sin aviso cuando falla infraestructura', async () => {
    server.use(
      http.get('/api/coordinacion/resumen', () => HttpResponse.json({
        data: {
          counts: { teachers: 3, subjects: 11, assignments: 29, coordinations: 2 },
          coordinations: [{ id: 'c1', externalId: '12', name: 'Ingenieria', shortName: 'FI', teacherCount: 3, subjectCount: 11, assignmentCount: 29 }],
        },
        meta: { generatedAt: '2026-07-02T12:00:00.000Z' },
      })),
      http.get('/api/coordinacion/infraestructura/resumen', () => HttpResponse.json({ error: 'ATTENDANCE_BACKEND_UNAVAILABLE' }, { status: 502 })),
      http.get('/api/coordinacion/clases-compartidas', () => HttpResponse.json({ data: [] })),
      attendanceSettingsHandler(),
    );

    renderDashboard();

    expect(await screen.findByText('Grupos')).toBeInTheDocument();
    expect(screen.getByText('Grupos').previousElementSibling).toHaveTextContent('29');
    expect(screen.queryByText('Infraestructura temporalmente no disponible')).not.toBeInTheDocument();
  });

  it('permite al coordinador guardar la tolerancia persistida', async () => {
    let received: unknown;
    server.use(
      http.get('/api/coordinacion/resumen', () => HttpResponse.json({
        data: { counts: { teachers: 1, subjects: 1, assignments: 1, coordinations: 1 }, coordinations: [] },
        meta: { generatedAt: '2026-08-04T12:00:00.000Z' },
      })),
      http.get('/api/coordinacion/infraestructura/resumen', () => HttpResponse.json({
        data: { counts: { beacons: 0, studentDeviceBindings: 0, studentBleAttendances: 0, activeSubstitutions: 0 }, recentBindings: [], recentBeacons: [], recentSubstitutions: [] },
        meta: { generatedAt: '2026-08-04T12:00:00.000Z' },
      })),
      http.get('/api/coordinacion/clases-compartidas', () => HttpResponse.json({ data: [] })),
      attendanceSettingsHandler(),
      http.put('/api/coordinacion/configuracion/asistencia', async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({
          data: { teacherAttendanceToleranceMinutes: 18, updatedAt: '2026-08-04T12:05:00.000Z' },
        });
      }),
    );
    const user = userEvent.setup();
    renderDashboard();

    const input = await screen.findByRole('spinbutton', { name: 'Minutos de tolerancia' });
    await waitFor(() => expect(input).toHaveValue(10));
    await user.clear(input);
    await user.type(input, '18');
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    expect(await screen.findByText(/Tolerancia actualizada/)).toBeInTheDocument();
    expect(received).toEqual({ teacherAttendanceToleranceMinutes: 18 });
  });
});

function attendanceSettingsHandler() {
  return http.get('/api/coordinacion/configuracion/asistencia', () => HttpResponse.json({
    data: { teacherAttendanceToleranceMinutes: 10, updatedAt: null },
  }));
}

function sharedClassFixture() {
  return {
    id: 'shared-1',
    sourceAssignmentId: 'assignment-1',
    assignedTeacherId: 'teacher-2',
    schoolCycleYear: 2026,
    schoolCycleTerm: 1,
    active: true,
    notes: null,
    createdAt: '2026-07-02T12:00:00.000Z',
    updatedAt: '2026-07-02T12:00:00.000Z',
    assignedTeacher: {
      id: 'teacher-2',
      externalId: 'T-2',
      institutionalCode: 'T002',
      name: 'Profesor cobertura',
      email: 'cobertura@example.test',
    },
    sourceAssignment: {
      id: 'assignment-1',
      externalGroupId: 'G-1',
      groupCode: 'A',
      schoolCycleExternalId: '150',
      schoolCycleName: '2026 - 1 PRIMAVERA',
      classroom: 'AULA 1',
      educationLevel: 'LIC',
      period: '2026 - 1 PRIMAVERA',
      schedule: { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] },
      firstSeenAt: '2026-07-02T12:00:00.000Z',
      lastSeenAt: '2026-07-02T12:00:00.000Z',
      teacher: { id: 'teacher-1', externalId: 'T-1', name: 'Profesor titular' },
      subject: { id: 'subject-1', externalId: 'S-1', code: 'MAT', name: 'Matemáticas' },
      coordination: { id: 'coord-1', externalId: '12', name: 'Ingenieria' },
    },
  };
}
