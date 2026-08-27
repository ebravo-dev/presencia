import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../../core/config/env.js';

const hopByHopHeaders = new Set([
    'connection',
    'content-length',
    'host',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
]);

function buildProxyHeaders(request: FastifyRequest): Headers {
    const headers = new Headers();

    for (const [key, value] of Object.entries(request.headers)) {
        if (hopByHopHeaders.has(key.toLowerCase()) || value == null) continue;
        if (Array.isArray(value)) {
            for (const item of value) headers.append(key, item);
        } else {
            headers.set(key, String(value));
        }
    }

    headers.set('accept', 'application/json');
    return headers;
}

function buildProxyBody(request: FastifyRequest): BodyInit | undefined {
    if (request.method === 'GET' || request.method === 'HEAD') return undefined;
    if (request.body == null) return undefined;
    if (typeof request.body === 'string') return request.body;
    if (Buffer.isBuffer(request.body)) return request.body.toString('utf8');
    return JSON.stringify(request.body);
}

async function sendProxyResponse(response: Response, reply: FastifyReply) {
    const contentType = response.headers.get('content-type') ?? 'application/json';
    reply.code(response.status).header('content-type', contentType);

    if (response.status === 204) return reply.send();
    if (contentType.includes('application/json')) {
        return reply.send(await response.json());
    }

    return reply.send(await response.text());
}

export async function uatProxyRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.all('/api/uat/*', async (request, reply) => {
        const target = new URL(request.url, env.BACKEND_API_REST_URL);
        const response = await fetch(target, {
            method: request.method,
            headers: buildProxyHeaders(request),
            body: buildProxyBody(request),
        });

        return sendProxyResponse(response, reply);
    });
}
