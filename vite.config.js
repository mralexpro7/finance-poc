import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server is not started standalone; server/index.js mounts Vite as Express middleware.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
});
