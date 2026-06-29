import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// Builds web/ui (React + Tailwind + framer-motion) → web/dashboard (the static
// bundle the Node server already serves and npm already ships). base:'./' keeps
// asset URLs relative so they resolve under the token query (/?t=…).
export default defineConfig({
  root: here,
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(here, '../dashboard'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
});
