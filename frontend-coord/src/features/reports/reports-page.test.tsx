import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '@/test/server';
import { ReportsPage } from './reports-page';

describe('ReportsPage', () => {
  it('carga la vista oficial de lunes a sábado al seleccionar un profesor', async () => {
    server.use(
      http.get('/api/coordinacion/profesores', () => HttpResponse.json({
        data: [{ id: 't1', externalId: 'e1', institutionalCode: 'FI-4829', name: 'Ada Lovelace', email: 'ada@uat.edu.mx', lastAuthenticatedAt: '2026-07-01T12:00:00Z', lastHarvestedAt: '2026-07-01T12:00:00Z', assignmentCount: 1, subjectCount: 1, coordinations: [{ id: 'c1', externalId: '12', name: 'Ciencias Básicas' }] }],
        meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
      })),
      http.get('/api/coordinacion/reportes/asistencia-semanal', () => HttpResponse.json({
        data: {
          availability: 'READY',
          teacher: { id: 't1', name: 'Ada Lovelace', email: 'ada@uat.edu.mx', institutionalCode: 'FI-4829', coordinations: [{ id: 'c1', externalId: '12', name: 'Ciencias Básicas' }] },
          week: { start: '2026-06-29', end: '2026-07-04', isoWeek: 27 },
          summary: { scheduled: 2, taken: 1, missing: 1, future: 0, unknownSchedule: 0, completionRate: 50 },
          rows: [{ id: 'r1', groupId: 'g1', groupCode: 'A', subject: 'Cálculo', classroom: 'Aula 101', educationLevel: 'Licenciatura', period: '2026-2', startTime: '07:00', endTime: '09:00', rawSchedule: '07:00 - 09:00', completionRate: 50, cells: {
            monday: cell('2026-06-29', 'TAKEN'), tuesday: cell('2026-06-30', 'NOT_SCHEDULED'), wednesday: cell('2026-07-01', 'MISSING'), thursday: cell('2026-07-02', 'NOT_SCHEDULED'), friday: cell('2026-07-03', 'NOT_SCHEDULED'), saturday: cell('2026-07-04', 'NOT_SCHEDULED'),
          } }],
        },
        meta: { generatedAt: '2026-07-04T18:00:00Z', timezone: 'America/Mexico_City' },
      })),
    );
    const user = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ReportsPage/></QueryClientProvider>);
    await user.click(await screen.findByRole('button', { name: /Ada Lovelace/i }));
    expect(await screen.findByLabelText('Vista previa del reporte de Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Sábado')).toBeInTheDocument();
    expect(screen.getByLabelText('Asistencia registrada')).toBeInTheDocument();
    expect(screen.getByLabelText('Inasistencia')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Sin clase')).toHaveLength(4);
    expect(screen.getByText('Cumpl.')).toBeInTheDocument();
    expect(screen.getAllByText('50%')).toHaveLength(2);
  });
  it('permite cambiar a reporte por rango con columnas agregadas por materia', async () => {
    server.use(
      http.get('/api/coordinacion/profesores', () => HttpResponse.json({
        data: [{ id: 't1', externalId: 'e1', institutionalCode: 'FI-4829', name: 'Ada Lovelace', email: 'ada@uat.edu.mx', lastAuthenticatedAt: '2026-07-01T12:00:00Z', lastHarvestedAt: '2026-07-01T12:00:00Z', assignmentCount: 1, subjectCount: 1, coordinations: [{ id: 'c1', externalId: '12', name: 'Ciencias BÃ¡sicas' }] }],
        meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
      })),
      http.get('/api/coordinacion/reportes/asistencia-rango', () => HttpResponse.json({
        data: {
          mode: 'range',
          availability: 'READY',
          teacher: { id: 't1', name: 'Ada Lovelace', email: 'ada@uat.edu.mx', institutionalCode: 'FI-4829', coordinations: [{ id: 'c1', externalId: '12', name: 'Ciencias BÃ¡sicas' }] },
          range: { start: '2026-04-01', end: '2026-04-30' },
          summary: { scheduledClassDays: 11, reportedClassDays: 8, missingClassDays: 3, attendanceRate: 72.73 },
          rows: [{ id: 'r1', groupId: 'g1', groupCode: 'T', grade: '2', subject: 'Calculo', classroom: 'Aula 101', educationLevel: 'Licenciatura', period: '2026-1', startTime: '07:00', endTime: '09:00', rawSchedule: '07:00 - 09:00', scheduledClassDays: 11, reportedClassDays: 8, attendanceRate: 72.73 }],
        },
        meta: { generatedAt: '2026-07-04T18:00:00Z', timezone: 'America/Mexico_City' },
      })),
    );
    const user = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ReportsPage/></QueryClientProvider>);

    await user.click(screen.getByRole('button', { name: /Rango/i }));
    await user.click(await screen.findByRole('button', { name: /Ada Lovelace/i }));

    expect(await screen.findByText('Calculo')).toBeInTheDocument();
    expect(screen.getByText('Grado')).toBeInTheDocument();
    expect(screen.getByText('Grupo')).toBeInTheDocument();
    expect(screen.getByText('Horas cubiertas')).toBeInTheDocument();
    expect(screen.getAllByText('72.73%')).toHaveLength(2);
  });
});

function cell(date: string, status: 'TAKEN' | 'MISSING' | 'NOT_SCHEDULED') {
  return {
    date,
    status,
    professorEntryAt: status === 'TAKEN' ? `${date}T07:05:00.000Z` : null,
    professorExitAt: status === 'TAKEN' ? `${date}T08:55:00.000Z` : null,
    scheduledHours: status === 'NOT_SCHEDULED' ? 0 : 2,
    attendedHours: status === 'TAKEN' ? 2 : 0,
    coverageRate: status === 'TAKEN' ? 100 : null,
    hourSlots: status === 'NOT_SCHEDULED'
      ? []
      : [
          { index: 0, startTime: '07:00', endTime: '08:00', status },
          { index: 1, startTime: '08:00', endTime: '09:00', status },
        ],
    portalSyncStatus: status === 'TAKEN' ? 'COMPLETED' : null,
    portalSyncError: null,
  };
}
