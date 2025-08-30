
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/agents/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    setupFiles: ['src/agents/__tests__/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 10000,
    teardownTimeout: 10000,
    reporter: ['verbose', 'junit'],
    outputFile: {
      junit: 'src/agents/test-results/agents-junit.xml'
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'src/agents/test-results/coverage',
      include: ['src/agents/**/*.ts'],
      exclude: ['src/agents/**/*.test.ts', 'src/agents/__tests__/**'],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/agents': path.resolve(__dirname, './src/agents'),
      '@/lib': path.resolve(__dirname, './src/lib'),
      '@/types': path.resolve(__dirname, './src/types'),
    },
    extensions: ['.ts', '.js', '.mts', '.mjs']
  },
  esbuild: {
    target: 'node18'
  },
  define: {
    'process.env.NODE_ENV': '"test"'
  }
});
