import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/config/env.js', () => ({
    env: {
        PRESENCIA_DEBUG_MODE: true,
        BACKEND_API_REST_URL: 'http://uat-integration:3100',
    },
}));

import { uatProxyRoutes } from './uat-proxy.routes.js';

describe('UAT proxy in demo mode', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('forwards authenticated UAT queries instead of limiting the proxy to login', async () => {
        const fetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ Id_Grupo: 42 }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetch);
        const app = Fastify();
        await app.register(uatProxyRoutes);

        const response = await app.inject({
            method: 'GET',
            url: '/api/uat/profesor/control-asistencia/grupos?Id_Ciclo=152',
            headers: { 'x-uat-session-id': 'session-1' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ data: [{ Id_Grupo: 42 }] });
        expect(fetch).toHaveBeenCalledWith(
            new URL('http://uat-integration:3100/api/uat/profesor/control-asistencia/grupos?Id_Ciclo=152'),
            expect.objectContaining({ method: 'GET' }),
        );
        await app.close();
    });
});
