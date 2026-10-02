import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          auth: ['@clerk/clerk-react'],
          charts: ['recharts'],
          'data-forms': ['@tanstack/react-query', 'react-hook-form', 'zod'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
