import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The build goes straight into the Android assets folder, so the app stays offline.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../app/src/main/assets/www',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
  },
});
