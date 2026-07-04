import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { server } from '@/test/server';
import { DashboardPage } from './dashboard-page';

describe('DashboardPage', () => {
  it('muestra los conteos y cobertura recibidos del backend', async () => {
    server.use(http.get('/api/coordinacion/resumen', () => HttpResponse.json({ data: { counts: { teachers: 12, subjects: 28, assignments: 35, coordinations: 2 }, coordinations: [{ id: 'c1', externalId: '12', name: 'Ingenieria', shortName: 'FI', teacherCount: 12, subjectCount: 28, assignmentCount: 35 }] }, meta: { generatedAt: '2026-07-02T12:00:00.000Z' } })));
    server.use(http.get('/api/coordinacion/infraestructura/resumen', () => HttpResponse.json({
      data: {
        counts: { beacons: 4, studentDeviceBindings: 18, studentBleAttendances: 87, activeSubstitutions: 3 },
        recentBindings: [{ id: 'b1', matricula: '221234', attendanceUuid: 'uuid-1', deviceBindingId: null, platform: 'android', deviceInfo: null, createdAt: '2026-07-02T11:00:00.000Z', updatedAt: '2026-07-02T11:00:00.000Z', students: [{ id: 's1', matricula: '221234', name: 'Ana Ruiz', group: { code: 'g1', groupLetter: 'A', name: 'Algebra', classroom: 'A1', period: '1', professor: { name: 'Prof Uno', institutionalEmail: 'uno@uat.edu.mx' } } }] }],
        recentSubstitutions: [],
        recentBeacons: [],
      },
      meta: { generatedAt: '2026-07-02T12:05:00.000Z' },
    })));
    render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DashboardPage/></QueryClientProvider></MemoryRouter>);
    expect((await screen.findAllByText('12')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('FI')).toBeInTheDocument();
    expect(screen.getByText('Grupos mapeados').previousElementSibling).toHaveTextContent('35');
    expect(screen.getByText('Beacons de salón').previousElementSibling).toHaveTextContent('4');
    expect(screen.getByText('Celulares vinculados').previousElementSibling).toHaveTextContent('18');
    expect(screen.getByText('Ana Ruiz')).toBeInTheDocument();
  });
});
