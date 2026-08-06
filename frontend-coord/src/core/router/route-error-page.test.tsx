import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouteErrorPage } from './route-error-page';

afterEach(() => vi.restoreAllMocks());

describe('RouteErrorPage', () => {
  it('replaces the default router exception screen with recovery actions', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const router = createMemoryRouter([{
      path: '/',
      element: <BrokenPage />,
      errorElement: <RouteErrorPage />,
    }]);

    render(<RouterProvider router={router} />);

    expect(await screen.findByText('No pudimos mostrar esta sección')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recargar/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /volver al inicio/i })).toHaveAttribute('href', '/coordinacion/');
  });
});

function BrokenPage(): never {
  throw new Error('Unexpected render failure');
}
