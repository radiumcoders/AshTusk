import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, open: false },
  // three.js alone is ~600 kB minified; the whole game is one ~180 kB gzipped bundle.
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1000 },
});
