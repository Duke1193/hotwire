import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
  },
  server: { host: '127.0.0.1', port: 5173 },
});
