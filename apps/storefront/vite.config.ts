import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

const alias = {
  '@cutishop1/contracts': fileURLToPath(
    new URL('../../packages/contracts/src/index.ts', import.meta.url),
  ),
  '@cutishop1/api-client': fileURLToPath(
    new URL('../../packages/api-client/src/index.ts', import.meta.url),
  ),
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias },
  server: { port: 5173, strictPort: true },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
});
