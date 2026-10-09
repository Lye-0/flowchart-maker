import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: process.env.PAGES_BASE_PATH ?? '/flowchart-maker/',
  worker: { format: 'es' },
  server: { fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.private-reference/**', '**/.verification-report/**'] } },
});
