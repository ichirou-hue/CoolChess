/** Vite setup for the React app and Tailwind styles. */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Явный IPv4-бинд: на Windows `localhost` может резолвиться в ::1,
  // где сокет Vite оказывается недоступен из браузера.
  // 127.0.0.1 работает везде, поэтому фиксируем его.
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
