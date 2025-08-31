
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: 'agents',
    include: ['src/agents/__tests__/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    environment: 'node',
    globals: true,
    setupFiles: ['src/agents/__tests__/setup.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    reporters: ['verbose', 'junit'],
    outputFile: {
      junit: 'src/agents/test-results/agents-junit.xml',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/agents/__tests__/',
        '**/*.d.ts',
        '**/*.test.ts',
      ],
    },
    env: {
      NODE_ENV: 'test',
      TEST_MODE: 'true',
      DATABASE_URL: 'file:./test.db',
      JWT_SECRET: 'test-jwt-secret',
      OPENAI_API_KEY: 'test-key',
      OPENAI_PROJECT_ID: 'test-project',
      OPENAI_ORG_ID: 'test-org',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  esbuild: {
    target: 'node18',
  },
});
