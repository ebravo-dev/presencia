import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { server } from '@/test/server';
import { LoginPage } from './login-page';

describe('LoginPage', () => {
  it('presenta el error de credenciales sin almacenar un token', async () => {
    server.use(http.post('/api/coordinacion/auth/login', () => HttpResponse.json({ error: 'INVALID_COORDINATOR_CREDENTIALS' }, { status: 401 })));
    const user = userEvent.setup();
    render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><LoginPage/></QueryClientProvider></MemoryRouter>);
    await user.type(screen.getByLabelText('Correo institucional'), 'coord@uat.edu.mx');
    await user.type(screen.getByLabelText('Contraseña'), 'incorrecta');
    await user.click(screen.getByRole('button', { name: /entrar al panel/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos');
    expect(sessionStorage.length).toBe(0);
    expect(globalThis.localStorage?.length ?? 0).toBe(0);
  });
});
