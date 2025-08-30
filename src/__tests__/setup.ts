/**
 * Test setup for Python Portal Executor
 * Global test configuration and utilities
 */

import { jest } from '@jest/globals';

// Set test timeout
jest.setTimeout(30000);

// Mock console methods in test environment
const originalConsole = console;

beforeAll(() => {
  // Suppress console output during tests unless explicitly enabled
  if (!process.env.ENABLE_CONSOLE_IN_TESTS) {
    console.log = jest.fn();
    console.info = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  }
});

afterAll(() => {
  // Restore console
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
});

// Global test utilities
global.testUtils = {
  /**
   * Create a delay for testing async operations
   */
  delay: (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  /**
   * Generate random test data
   */
  randomString: (length = 10): string => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },
  
  /**
   * Generate test exercise ID
   */
  randomExerciseId: (): string => {
    return `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
};

// Type declaration for global test utilities
declare global {
  var testUtils: {
    delay: (ms: number) => Promise<void>;
    randomString: (length?: number) => string;
    randomExerciseId: () => string;
  };
}

// Process cleanup
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});