/** Vite setup for the React app and Tailwind styles. */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Явный IPv4-бинд: на Windows `localhost` может резолвиться в ::1,
  // где сокет Vite оказывается недоступен из браузера.
  // 127.0.0.1 работает везде, поэтому фиксируем его.
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Относительные /api/... и /ws/... из apiBase.ts проксируем на backend :8080.
    // Без этого фронт ходил бы напрямую на :8080 (CORS) или получал
    // TypeError "Failed to fetch" при недоступности backend.
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/ws': { target: 'ws://localhost:8080', ws: true, changeOrigin: true },
      '/health': { target: 'http://localhost:8080', changeOrigin: true },
      '/docs': { target: 'http://localhost:8080', changeOrigin: true },
      '/redoc': { target: 'http://localhost:8080', changeOrigin: true },
      '/openapi.json': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
});
