import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.SPECOPS_CORE_URL || 'http://127.0.0.1:3101',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    proxy: {
      '/api': {
        target: process.env.SPECOPS_CORE_URL || 'http://127.0.0.1:3101',
        changeOrigin: true,
      },
    },
  },
});
