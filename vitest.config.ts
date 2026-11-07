import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: { alias: { '@': process.cwd() } },
  test: { include: ['tests/*.test.ts'], setupFiles: ['./tests/setup.ts'] },
});
