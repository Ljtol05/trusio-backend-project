
import { vi } from 'vitest';

export const createTestEnvironment = () => {
  // Save original environment
  const originalEnv = { ...process.env };
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.TEST_MODE = 'true';
  process.env.DATABASE_URL = 'file:./test.db';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.OPENAI_API_KEY = 'test-key';
  
  return {
    restore: () => {
      // Restore original environment
      process.env = originalEnv;
    },
  };
};

export const mockAsyncOperation = <T>(result: T, delay = 0): Promise<T> => {
  return new Promise((resolve) => {
    setTimeout(() => resolve(result), delay);
  });
};

export const mockFailingOperation = (errorMessage: string, delay = 0): Promise<never> => {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), delay);
  });
};

export const waitForMockCalls = async (mockFn: any, expectedCalls = 1, timeout = 1000) => {
  const startTime = Date.now();
  
  while (mockFn.mock.calls.length < expectedCalls) {
    if (Date.now() - startTime > timeout) {
      throw new Error(`Mock function was not called ${expectedCalls} times within ${timeout}ms`);
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

export const resetAllMocks = () => {
  vi.clearAllMocks();
  vi.resetAllMocks();
};
