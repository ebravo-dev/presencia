import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { server } from '@/test/server';
import { AllocationPage } from './allocation-page';

function renderAllocation() {
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AllocationPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('AllocationPage', () => {
  it('renders historical assignments whose schedule omits empty weekdays', async () => {
    server.use(
      http.get('/api/coordinacion/resumen', () => HttpResponse.json({
        data: { counts: { teachers: 1, subjects: 1, assignments: 1, coordinations: 1 }, coordinations: [] },
        meta: { generatedAt: '2026-08-06T12:00:00.000Z' },
      })),
      http.get('/api/coordinacion/profesores', () => HttpResponse.json({
        data: [teacher()], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      })),
      http.get('/api/coordinacion/profesores/teacher-1/asignaciones', () => HttpResponse.json({
        data: {
          teacher: teacher(),
          assignments: [{
            id: 'assignment-1', externalGroupId: 'group-1', groupCode: 'A',
            schoolCycleExternalId: '152', schoolCycleName: '2026 - 3 OTOÑO',
            classroom: 'AULA 1', educationLevel: 'LIC', period: '3',
            schedule: { lunes: [{ raw: '07:00-08:00', startTime: '07:00', endTime: '08:00' }] },
            firstSeenAt: '2026-08-06T12:00:00.000Z', lastSeenAt: '2026-08-06T12:00:00.000Z',
            teacher: { id: 'teacher-1', externalId: 'T-1', name: 'Profesor Prueba' },
            subject: { id: 'subject-1', externalId: 'S-1', code: 'MAT', name: 'Cálculo diferencial' },
            coordination: { id: 'coord-1', externalId: '12', name: 'Ingeniería' },
          }],
        },
        meta: { generatedAt: '2026-08-06T12:00:00.000Z' },
      })),
      http.get('/api/coordinacion/clases-compartidas/opciones', () => HttpResponse.json({ data: { teachers: [], assignments: [] } })),
      http.get('/api/coordinacion/clases-compartidas', () => HttpResponse.json({ data: [] })),
    );

    renderAllocation();

    expect(await screen.findByText('Cálculo diferencial')).toBeInTheDocument();
    expect(screen.getByText('07:00-08:00')).toBeInTheDocument();
    expect(screen.getAllByText('Sin clase')).toHaveLength(5);
  });
});

function teacher() {
  return {
    id: 'teacher-1', externalId: 'T-1', institutionalCode: 'T001', name: 'Profesor Prueba',
    email: 'profesor@example.test', lastAuthenticatedAt: '2026-08-06T12:00:00.000Z',
    lastHarvestedAt: '2026-08-06T12:00:00.000Z', assignmentCount: 1, subjectCount: 1, coordinations: [],
  };
}
