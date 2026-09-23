import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    // clientPort: 443 era specifico per il proxy HTTPS di AI Studio (Cloud Run).
    // Su Linux locale non serve: HMR usa la stessa porta del dev server.
    hmr: {
      port: 3000,
    },
  },
});
