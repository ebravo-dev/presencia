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
