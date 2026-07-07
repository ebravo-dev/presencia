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
    render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DashboardPage/></QueryClientProvider></MemoryRouter>);
    expect((await screen.findAllByText('12')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('FI')).toBeInTheDocument();
    expect(screen.getByText('Grupos mapeados').previousElementSibling).toHaveTextContent('35');
    expect(screen.queryByText('Beacons de salón')).not.toBeInTheDocument();
  });
});
