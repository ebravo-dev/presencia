import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({
    base: '/coordinacion/',
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
        port: 5173,
        proxy: { '/api': { target: 'http://localhost:3100', changeOrigin: true } },
    },
    build: {
        // Excel/PDF se cargan bajo demanda; el shell inicial se divide por dominio
        // para mejorar cache y tiempo de arranque en el despliegue Dokploy.
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
            output: {
                manualChunks: {
                    'react-vendor': ['react', 'react-dom', 'react-router-dom'],
                    'query-vendor': ['@tanstack/react-query', 'axios'],
                    'ui-vendor': ['@radix-ui/react-slot', 'lucide-react'],
                },
            },
        },
    },
    test: { environment: 'jsdom', setupFiles: './src/test/setup.ts', css: true },
});
