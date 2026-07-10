import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
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
    );

    renderDashboard();

    expect(await screen.findByText('Profesores indexados')).toBeInTheDocument();
    expect(screen.getByText('Grupos mapeados').previousElementSibling).toHaveTextContent('35');
    expect(screen.getByText('Beacons de salon').previousElementSibling).toHaveTextContent('4');
    expect(screen.queryByText('Carga por coordinacion')).not.toBeInTheDocument();
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
    );

    renderDashboard();

    expect(await screen.findByText('Grupos mapeados')).toBeInTheDocument();
    expect(screen.getByText('Grupos mapeados').previousElementSibling).toHaveTextContent('29');
    expect(screen.queryByText('Infraestructura temporalmente no disponible')).not.toBeInTheDocument();
  });
});
